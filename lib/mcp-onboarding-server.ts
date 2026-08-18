import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { services } from "./catalog";
import { rankServices, validateServiceCard } from "./discovery";
import { toServiceCard } from "./service-card";
import { pilotCapabilityCard, pilotCards } from "./pilot-cards";
import { workflowBundles } from "./workflow-bundles";
import { validateWorkflowBundle, WORKFLOW_BUNDLE_VERSION } from "./workflow-bundle";

const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  structuredContent: value as Record<string, unknown>,
});

const errorEnvelope = (
  code: string,
  message: string,
  stage: string,
  retryable: boolean = false,
  field?: string,
) => ({
  isError: true,
  content: [
    {
      type: "text" as const,
      text: JSON.stringify({
        code,
        message,
        retryable,
        stage,
        ...(field ? { field } : {}),
      }),
    },
  ],
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
    version: "0.3.0",
  });

  server.registerTool(
    "get_bazaar_capabilities",
    { description: "Read-only capability and policy card.", inputSchema: {} },
    async () => result(pilotCapabilityCard),
  );

  server.registerTool(
    "list_services",
    {
      description:
        "List active local service cards. Pilot fixtures are excluded unless includePilots is true.",
      inputSchema: { includePilots: z.boolean().optional() },
    },
    async ({ includePilots }) =>
      result({
        services: services.map((service) => ({
          ...toServiceCard(service),
          availability: {
            execution: service.id === "swap-risk-quote" ? "active-local" : "fixture-only",
            payment: service.id === "swap-risk-quote" ? "testnet-validated" : "not-active",
          },
        })),
        pilots: includePilots ? pilotCards : [],
        partialResults: false,
        nextCursor: null,
      }),
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
      const ranked = rankServices(services, query);
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

  return server;
}