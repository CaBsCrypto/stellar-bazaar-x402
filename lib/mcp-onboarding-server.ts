import {demoInstructions} from "./demo-instructions.ts";
import {demoEnabled} from "./demo-wallet.ts";
import { testnetFundingInstructions } from "./testnet-funding";
import { historyConnection } from "./history-connection";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { services } from "./catalog";
import { rankServices, validateServiceCard } from "./discovery";
import { toServiceCard, toPaidService } from "./service-card";
import { pilotCapabilityCard, pilotCards, pilotSearchServices } from "./pilot-cards";
import { workflowBundles } from "./workflow-bundles";
import { validateWorkflowBundle, WORKFLOW_BUNDLE_VERSION } from "./workflow-bundle";
import { readDynamicServiceCards } from "./dynamic-registry";
import { err, ok } from "./service-ingest";
import { getPaymentFlow, paymentFlowCapability } from "./payment-flow";
import { selfListingIntakeConfigured } from "./provider-self-listing";
import { publicProviderReviewConfigured } from "./provider-submission-http";
import { reviewSharedConfigured } from "./provider-review-runtime";
import { bazaarRoles, skillPackage } from "./bazaar-skills";
import { MCP_VERSION, MCP_WRITES } from "./mcp-tool-contract";
import {registerMarketplaceTools} from './marketplace-mcp';
import {marketEnabled,marketCatalogPage,marketServiceSnapshot,marketServiceDto,sha} from './marketplace';
import {marketPage} from './market-pagination';
import {workspaceRequestOrigin} from './workspace-http';
import {workspacePublicOrigin} from './workspace-public-origin';
import {USDC_TESTNET_PAYMENT_IDENTITY} from './payment-assets';
import {marketFileCapabilities} from './market-file-delivery';
import {demoConfiguration} from './demo-configuration';
import {SELLER_LEASE_MS,SELLER_RESERVATION_MS,SELLER_DAILY_LIMIT,SELLER_PENDING_LIMIT} from './market-seller-capacity';
export interface ProviderMcpHandlers {
  submit(body: unknown): Promise<McpHttpResult>;
  status(submissionId: string): Promise<McpHttpResult>;
}
export interface McpHttpResult { ok: boolean; status: number; body: unknown; retryAfter?: number }
export interface WorkspaceMcpHandlers {
  create(body:unknown):Promise<McpHttpResult>;
  listTasks():Promise<McpHttpResult>;
  claim(body:unknown):Promise<McpHttpResult>;
  respond(taskId:string,body:unknown):Promise<McpHttpResult>;
  recordOperation(body:unknown):Promise<McpHttpResult>;
  recordActivity(body:unknown):Promise<McpHttpResult>;
}
export function mcpHttpResult(response: McpHttpResult) {
  const body = response.body && typeof response.body === "object" && !Array.isArray(response.body)
    ? response.body : { error: { code: "INVALID_HANDLER_RESPONSE" } };
  return { ...ok({ ...body, http: { status: response.status,
    ...(response.retryAfter !== undefined ? { retryAfter: response.retryAfter } : {}) } }), isError: !response.ok };
}

const result = ok;

const pilotById = new Map(pilotCards.map((card) => [card.id, card]));

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

