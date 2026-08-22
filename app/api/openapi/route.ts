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
      "/api/mcp": {
        get: { summary: "MCP read-only health summary (7 tools, writes: [])", responses: { "200": { description: "Capability summary" } } },
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
      "/api/reference/swap-risk": {
        get: { summary: "Free in-process deterministic reference quote", responses: { "200": { description: "Quote" }, "400": { description: "Invalid input" } } },
      },
      "/api/x402/swap-risk": {
        get: { summary: "x402 exact Stellar Testnet reference route", responses: { "200": { description: "Quote plus PAYMENT-RESPONSE" }, "402": { description: "PAYMENT-REQUIRED or rejection" } } },
      },
    },
  });
}
