# HTTP API Reference · Stellar Bazaar x402

> Nota en español: esta guía técnica está en inglés. Para la descripción general del proyecto en español, consulta [README.es.md](../README.es.md).

All 14 live endpoints, read from `app/api/*/route.ts`. Base URL is
`http://127.0.0.1:3000` locally or `https://stellar-bazaar-x402.vercel.app`.

## Conventions

**Error envelope** (REST): every failure returns `{ok: false, error: {code, message, retryable, stage, ...}}` where `stage` is one of `discover | quote | authorize | settle | call` (`lib/types.ts:41-46`) plus optional `field` / `failedRules`.

**MCP errors** are returned as JSON-RPC results with `isError: true` and the envelope serialized in `content[0].text`.

**Operator auth header**: `X-Bazaar-Provider-Key` only for explicitly enabled append-only HTTP registration. It is not provider ownership.

---

## 1. `GET /api/capabilities`

Static capability card. `200` → `{ok, capabilities}` (bazaar.capabilities/v1, `lib/pilot-cards.ts:103`). Header `Cache-Control: public, max-age=60`. No auth.

## 2. `POST /api/mcp` — MCP Streamable HTTP (JSON-RPC 2.0)

`app/api/mcp/route.ts`. Headers required: `Content-Type: application/json` and `Accept: application/json, text/event-stream` (SDK returns `406` otherwise). Methods: `initialize`, `tools/list`, `tools/call` (7 read-only tools; see [MCP_CLIENT_SETUP.md](MCP_CLIENT_SETUP.md)). Stateless — no session IDs. `DELETE` → `405` (`Allow: GET, POST`).

```bash
curl -N -X POST http://127.0.0.1:3000/api/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Successful tool calls return `{jsonrpc, id, result: {content: [{type: "text", text}], structuredContent}}`; failing ones return the same shape with `result.isError: true` and the error envelope (`{code, message, retryable, stage, field?}`) inside `content[0].text`. Known envelopes: `RESOURCE_NOT_FOUND`, `REGISTRY_UNAVAILABLE`, `INVALID_CURSOR`, `BUNDLE_NOT_FOUND`.

## 3. `GET /api/mcp` — MCP health

`200` → `{ok, name: "stellar-bazaar-discovery", version: "0.5.0", protocol: "MCP", transport: "streamable-http", mode: "read-only", endpoint: "/api/mcp", tools: [7], writes: [], paidCall: false, signing: false, custody: false}`.

## 4. `GET /api/openapi`

OpenAPI 3.1.0 document (`info.version: "0.5.0"`) describing the remediated HTTP surface.

## 5. `POST /api/publish`

Alias of `POST /api/publisher/ingest` (`app/api/publish/route.ts:1`). Same request/response/status codes as endpoint 9.

## 6. `GET /api/x402/swap-risk?pair=XLM%2FUSDC&amount=2500&side=buy` — paid x402 flow

`app/api/x402/swap-risk/route.ts`, `lib/x402-config.ts`. Quote is deterministic; supported pairs `XLM/USDC`, `AQUA/USDC`, `EURC/USDC`, `0 < amount <= 1_000_000`, `side=buy|sell` (`lib/swap-risk.ts:3-8`). Payment requirement: scheme `exact`, network `stellar:testnet`, asset `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` (USDC testnet), amount `"10000"` atomic (0.001 USDC, 7 decimals), maxTimeoutSeconds 60.

**402 challenge/retry flow:**

1. Call without `PAYMENT-SIGNATURE` → `402` body `{x402Version: 2, error: "Payment required", resource, accepts: [{scheme, network, payTo, asset, amount, maxTimeoutSeconds, extra}]}` plus header **`PAYMENT-REQUIRED`** (base64url-encoded requirements) and `Cache-Control: no-store`.
2. Client signs and retries with header **`PAYMENT-SIGNATURE`**.
3. Malformed signature → `402 MALFORMED_PAYMENT_SIGNATURE`. Fields not matching requirements → `402 PAYMENT_REQUIREMENTS_MISMATCH`.
4. Facilitator rejects verify/settle → `402` (invalidReason/invalidMessage). Facilitator unreachable → `502 VERIFY_TRANSPORT_ERROR` / `502 SETTLEMENT_TRANSPORT_ERROR`.
5. Success → `200 {ok, result, payment: {network, transaction, payer, amount, asset, recipient, facilitator}}` plus header **`PAYMENT-RESPONSE`**.

Other codes: `400 INVALID_QUOTE_INPUT` (bad params), `503 X402_SERVER_NOT_CONFIGURED` (missing `STELLAR_X402_FACILITATOR_API_KEY` / `X402_SELLER_ADDRESS`, `lib/x402-config.ts:19-24`).

**Minimal challenge example:**

```bash
curl -i "http://127.0.0.1:3000/api/x402/swap-risk?pair=XLM%2FUSDC&amount=2500&side=buy"
# 402 + PAYMENT-REQUIRED: <base64url jsonrpc header>
```

Retry with a signature (see `scripts/test-x402-client.mjs` for a scripted
client that produces one from `X402_PAYER_SECRET`):

```bash
curl -i "http://127.0.0.1:3000/api/x402/swap-risk?pair=XLM%2FUSDC&amount=2500&side=buy" \
  -H "PAYMENT-SIGNATURE: <base64url-signature>"
