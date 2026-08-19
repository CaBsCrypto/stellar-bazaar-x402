# Provider onboarding / Onboarding de providers

## Provider-owned boundary

The provider owns its endpoint, pricing, destination, terms, input/output contract, lifecycle and result delivery. Bazaar stores no seeds/private keys, signs nothing, custodies nothing and does not proxy arbitrary URLs. **Never submit wallet seeds, private keys, facilitator keys, auth payloads or customer data in a card.**

## Live end-to-end flow (implemented)

Draft → validate (shape + conformance) → **register** (auth + persist) → discover (REST + MCP) → update/delete (provider-owned lifecycle).

### 1. Auth: shared provider key

- Header `X-Bazaar-Provider-Key` (HTTP) or tool input `providerKey` (MCP).
- Value = `BAZAAR_PROVIDER_SECRET` env (timing-safe compare). The registry stores only `sha256(providerKey)`, never the raw key.
- Dev without the env = **open mode** (no key required). Production without it = **503 `SERVICE_NOT_CONFIGURED`** (fail-closed).

### 2. Register via HTTP

```bash
curl -X POST https://stellar-bazaar-x402.vercel.app/api/publisher/ingest \
  -H "Content-Type: application/json" \
  -H "X-Bazaar-Provider-Key: <BAZAAR_PROVIDER_SECRET>" \
  -d '{
    "version": "bazaar.service-card/v0",
    "id": "my-price-oracle",
    "name": "My Price Oracle",
    "description": "Deterministic price quotes for Stellar assets (testnet).",
    "kind": "http",
    "url": "https://oracle.example.com",
    "routeTemplate": "/v1/oracle/{symbol}",
    "input": [{ "name": "symbol", "type": "string", "required": true }],
    "network": "stellar:testnet",
    "payment": { "scheme": "exact", "asset": "USDC", "amount": "0.01",
                 "destination": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" },
    "provider": { "name": "My Provider" },
    "tags": ["oracle", "price-feed"]
  }'
```

Responses: `201 indexed-dynamic` · `400 VALIDATION_FAILED` (with `failedRules`) · `401 UNAUTHORIZED` · `409 CARD_EXISTS` · `503 SERVICE_NOT_CONFIGURED`.

### 3. Manage your cards (HTTP)

| Method | Path | Purpose | Errors |
|---|---|---|---|
| `PUT` | `/api/publisher/ingest/{id}` | Replace card (bumps `revision`) | 404 `RESOURCE_NOT_FOUND`, 400 id mismatch, 401 |
| `DELETE` | `/api/publisher/ingest/{id}` | Remove card | 404, 401 |
| `GET` | `/api/publisher/ingest` | List your own cards | 401 |

### 4. Register via MCP (agents)

The MCP server (`v0.4.0`) exposes the same registry through four tools. Example JSON-RPC:

```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "register_service",
              "arguments": { "card": { "...": "service card fields" },
                             "providerKey": "<BAZAAR_PROVIDER_SECRET>" } } }
```

Write tools: `register_service` (409 `CARD_EXISTS` on duplicates), `update_service` (404 if unknown, bumps `revision`), `delete_service` (404 if unknown), `list_my_services` (filtered by `providerKeyHash`). All use the deterministic envelope `{ code, message, retryable, stage, field? }` with `isError:true`.

### 5. Discovery

- REST: `/api/discovery/resources` and `/api/discovery/search?query=…` merge static + dynamic cards.
- MCP: `list_services`, `search_services`, `get_service` include provider-registered dynamic cards (with `registry:{ provider:true, hash, revision, registeredAt, updatedAt }` in `get_service`).

## Validation model

- **Shape** (`lib/service-card-schema.ts`, zod v4): `id` slug, `name`, `description`, `kind`, `url` (HTTPS/local), `routeTemplate`, `input[]`, `network`, `payment`, `provider.name`, `tags`.
- **Conformance** (`lib/discovery.ts`): 11 deterministic rules (10 fail-grade + 1 warning).
- Passing means **shape-valid only** — not safe, reputable or certified.

## Persistence

- Production (target): Upstash Redis (`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`) — survives redeploys.
- **Current status (2026-08-18): Upstash provisioning pending** (marketplace terms acceptance). Until `UPSTASH_REDIS_REST_*` envs exist, the registry runs on the in-memory fallback in every environment: cards are lost on redeploy/cold start. Persistence is restored as soon as the integration is provisioned — no code change needed.
- Dev fallback: in-memory registry (lost on restart).

## Human UI

`/publish` renders a live form (client-side rule outcomes) that submits to the ingest API, shows success (id/hash/revision) or `failedRules`, and lists/delete your own cards.