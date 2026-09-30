import { NextResponse } from "next/server";
import { MCP_VERSION, MCP_TOOLS, MCP_WRITES } from "@/lib/mcp-tool-contract";

const uuid = { type: "string", format: "uuid" };
const body = (name: string) => ({ required: true, content: { "application/json": { schema: { $ref: `#/components/schemas/${name}` } } } });
const human = [{ HumanAccess: [] }], agent = [{ AgentAccess: [] }], recovery = [{ RecoveryAccess: [] }];

export function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "Stellar Bazaar Discovery API",
      version: MCP_VERSION,
      description: "Public discovery and private provider/workspace MCP; conformance and operator-controlled activation. No MCP payments or signing.",
    },
    servers: [{ url: "/" }],
    "x-bazaar-mcp": { tools: MCP_TOOLS, writes: MCP_WRITES, paidCall: false, signing: false },
    components: {
      securitySchemes: {
        HumanAccess: { type:"http", scheme:"bearer", description:"Opaque human workspace access; messages + read-only history. Never payment/admin." },
        AgentAccess: { type:"http", scheme:"bearer", description:"Opaque workspace agent access; own tasks/responses/inline reports. Never payment/admin." },
        RecoveryAccess: { type:"http", scheme:"bearer", description:"Opaque bootstrap recovery secret; only own workspace creation/rotation/revocation." },
      },
      schemas: {
        WorkspaceCreation: { type:"object", additionalProperties:false, required:["creationId","humanAccessHash","agentAccessHash"], properties:{creationId:{...uuid,description:"UUID v4 conserved before send"},humanAccessHash:{type:"string",pattern:"^[a-f0-9]{64}$"},agentAccessHash:{type:"string",pattern:"^[a-f0-9]{64}$"}} },
        WorkspaceAccessChange: { oneOf:[{type:"object",additionalProperties:false,required:["action","role","accessHash","expectedGeneration"],properties:{action:{const:"rotate"},role:{enum:["human","agent"]},accessHash:{type:"string",pattern:"^[a-f0-9]{64}$"},expectedGeneration:{type:"integer",minimum:1}}},{type:"object",additionalProperties:false,required:["action","expectedGeneration"],properties:{action:{const:"revoke"},expectedGeneration:{type:"integer",minimum:1}}}] },
        ConversationCreation: { type:"object",additionalProperties:false,required:["conversationId","title"],properties:{conversationId:uuid,title:{type:"string",minLength:1,maxLength:120}} },
        HumanMessage: { type:"object",additionalProperties:false,required:["messageId","taskId","text"],properties:{messageId:uuid,taskId:uuid,text:{type:"string",minLength:1,maxLength:2000}} },
        TaskClaim: { type:"object",additionalProperties:false,required:["taskId","attemptId"],properties:{taskId:uuid,attemptId:uuid} },
        AgentResponse: { type:"object",additionalProperties:false,required:["attemptId","messageId","text"],properties:{attemptId:uuid,messageId:uuid,text:{type:"string",minLength:1,maxLength:2000},operationId:{type:"string",pattern:"^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$"}} },
      },
    },
    paths: {
      "/api/workspaces": { post: { security:recovery, requestBody:body("WorkspaceCreation"), summary: "Create or recover an open private workspace", description: "Recovery-secret Bearer; strict creationId UUIDv4, humanAccessHash and agentAccessHash SHA256. Server assigns owner and agent. Original tokens are never stored. Disabled by default; shared creation/byte limits. A revoked replay may return its tombstone with revoked:true, never restored accesses.", responses: { "201": {description:"Created"}, "200":{description:"Same creation replay or revoked tombstone"}, "409":{description:"Conditions/hash conflict"}, "410":{description:"Revoked attempt"}, "429":{description:"Shared limit reached"}, "503":{description:"Disabled or storage unavailable"} } } },
      "/api/workspaces/{id}/access": { post: { security:recovery,requestBody:body("WorkspaceAccessChange"), summary: "Rotate one role or revoke the workspace", description: "Recovery-secret Bearer for that workspace; action rotate with role human|agent, accessHash and expectedGeneration, or action revoke with expectedGeneration. No public owner reassignment.", responses: { "200":{description:"Access changed"}, "403":{description:"Wrong scope"}, "409":{description:"Generation conflict"}, "410":{description:"Revoked"} } } },
      "/api/conversations": { get: {security:[...human,...agent],summary:"List own private conversations; human or agent access",responses:{"200":{description:"Own conversations"}}}, post: {security:human,requestBody:body("ConversationCreation"),summary:"Human creates a conversation with stable UUID and title",responses:{"201":{description:"Created"},"200":{description:"Identical replay"},"409":{description:"Changed content"}}} },
      "/api/conversations/{id}/messages": { get: {security:[...human,...agent],summary:"Read an owned conversation and tasks",responses:{"200":{description:"Owned messages"},"404":{description:"Unavailable"}}}, post: {security:human,requestBody:body("HumanMessage"),summary:"Human message creates one task atomically",description:"Stable messageId and taskId UUIDs and bounded text. Agent cannot impersonate human.",responses:{"201":{description:"Message and task conserved"},"200":{description:"Replay"},"409":{description:"Content conflict"}}} },
      "/api/agent-tasks": { get: {security:agent,summary:"Agent lists own pending/claimed/responded tasks",responses:{"200":{description:"Tasks"}}}, post: {security:agent,requestBody:body("TaskClaim"),summary:"Agent claims a task with stable attemptId",description:"No lease expiry or automatic replacement attempt.",responses:{"201":{description:"Claim conserved"},"200":{description:"Same claim"},"409":{description:"Other attempt"}}} },
      "/api/agent-tasks/{id}/response": { post: {security:agent,requestBody:body("AgentResponse"),summary:"Agent registers a conserved response for the same claim",description:"attemptId, messageId, text and optional owned operationId. Server derives actor and owner.",responses:{"201":{description:"Response conserved"},"200":{description:"Same response"},"409":{description:"Conditions changed"}}} },
      "/api/deliveries": { get: { summary: "Private delivery versions by client operation ID", responses: {"200":{description:"Owned manifest versions"},"401":{description:"Unauthorized"}} }, post: {summary:"Reserve a versioned delivery manifest and file quota using write access",responses:{"201":{description:"Reserved"},"409":{description:"Version conflict or storage limit"}}}},
      "/api/deliveries/uploads": {post:{summary:"Obtain a private checksum-bound upload URL",responses:{"200":{description:"Temporary upload access"}}}},
      "/api/deliveries/confirm": {post:{summary:"Verify object size/checksum and mark it available",responses:{"200":{description:"Confirmed"},"409":{description:"Integrity mismatch"}}}},
      "/api/deliveries/access": {post:{summary:"Obtain temporary preview or download access to an owned confirmed file",responses:{"200":{description:"Five-minute access"},"409":{description:"File pending"}}}},
      "/api/activity": {
        get: { summary: "Private task, event and purchase pages or owner-scoped result download", description: "Bearer history access required. view=tasks|events|operations; limit=1..100; cursor, taskId, agentId, from/to UTC dates, status. download=1&operationId downloads a stored result. See /HISTORY_CONNECTION.md.", responses: { "200": { description: "Version 2 page with items/nextCursor/snapshot, or private attachment" }, "400": { description: "Invalid query or cursor" }, "401": { description: "Unauthorized" }, "404": { description: "Result unavailable" }, "503": { description: "Durable storage unavailable" } } },
        post: { summary: "Append an idempotent task event using owner-scoped write access", description: "eventId, taskId, mode, kind, title; optional agentId, operationId, serviceId and bounded result. Server assigns receipt time and agent-reported evidence. No payment or signing.", responses: { "201": { description: "Event recorded" }, "200": { description: "Idempotent replay" }, "400": { description: "Invalid event" }, "403": { description: "Write access required" }, "409": { description: "Conflict or capacity reached" }, "503": { description: "Durable storage unavailable" } } },
      },
      "/api/activity/connection": {
        post: { summary: "Validate that read and write accesses belong to the same owner", description: "Authorization carries read access; X-History-Write-Access carries Bearer write access. Returns only ok; creates no account or credential.", responses: { "200": { description: "Same owner" }, "403": { description: "Access mismatch or unavailable configuration" } } },
      },
      "/api/operations": {
        get: { summary: "Private owner-scoped agent journal; Bearer read or write credential required", responses: { "200": { description: "Agent-reported records, not independent settlement proof" }, "401": { description: "Unauthorized" }, "503": { description: "Durable history not configured" } } },
        post: { summary: "Append an immutable operation report; owner derived from Bearer write credential", description: "Open workspaces only permit unpaid mock/fixture inline results; human access is read-only for history. Legacy registered accesses retain their scopes. A report is agent-reported evidence, not independent payment verification.", responses: { "201": { description: "Recorded" }, "200": { description: "Idempotent replay" }, "401": { description: "Unauthorized" }, "403":{description:"Wrong scope or workspace paid/external content"}, "409": { description: "Operation conflict" }, "503": { description: "Durable history unavailable" } } },
      },
      "/api/mcp": {
        get: { summary: "MCP health with canonical tools and scoped writes", responses: { "200": { description: "Capability summary" } } },
        post: { summary: "MCP Streamable HTTP: initialize, tools/list, tools/call", responses: { "200": { description: "MCP response" } } },
      },
      "/api/discovery/resources": {
        get: { summary: "Filter indexed service cards", responses: { "200": { description: "Service cards" } } },
      },
      "/api/discovery/search": {
        get: { summary: "Deterministic lexical-v1 ranking", responses: { "200": { description: "Ranked results" }, "400": { description: "INVALID_QUERY" } } },
      },
      "/api/conformance/service-card": {
        post: { summary: "Validate shape/conformance; never provider certification", responses: { "200": { description: "Conformant" }, "422": { description: "Invalid card" } } },
      },
      "/api/publisher/ingest": {
        post: {
          summary: "Append-only operator registration; disabled by default and requires durable Redis",
          responses: {
            "201": { description: "Card created atomically" },
            "401": { description: "UNAUTHORIZED" },
            "409": { description: "CARD_EXISTS" },
            "503": { description: "SERVICE_NOT_CONFIGURED" },
          },
        },
        get: { summary: "Disabled until per-provider ownership exists", responses: { "405": { description: "PROVIDER_OWNERSHIP_NOT_IMPLEMENTED" } } },
      },
      "/api/publisher/ingest/{id}": {
        put: { summary: "Disabled until per-provider ownership exists", responses: { "405": { description: "PROVIDER_OWNERSHIP_NOT_IMPLEMENTED" } } },
        delete: { summary: "Disabled until per-provider ownership exists", responses: { "405": { description: "PROVIDER_OWNERSHIP_NOT_IMPLEMENTED" } } },
      },
      "/api/provider-self-listing": {
        post: { summary: "Submit a conformant draft to a guarded control-proof/manual-review queue; disabled by default and never auto-indexes", responses: { "202": { description: "Challenge issued; not public" }, "422": { description: "Invalid card or domain claim" }, "503": { description: "Intake disabled or queue full" } } },
        get: { summary: "Review queue is never public", responses: { "405": { description: "QUEUE_NOT_PUBLIC" } } },
      },
      "/api/provider-self-listing/{id}": {
        get: { summary: "Read sanitized submission lifecycle status", responses: { "200": { description: "Status only" }, "404": { description: "Unknown submission" } } },
      },
      "/api/reference/swap-risk": {
        get: { summary: "Free in-process deterministic reference quote", responses: { "200": { description: "Quote" }, "400": { description: "Invalid input" } } },
      },
      "/api/x402/swap-risk": {
        get: { summary: "x402 exact Stellar Testnet reference route", responses: { "200": { description: "Quote plus PAYMENT-RESPONSE" }, "402": { description: "PAYMENT-REQUIRED or rejection" } } },
      },
    },
  });
}