# 200 + PAYMENT-RESPONSE header, or 402/502 per the flow above
```

Note the quote is fixed regardless of query: `0.001 USDC` (`10000` atomic)
via the `exact` scheme — the `pair`/`amount`/`side` params only select the
deterministic risk computation and pin `inputHash` in the requirements
(`route.ts:63-83`, `lib/swap-risk.ts:4-8`).

## 7. `POST /api/x402/demo-pay` — local-only demo payer

`app/api/x402/demo-pay/route.ts`. Requires `X402_ENABLE_LOCAL_PAYER=true` else `403 LOCAL_PAYER_DISABLED`. Requires `X402_PAYER_SECRET` else `503 PAYER_SECRET_MISSING`. Signs and pays `/api/x402/swap-risk` with the configured loopback base. `200` → `{status, paymentResponsePresent, body}`; `400 LOCAL_PAYER_TARGET_REJECTED` (non-loopback base); `402 TESTNET_PAYMENT_FAILED`.

## 8. `POST /api/conformance/service-card`

`app/api/conformance/service-card/route.ts`. Body: `{...ServiceCard}`. Runs the 11-rule conformance engine (`lib/discovery.ts:76-139`). `200` → `{ok, valid: true, outcomes, certification: false, notice}`; `422` → valid false with failing outcomes (or `INVALID_SERVICE_CARD` for non-objects, `schema.shape` fail for shape errors); `400 MALFORMED_JSON`. No persistence, no auth.

## 9. `GET /api/reference/swap-risk?pair=...&amount=...&side=...`

Free (no payment) in-process reference quote (`app/api/reference/swap-risk/route.ts`). `200` → `{ok, provider, result, payment: {required: false, reason: "Instawards MVP reference flow; x402 testnet is the next milestone"}}`. `400` with error code `UNSUPPORTED_PAIR` / `INVALID_AMOUNT` / `INVALID_SIDE`.

## 10. `POST /api/publisher/ingest`

Append-only operator registration. Body: full ServiceCard. Requires `BAZAAR_ENABLE_REGISTRY_MUTATIONS=true`, durable Upstash, `BAZAAR_PROVIDER_SECRET`, and matching `X-Bazaar-Provider-Key`; otherwise it fails closed. Creation is atomic and duplicate IDs return `409 CARD_EXISTS`. Metadata remains untrusted and ownership is not certified.

```bash
curl -X POST http://127.0.0.1:3000/api/publisher/ingest \
  -H "Content-Type: application/json" \
  -H "X-Bazaar-Provider-Key: <server-operator-secret>" \
  -d @card.json    # a conformant ServiceCard (see CONFORMANCE_RULES.md)