export function createOnboardingMcpServer(readOperationHistory?: () => Promise<McpHttpResult>, provider?: ProviderMcpHandlers, workspace?:WorkspaceMcpHandlers, incoming?:Request) {
  const marketOrigin = () => incoming ? workspaceRequestOrigin(incoming) : workspacePublicOrigin() ?? 'https://context-unavailable.invalid';
  const marketFailure = (error: unknown) => errorEnvelope(error && typeof error === 'object' && 'code' in error ? String(error.code) : 'MARKET_UNAVAILABLE', 'The market request was not confirmed. Recover the saved intent before retrying effects.', 'discover', true);
  const server = new McpServer({
    name: "stellar-bazaar-discovery",
    version: MCP_VERSION,
  }, {instructions:demoInstructions});

  server.registerTool(
    "get_bazaar_capabilities",
    {
      description:
        "Capability, architecture, and policy card explaining how AI agents discover, pay, deliver, and validate services in Stellar Bazaar.",
      inputSchema: {},
    },
    async () =>
      result({
        ...pilotCapabilityCard,
        demo:{enabled:demoEnabled(),network:'stellar:testnet',guide:'/DEMO_TESTNET.md',instructions:demoInstructions,identityTool:'get_bazaar_identity',walletTools:['request_wallet_binding','complete_wallet_binding'],emailRequired:false,agentsPerAccount:1,walletsPerAccount:1,walletRequiredForNewOrders:false,queries:'bazaar-observed',queryHistoryTool:'get_bazaar_query_history',quotas:demoEnabled()?{registrationsPerDay:200,registrationsPerIpHour:200,authenticatedPerAccountMinute:60,ingressGlobalMinute:120,ingressPerIpMinute:120}:null},
        ...(marketEnabled()?{serviceStatusValues:['activated','awaiting-control-proof','pending-manual-review','withdrawn'],policy:{metadataUntrusted:true,arbitraryUrlsRejected:true,execution:'seller-external-agent'}}:{}),
        historyConnection,
        testnetFunding: { instructions: testnetFundingInstructions, automatic: false },
        writes: MCP_WRITES,
        skills: { tool: "get_bazaar_skills", roles: bazaarRoles },
        effectiveFeatures:demoConfiguration().features,
        workspace: {
          creationTool: "create_bazaar_workspace", enabled:process.env.BAZAAR_ENABLE_OPEN_WORKSPACES==='true',
          humanView:marketEnabled()?"/history":"/agent-chat", guide:"/WORKSPACE_AGENT.md", agentRunsExternally:true,
          emailRequired:false, operatorApprovalRequired:false, automaticPolling:false,
          payments:marketEnabled()&&process.env.BAZAAR_X402_MARKETPLACE_ENABLED==='true'?'x402-stellar-exact-v2':'disabled', fileUploads:marketEnabled()&&marketFileCapabilities().enabled,
          fileDelivery:{...marketFileCapabilities(),tools:['prepare_market_delivery','confirm_market_delivery','get_market_delivery'],authentication:'workspace Authorization Bearer',uploads:'paid-claimed-orders-only',generalUploads:false,guide:'/storage'},
          retention:{days:7,fixedAt:'server registration time; orders at creation',readsExtendExpiry:false,expiredContentAccess:false,paymentRecovery:'minimal technical controls; never pay again only because history expired'},
          marketplace: {enabled:marketEnabled(),catalog:'/api/market/catalog',orders:'/api/market/orders',submissionTool:'submit_market_service',submissionStatusTool:'get_market_submission',submissionPermission:{scope:'market:submit',endpoint:'/api/market/agent-permissions',grantRole:'human',generationBound:true},buyerTools:['list_market_services','get_bazaar_skills','create_market_order','get_market_order','get_market_delivery'],sellerTools:['report_market_capacity','list_market_orders','claim_market_order','prepare_market_delivery','confirm_market_delivery','deliver_market_order','fail_market_order','uncertain_market_order'],admission:{capacityTool:'report_market_capacity',capacityAuthentication:'owning workspace agent Authorization Bearer',leaseSeconds:SELLER_LEASE_MS/1000,reservationSeconds:SELLER_RESERVATION_MS/1000,pendingPerSeller:SELLER_PENDING_LIMIT,dailyPerSeller:SELLER_DAILY_LIMIT,checks:['order creation','before first payment authorization','before settlement'],unavailableStatus:503,deliveryGuarantee:false},feeBps:0,custody:false,execution:'seller-external-agent',guide:'/MARKETPLACE_PILOT.md'},
          storage:process.env.BAZAAR_WORKSPACE_BACKEND??'not-configured',
          creationAccess:"Save UUID, bootstrap/human/agent accesses privately before creation. Send hashes only; bootstrap uses Authorization. Server assigns owner.",
        },
        registry: {
          discovery: "read-only",
          mutationViaMcp: marketEnabled(),
          providerMetadataTrusted: false,
        },
        providerOnboarding: {
          guide: marketEnabled()?"/SELLER_AGENT_KIT.md":"/PROVIDER_ONBOARDING.md",
          validationTool: "validate_service_card",
          submissionEndpoint: marketEnabled()?'/api/market/services':"/api/provider-self-listing",
          submissionTool: marketEnabled()?'submit_market_service':"submit_provider_request",
          statusTool: marketEnabled()?'get_market_submission':"get_provider_request_status",
          intakeEnabled: selfListingIntakeConfigured() && (publicProviderReviewConfigured() || (!process.env.VERCEL && (!!process.env.BAZAAR_PROVIDER_REVIEW_DIR || reviewSharedConfigured()))),
          submissionStorage: reviewSharedConfigured()?"shared-redis":"local-file-pilot",
          publicIntakeEnabled: selfListingIntakeConfigured() && publicProviderReviewConfigured(),
          submissionAccess: marketEnabled()?'Save submission UUID and canonical card before POST. Use your workspace agent Bearer after the human grants market:submit; recover the same UUID with get_market_submission.':"Client saves a UUID and 32-byte token before POST; reuse the UUID and Authorization: Bearer token for recovery. Never put the token in a URL.",
          controlVerification: "authenticated-operator-dns-or-pinned-https",
          publicActivation: "separate-operator-action",
          automaticPublication: false,
          providerUsesOperatorSecret: false,
          whenUnavailable: "Keep the validated ServiceCard locally and ask the Bazaar operator for a review channel. Do not report it as submitted or published.",
        },
        architecture: {
          standard: marketEnabled() ? 'x402-stellar-exact-v2 + seller MCP delivery' : "x402 (HTTP 402 Payment Required)",
          network: "stellar:testnet",
          settlementAsset: 'USDC',
          settlementIdentity: USDC_TESTNET_PAYMENT_IDENTITY,
          ...(marketEnabled()?{newServicePrice:'provider-selected-positive-USDC-Testnet',purchaseSigning:'external-buyer-local-wallet'}:{}),
          facilitatorUrl: "https://channels.openzeppelin.com/x402/testnet",
          monetization: {
            takeRateFeeBps: process.env.BAZAAR_ENABLE_MARKETPLACE==='true' ? 0 : 100,
            defindexStaking: process.env.BAZAAR_ENABLE_MARKETPLACE==='true' ? null : "85% yield provider / 15% platform performance fee",
          },
          providerStepsToDeliver: marketEnabled() ? ['Obtain human market:submit permission; submit the fixed-price canonical card through your private agent space. Verify endpoint control and manual review.','Check your adapter and report_market_capacity through the owning agent; save reportId and observedAt before sending. Announce ready:false before a planned shutdown. The six-minute lease and limits apply across all your services.','The external buyer reserves a five-minute seat and pays its exact USDC testnet x402 challenge with a local signer. Unavailable capacity returns 503 before settlement.','Use your external seller agent to list, claim and deliver the paid order through MCP.'] : [
            "1. Expose HTTP endpoint that challenges requests without payment-signature with HTTP 402 + PAYMENT-REQUIRED header.",
            "2. Define deterministic ServiceCard manifest with name, routeTemplate, inputs, price and Stellar destination wallet.",
            "3. Validate ServiceCard conformance via validate_service_card tool or POST /api/conformance/service-card.",
            "4. Verify on-chain payment via facilitator and deliver payload with PAYMENT-RESPONSE header.",
          ],
        },
        paymentFlow: marketEnabled()?{protocol:'x402-stellar-exact-v2',asset:USDC_TESTNET_PAYMENT_IDENTITY,price:'provider-selected-positive-USDC-Testnet',atomicDecimals:7,maximumAtomic:'9223372036854775807',wallet:'external-local-signer',walletBindingRequired:false,automaticSigning:false}:paymentFlowCapability,
        operationHistory: { tool: "get_operation_history", authentication: "HTTP Authorization Bearer", endpoint: "/api/operations", evidence: "agent-reported", paymentsInitiated: false, humanApprovalRequired: false },
      }),
  );

  server.registerTool(
    "list_services",
    {
      description:
        "List active service cards (static catalog + provider-registered dynamic cards). Pilot fixtures are excluded unless includePilots is true.",
      inputSchema: { includePilots: z.boolean().optional(),limit:z.number().int().min(1).max(20).optional(),cursor:z.string().max(512).optional() },
    },
    async ({ includePilots,limit,cursor }) => {
      if(marketEnabled())try{const page=await marketCatalogPage({limit,cursor},marketOrigin());return result({services:page.services.map(({card,...metadata})=>({...card,...metadata})),pilots:[],nextCursor:page.nextCursor,partialResults:page.partialResults,dynamicRegistry:'available'});}catch(error){return marketFailure(error);}
      const registry = await readDynamicServiceCards();
      const dynamicServices = registry.entries.map((d) => toPaidService(d.card));
      return result({
        services: [...services, ...dynamicServices].map((service) => ({
          ...toServiceCard(service),
          availability: {
            execution: service.id === "swap-risk-quote" ? "active-local" : "fixture-only",
            payment: service.paymentOptions ? "pilot-unvalidated" : service.id === "swap-risk-quote" ? "testnet-validated" : "not-active",
          },
        })),
        pilots: includePilots ? pilotCards : [],
        partialResults: !registry.available,
        dynamicRegistry: registry.available ? "available" : "unavailable",
        nextCursor: null,
      });
    },
  );

  server.registerTool(
    "search_services",
    {
      description:
        "Deterministic bilingual lexical search over current service cards and verified pilot cards; no AI/reputation inference. Supports opaque cursor pagination via limit/cursor.",
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().min(1).max(20).optional(),
        cursor: z.string().optional(),
      },
    },
    async ({ query, limit, cursor }) => {
      if(marketEnabled())try{
        const snapshot=await marketServiceSnapshot(),active=snapshot.records.filter(r=>r.active),ranked=rankServices(active.map(r=>toPaidService(r.service.card)),query),matches=new Map(ranked.map(r=>[r.service.id,r]));
        const page=marketPage(active.filter(r=>matches.has(r.service.card.id)),{limit,cursor},`search:${sha(query)}`,r=>({createdAt:r.service.createdAt,id:r.service.submissionId}),r=>{const {card,...metadata}=marketServiceDto(r,false,marketOrigin()),match=matches.get(card.id)!;return {resource:card,...metadata,score:match.score,reasons:match.reasons};});
        return result({query,ranking:{version:'lexical-v1',ai:false},results:page.items,nextCursor:page.nextCursor,partialResults:page.partialResults,dynamicRegistry:'available'});
      }catch(error){return marketFailure(error);}
      const registry = await readDynamicServiceCards();
      const dynamicServices = registry.entries.map((d) => toPaidService(d.card));
      const ranked = rankServices([...services, ...dynamicServices, ...pilotSearchServices], query);
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
          resource: pilotById.get(entry.service.id) ?? toServiceCard(entry.service),
          score: entry.score,
          reasons: entry.reasons,
        })),
        partialResults: hasMore || !registry.available,
        nextCursor: hasMore ? encodeCursor(nextOffset) : null,
        dynamicRegistry: registry.available ? "available" : "unavailable",
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
      if(marketEnabled())try{const snapshot=await marketServiceSnapshot(),record=snapshot.records.find(r=>r.active&&r.service.card.id===id);if(!record)return notFound(id);const {card,...metadata}=marketServiceDto(record,false,marketOrigin());return result({resource:card,...metadata,availability:{...metadata.availability,execution:'seller-external-agent',payment:'x402-stellar-exact-v2'}});}catch(error){return marketFailure(error);}
      const registry = await readDynamicServiceCards();
      const dynamic = registry.entries.find((entry) => entry.id === id);
      if (dynamic) {
        return result({
          resource: toServiceCard(toPaidService(dynamic.card)),
          registry: {
            source: "dynamic",
            ownershipCertified: false,
            metadataTrusted: false,
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
            payment: service.paymentOptions ? "pilot-unvalidated" : id === "swap-risk-quote" ? "testnet-validated" : "not-active",
          },
          paymentFlow: getPaymentFlow(id),
        });
      }
      const pilot = pilotCards.find((item) => item.id === id);
      if (pilot) return result({ resource: pilot, paymentFlow: getPaymentFlow(id) });
      if (!registry.available) {
        return errorEnvelope(
          "REGISTRY_UNAVAILABLE",
          "Dynamic registry unavailable; static and pilot resources were checked.",
          "discover",
          true,
        );
      }
      return notFound(id);
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
    "get_operation_history",
    {
      description: "Read the authenticated owner's private agent-reported journal. Requires a history credential in the HTTP Authorization header; never pass credentials as tool arguments. No payment or approval action.",
      inputSchema: {},
    },
    async () => {
      if (!readOperationHistory) return errorEnvelope("HISTORY_UNAUTHORIZED", "History access is required.", "history");
      const response = await readOperationHistory();
      return mcpHttpResult(response);
    },
  );
  server.registerTool("get_bazaar_skills", {
    description: "Read canonical Bazaar buyer, seller and recovery instructions. Reading does not authorize effects.",
    inputSchema: { role: z.enum(bazaarRoles).optional(),limit:z.number().int().min(1).max(20).optional(),cursor:z.string().max(512).optional() }, annotations: { readOnlyHint: true },
  }, async ({ role,limit,cursor }) => {
    try {
    const page = marketEnabled() ? await marketCatalogPage({limit,cursor},marketOrigin()) : undefined;
    return result({ skills: (role ? [role] : [...bazaarRoles]).map(skillPackage), providerSkills: page?.services.filter(s=>s.card.skill).map(s=>({serviceId:s.card.id,cardHash:s.cardHash,...s.card.skill,readPrice:'free',executionPrice:s.card.payment.amount,asset:'USDC',network:'stellar:testnet',instructionsTrusted:false}))??[], nextCursor:page?.nextCursor });
    } catch(error) { return marketFailure(error); }
  });
  server.registerTool("submit_provider_request", {
    description: "Submit an authorized service request, not a publication. Save UUID, 32-byte token and frozen conditions privately before calling. Token is HTTP Authorization Bearer, never an argument. Recover the same intent after uncertainty.",
    inputSchema: z.object({ submissionId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i), card: z.record(z.string(), z.unknown()), controlProof: z.object({ method: z.enum(["dns-txt", "http-well-known"]), domain: z.string().max(253) }).strict() }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (body) => {
    if (!provider) return errorEnvelope("INTAKE_DISABLED", "Provider request context unavailable.", "discover");
    return mcpHttpResult(await provider.submit(body));
  });
  server.registerTool("get_provider_request_status", {
    description: "Read one request with its original UUID and HTTP Authorization Bearer token. Does not grant approval or access by ownerId.",
    inputSchema: z.object({ submissionId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) }).strict(), annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ submissionId }) => {
    if (!provider) return errorEnvelope("INTAKE_DISABLED", "Provider request context unavailable.", "discover");
    return mcpHttpResult(await provider.status(submissionId));
  });
  const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  const writeHints = {readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false};
  const missingWorkspace = () => errorEnvelope("WORKSPACE_UNAVAILABLE","Private workspace context unavailable.","workspace");
  server.registerTool("create_bazaar_workspace", {
    description:"Create or recover a new anonymous private space. Save credentials first. Bootstrap secret is Authorization; only credential hashes are arguments. Never supplies an existing owner or activates services.",
    inputSchema:z.object({creationId:uuid,humanAccessHash:z.string().regex(/^[a-f0-9]{64}$/),agentAccessHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),annotations:writeHints,
  },async body=>workspace?mcpHttpResult(await workspace.create(body)):missingWorkspace());
  server.registerTool("list_bazaar_agent_tasks", {
    description:"Read tasks belonging to the authenticated external agent's space. Agent credential is Authorization; no payment or execution.",
    inputSchema:z.object({}).strict(),annotations:{readOnlyHint:true,openWorldHint:false},
  },async()=>workspace?mcpHttpResult(await workspace.listTasks()):missingWorkspace());
  server.registerTool("claim_bazaar_agent_task", {
    description:"Claim one owned task with a saved attemptId. Claims never expire or authorize automatic reexecution. Execution remains with your external agent.",
    inputSchema:z.object({taskId:uuid,attemptId:uuid}).strict(),annotations:writeHints,
  },async body=>workspace?mcpHttpResult(await workspace.claim(body)):missingWorkspace());
  server.registerTool("respond_bazaar_agent_task", {
    description:"Preserve a response to the same owned claimed attempt; optional operationId must belong to this owner. Does not execute or pay.",
    inputSchema:z.object({taskId:uuid,attemptId:uuid,messageId:uuid,text:z.string().min(1).max(2000),operationId:z.string().max(128).optional()}).strict(),annotations:writeHints,
  },async({taskId,...body})=>workspace?mcpHttpResult(await workspace.respond(taskId,body)):missingWorkspace());
  server.registerTool("record_bazaar_activity", {
    description:"Register an owned bounded activity report using the native history handler. Agent access only; identifiers must remain stable on retry. No payment authority.",
    inputSchema:z.object({event:z.record(z.string(),z.unknown())}).strict(),annotations:writeHints,
  },async({event})=>workspace?mcpHttpResult(await workspace.recordActivity(event)):missingWorkspace());
  server.registerTool("record_bazaar_operation", {
    description:"Register an owned response already conserved privately, using the native operation handler. Anonymous beta only allows unpaid fixture/mock inline results. Retry registration, never the purchase.",
    inputSchema:z.object({operation:z.record(z.string(),z.unknown())}).strict(),annotations:writeHints,
  },async({operation})=>workspace?mcpHttpResult(await workspace.recordOperation(operation)):missingWorkspace());
  registerMarketplaceTools(server,incoming);
  return server;
}
