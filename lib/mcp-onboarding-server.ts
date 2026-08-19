import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { services } from "./catalog";
import { rankServices, validateServiceCard } from "./discovery";
import { toServiceCard, toPaidService } from "./service-card";
import { pilotCapabilityCard, pilotCards } from "./pilot-cards";
import { workflowBundles } from "./workflow-bundles";
import { validateWorkflowBundle, WORKFLOW_BUNDLE_VERSION } from "./workflow-bundle";
import { getAllDynamicServiceCards } from "./dynamic-registry";
import { createService, deleteService, err, listMyServices, ok, updateService } from "./service-ingest";

const result = ok;

const errorEnvelope = (
  code: string,
  message: string,
  stage: string,
  retryable: boolean = false,
  field?: string,
) =>
  err({
    code: code as never,
    message,
    retryable,
    stage: stage as "discover",
    ...(field ? { field } : {}),
  });

const notFound = (id: string) =>
  errorEnvelope("RESOURCE_NOT_FOUND", `Unknown service id: ${id}`, "discover");

const PAGE_LIMIT_MAX = 50;
const encodeCursor = (offset: number) =>
  Buffer.from(String(offset)).toString("base64url");
const decodeCursor = (raw: string): number | null => {
  try {
    const parsed = Number(Buffer.from(raw, "base64url").toString());
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  } catch {
    return null;
  }
};

