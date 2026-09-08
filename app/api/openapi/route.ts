import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "Stellar Bazaar Discovery API",
      version: "0.5.0",
      description: "Read-only discovery/MCP, deterministic conformance, append-only gated ingest, and x402 Stellar Testnet reference routes.",
    },
    servers: [{ url: "/" }],
    paths: {
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
        post: { summary: "Append an immutable operation report; owner derived from Bearer write credential", responses: { "201": { description: "Recorded" }, "200": { description: "Idempotent replay" }, "401": { description: "Unauthorized" }, "409": { description: "Operation conflict" }, "503": { description: "Durable history unavailable" } } },
      },
      "/api/mcp": {
        get: { summary: "MCP read-only health summary, including authenticated history; writes: []", responses: { "200": { description: "Capability summary" } } },
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