```

## 11. `GET /api/publisher/ingest`

Disabled with `405 PROVIDER_OWNERSHIP_NOT_IMPLEMENTED`. The shared operator credential is not treated as provider identity.

## 12. `PUT /api/publisher/ingest/{id}`

Disabled with `405 PROVIDER_OWNERSHIP_NOT_IMPLEMENTED` until per-provider credentials and transactional lifecycle semantics exist.

## 13. `DELETE /api/publisher/ingest/{id}`

Disabled with `405 PROVIDER_OWNERSHIP_NOT_IMPLEMENTED` for the same fail-closed ownership boundary.

## 14. Guarded provider self-listing

`POST /api/provider-self-listing` accepts `{card, controlProof:{method,domain}}` only when `BAZAAR_ENABLE_SELF_LISTING_INTAKE=true`. It validates conformance and exact hostname control, then returns `202` with a DNS TXT or HTTPS `.well-known` challenge. Default is `503 INTAKE_DISABLED`. Body limit: 32 KiB. A successful response is still `publiclyActive:false`.

`GET /api/provider-self-listing/{id}` returns sanitized lifecycle status. `GET /api/provider-self-listing` is `405 QUEUE_NOT_PUBLIC`. Proof evaluation, review, staging and activation have no public routes. See [PROVIDER_SELF_LISTING.md](PROVIDER_SELF_LISTING.md).

## 15. Discovery (read-only, no auth)

- `GET /api/discovery/resources` — indexed catalog (static + dynamic). `200` → `{results, count, cursor: null, indexStatus: "local-mvp"}`. Filters: `kind`, `scheme`, `asset`, `network`, `maxPrice` (`app/api/discovery/resources/route.ts:10-28`).
- `GET /api/discovery/search?query=...` — lexical ranking (`app/api/discovery/search/route.ts`). `400 INVALID_QUERY` without `query`. `200` → `{ok, query, ranking: {version: "lexical-v1", method, ai: false}, results: [{resource, score, reasons}], nextCursor: null, partialResults: false}`.
- `GET /api/discovery/pilots` — 6 onboarding fixtures (`app/api/discovery/pilots/route.ts`). `200` → `{ok, results, count, indexStatus: "pilot-not-indexed", notice: {es, en}}`.
- `GET /api/discovery/external-providers/stellar-defi-quote-service` — external contract card (`app/api/discovery/external-providers/stellar-defi-quote-service/route.ts`). `200` → `{ok, resource, notice}`; `503 EXTERNAL_PROVIDER_CONFIG_INVALID` if `EXTERNAL_QUOTE_BASE_URL` is not HTTPS/loopback (`lib/external-provider.ts:14-16`).

## Status code summary

| Code | Meaning |
|---|---|
| `200` | Success (health, discovery, conformance, quotes) |
| `201` | Card registered (`/api/publisher/ingest`, `/api/publish`) |
| `400` | `MALFORMED_JSON`, `VALIDATION_FAILED`, `INVALID_QUERY`, `INVALID_QUOTE_INPUT`, `LOCAL_PAYER_TARGET_REJECTED` |
| `401` | `UNAUTHORIZED` — missing/wrong `X-Bazaar-Provider-Key` (secret configured) |
| `402` | Payment challenge (`PAYMENT-REQUIRED`) or rejection (`MALFORMED_PAYMENT_SIGNATURE`, `PAYMENT_REQUIREMENTS_MISMATCH`, facilitator reasons) |
| `403` | `LOCAL_PAYER_DISABLED` (`X402_ENABLE_LOCAL_PAYER` not `true`) |
| `405` | Method disabled/not allowed, including registry ownership operations and `DELETE /api/mcp` |
| `406` | Missing `Accept: text/event-stream` on `POST /api/mcp` |
| `409` | `CARD_EXISTS` (duplicate id) |
| `422` | Conformance failure (`valid: false`, `INVALID_SERVICE_CARD`, `schema.shape`) |
| `502` | `VERIFY_TRANSPORT_ERROR` / `SETTLEMENT_TRANSPORT_ERROR` (facilitator unreachable) |
| `503` | `X402_SERVER_NOT_CONFIGURED`, `SERVICE_NOT_CONFIGURED`, `PAYER_SECRET_MISSING`, `EXTERNAL_PROVIDER_CONFIG_INVALID` |