export function createOnboardingMcpServer() {
  const server = new McpServer({
    name: "stellar-bazaar-discovery",
    version: "0.4.0",
  });

  server.registerTool(
    "get_bazaar_capabilities",
    {
      description:
        "Capability and policy card: read-only discovery plus registry writes (register/update/delete service cards).",
      inputSchema: {},
    },
    async () =>
      result({
        ...pilotCapabilityCard,
        writes: ["register_service", "update_service", "delete_service", "list_my_services"],
        registry: {
          persistence: "upstash-redis-or-memory",
          providerAuth: "shared-secret",
        },
      }),
  );

  server.registerTool(
    "list_services",
    {
      description:
        "List active service cards (static catalog + provider-registered dynamic cards). Pilot fixtures are excluded unless includePilots is true.",
      inputSchema: { includePilots: z.boolean().optional() },
    },
    async ({ includePilots }) => {
      const dynamicServices = (await getAllDynamicServiceCards()).map((d) => toPaidService(d.card));
      return result({
        services: [...services, ...dynamicServices].map((service) => ({
          ...toServiceCard(service),
          availability: {
            execution: service.id === "swap-risk-quote" ? "active-local" : "fixture-only",
            payment: service.id === "swap-risk-quote" ? "testnet-validated" : "not-active",
          },
        })),
        pilots: includePilots ? pilotCards : [],
        partialResults: false,
        nextCursor: null,
      });
    },
  );

  server.registerTool(
    "search_services",
    {
      description:
        "Deterministic lexical search over current service cards; no AI/reputation inference. Supports opaque cursor pagination via limit/cursor.",
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().min(1).max(PAGE_LIMIT_MAX).optional(),
        cursor: z.string().optional(),
      },
    },
    async ({ query, limit, cursor }) => {
      const dynamicServices = (await getAllDynamicServiceCards()).map((d) => toPaidService(d.card));
      const ranked = rankServices([...services, ...dynamicServices], query);
      const pageSize = limit ?? ranked.length;
      const offset = cursor === undefined ? 0 : decodeCursor(cursor);
      if (offset === null) {
        return errorEnvelope(
          "INVALID_CURSOR",
          "Cursor malformed or out of range; restart pagination without cursor.",
          "search",
          true,
          "cursor",
        );
      }
      const page = ranked.slice(offset, offset + pageSize);
      const nextOffset = offset + pageSize;
      const hasMore = nextOffset < ranked.length;
      return result({
        query,
        ranking: { version: "lexical-v1", ai: false },
        results: page.map((entry) => ({
          resource: toServiceCard(entry.service),
          score: entry.score,
          reasons: entry.reasons,
        })),
        partialResults: hasMore,
        nextCursor: hasMore ? encodeCursor(nextOffset) : null,
      });
    },
  );

  server.registerTool(
    "get_service",
    {
      description: "Inspect a service or pilot by machine-stable ID.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const dynamicEntries = await getAllDynamicServiceCards();
      const dynamic = dynamicEntries.find((entry) => entry.id === id);
      if (dynamic) {
        return result({
          resource: toServiceCard(toPaidService(dynamic.card)),
          registry: {
            provider: true,
            hash: dynamic.hash,
            revision: dynamic.revision,
            registeredAt: dynamic.registeredAt,
            updatedAt: dynamic.updatedAt,
          },
        });
      }
      const service = services.find((item) => item.id === id);
      if (service) {
        return result({
          resource: toServiceCard(service),
          availability: {
            execution: id === "swap-risk-quote" ? "active-local" : "fixture-only",
            payment: id === "swap-risk-quote" ? "testnet-validated" : "not-active",
          },
        });
      }
      const pilot = pilotCards.find((item) => item.id === id);
      return pilot ? result({ resource: pilot }) : notFound(id);
    },
  );

  const knownBundleServiceIds = [
    ...services.map((s) => s.id),
    ...pilotCards.map((p) => p.id),
  ];

  server.registerTool(
    "list_workflow_bundles",
    {
      description:
        "List read-only workflow bundle fixtures. Composition model only; no runner, execution or payment.",
      inputSchema: {},
    },
    async () =>
      result({
        bundles: workflowBundles.map((bundle) => ({
          id: bundle.id,
          version: bundle.version,
          title: bundle.title,
          status: bundle.status,
          stageCount: bundle.stages.length,
          aggregateStatus: bundle.aggregatePrice.status,
          execution: false,
        })),
        partialResults: false,
        nextCursor: null,
      }),
  );

  server.registerTool(
    "get_workflow_bundle",
    {
      description:
        "Inspect a workflow bundle fixture by machine-stable ID with deterministic conformance outcomes.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const bundle = workflowBundles.find((item) => item.id === id);
      if (!bundle) {
        return errorEnvelope(
          "BUNDLE_NOT_FOUND",
          `Unknown workflow bundle id: ${id}`,
          "discover",
          false,
          "id",
        );
      }
      return result({
        bundle,
        conformance: validateWorkflowBundle(bundle, knownBundleServiceIds),
        certification: false,
        execution: false,
        schemaVersion: WORKFLOW_BUNDLE_VERSION,
      });
    },
  );

  server.registerTool(
    "validate_service_card",
    {
      description:
        "Deterministic shape checks only; never provider certification.",
      inputSchema: { card: z.record(z.string(), z.unknown()) },
    },
    async ({ card }) => {
      try {
        const outcomes = validateServiceCard(card as never);
        return result({
          valid: !outcomes.some((x) => x.status === "fail"),
          outcomes,
          certification: false,
        });
      } catch {
        return result({
          valid: false,
          outcomes: [
            { rule: "schema.shape", status: "fail", reason: "Malformed service card" },
          ],
          certification: false,
        });
      }
    },
  );

  server.registerTool(
    "register_service",
    {
      description:
        "Register a provider-owned ServiceCard into the Bazaar registry (persisted). Duplicate id returns CARD_EXISTS.",
      inputSchema: {
        card: z.record(z.string(), z.unknown()),
        providerKey: z.string().min(1).optional(),
      },
    },
    async ({ card, providerKey }) => {
      const created = await createService(card, providerKey);
      if (!created.ok) return errorEnvelope(created.error.code, created.error.message, created.error.stage, created.error.retryable, created.error.field);
      return result({
        status: "indexed-dynamic",
        id: created.entry.id,
        card: created.entry.card,
        hash: created.entry.hash,
        revision: created.entry.revision,
        registeredAt: created.entry.registeredAt,
        outcomes: created.outcomes,
      });
    },
  );

  server.registerTool(
    "update_service",
    {
      description:
        "Replace a registered ServiceCard by id (same provider key required). Bumps revision; 404 if unknown.",
      inputSchema: {
        id: z.string().min(1),
        card: z.record(z.string(), z.unknown()),
        providerKey: z.string().min(1).optional(),
      },
    },
    async ({ id, card, providerKey }) => {
      const updated = await updateService(id, card, providerKey);
      if (!updated.ok) return errorEnvelope(updated.error.code, updated.error.message, updated.error.stage, updated.error.retryable, updated.error.field);
      return result({
        status: "updated-dynamic",
        id: updated.entry.id,
        card: updated.entry.card,
        hash: updated.entry.hash,
        revision: updated.entry.revision,
        registeredAt: updated.entry.registeredAt,
        updatedAt: updated.entry.updatedAt,
        outcomes: updated.outcomes,
      });
    },
  );

  server.registerTool(
    "delete_service",
    {
      description:
        "Remove a registered ServiceCard by id (same provider key required). 404 if unknown.",
      inputSchema: {
        id: z.string().min(1),
        providerKey: z.string().min(1).optional(),
      },
    },
    async ({ id, providerKey }) => {
      const deleted = await deleteService(id, providerKey);
      if (!deleted.ok) return errorEnvelope(deleted.error.code, deleted.error.message, deleted.error.stage, deleted.error.retryable, deleted.error.field);
      return result({
        status: "deleted-dynamic",
        id: deleted.deleted.id,
        deletedCard: deleted.deleted.card,
        revision: deleted.deleted.revision,
      });
    },
  );

  server.registerTool(
    "list_my_services",
    {
      description:
        "List service cards registered with the same provider key (dev mode: all dynamic cards).",
      inputSchema: { providerKey: z.string().min(1).optional() },
    },
    async ({ providerKey }) => {
      const listed = await listMyServices(providerKey);
      if (!listed.ok) return errorEnvelope(listed.error.code, listed.error.message, listed.error.stage, listed.error.retryable);
      return result({
        services: listed.entries.map((entry) => ({
          id: entry.id,
          hash: entry.hash,
          revision: entry.revision,
          registeredAt: entry.registeredAt,
          updatedAt: entry.updatedAt,
          card: entry.card,
        })),
        count: listed.entries.length,
      });
    },
  );

  return server;
}