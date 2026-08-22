# Conformance Rules · Stellar Bazaar x402

> Nota en español: esta guía técnica está en inglés. Para la descripción general del proyecto en español, consulta [README.es.md](../README.es.md).

The 11 deterministic conformance rules that every ServiceCard must pass before
it can be registered (`lib/discovery.ts:76-139`). A card is valid only when no
outcome is `fail` (`warnings` are advisory; see rule 11). These rules run on
`POST /api/conformance/service-card`, gated `POST /api/publisher/ingest`, and
MCP `validate_service_card`. MCP is read-only.

## The 11 rules

| # | Rule | What it checks | Pass condition |
|---|------|----------------|----------------|
| 1 | `schema.version` | Card schema version | `version === "bazaar.service-card/v0"` |
| 2 | `resource.kind` | Resource kind | `kind === "http" \|\| kind === "mcp"` |
| 3 | `resource.url` | SSRF guard on the base URL | Parses as URL AND (`https:` OR hostname `localhost` OR `127.0.0.1`) |
| 4 | `route.template` | Route traversal / injection guard | Starts with `/` AND no `..`, `\r`, `\n`, `#`, `@` |
| 5 | `route.inputs` | Route params are declared | Every `{param}` in `routeTemplate` exists in `input[].name` |
| 6 | `payment.network` | Network allowlist | `network === "stellar:testnet"` (MVP only) |
| 7 | `payment.scheme` | Payment scheme | `payment.scheme === "exact" \|\| "upto"` |
| 8 | `payment.amount` | Price precision and sign | Matches `^\d+(\.\d{1,7})?$` AND `Number > 0` (max 7 decimals) |
| 9 | `payment.asset` | Asset declared | `payment.asset` trimmed non-empty |
| 10 | `payment.destination` | Stellar public account | Matches `^G[A-Z2-7]{55}$` (56-char G… address) |
| 11 | `provider.description` | Discovery readability | `description.trim().length >= 20` — **warning only, never fails** |

## A valid end-to-end example card

Passes all 11 rules (checked against the engine above):

```json
{
  "version": "bazaar.service-card/v0",
  "id": "demo-oracle-feed",
  "name": "Demo Oracle Price Feed",
  "description": "Deterministic USDC price feed for Stellar testnet assets with route risk scoring.",
  "kind": "http",
  "url": "https://oracle.provider.example.com",
  "routeTemplate": "/v1/oracle/{symbol}",
  "input": [{ "name": "symbol", "type": "string", "required": true }],
  "network": "stellar:testnet",
  "payment": {
    "scheme": "exact",
    "asset": "USDC",
    "amount": "0.001",
    "destination": "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ"
  },
  "provider": { "name": "Demo Provider Corp" },
  "tags": ["oracle", "price-feed", "market-data"]
}
```

`destination` is the repo's real seller account (`.env.local`,
`README.md` evidence). To register: `POST /api/publisher/ingest` with this
body (id must be unique). Registration is not exposed through MCP.

**Dry-run without persisting** — `POST /api/conformance/service-card` returns
`{ok, valid, outcomes, certification: false}` and never writes anything
(`app/api/conformance/service-card/route.ts:22-33`):

```bash
curl -X POST http://127.0.0.1:3000/api/conformance/service-card \
  -H "Content-Type: application/json" -d @card.json
# 200 {"ok":true,"valid":true,"outcomes":[{"rule":"schema.version","status":"pass",...}, ...]}
```

A failing card returns `422` with each violated rule listed, e.g.
`{"rule":"payment.network","status":"fail","reason":"El MVP sólo acepta stellar:testnet."}`
— the Spanish reason strings are the actual engine messages from
`lib/discovery.ts:76-139`. A shape violation (wrong field types) instead
reports a single `schema.shape` outcome (`route.ts:28-32`).

## Zod shape schema (`lib/service-card-schema.ts`)

Shape is validated first (zod v4); the 11 rules run on the parsed card.

| Field | Type / constraint | Example |
|---|---|---|
| `version` | literal `"bazaar.service-card/v0"` | `"bazaar.service-card/v0"` |
| `id` | slug `^[a-z0-9]+(-[a-z0-9]+)*$` | `"demo-oracle-feed"` |
| `name` | string, min 1 | `"Demo Oracle Price Feed"` |
| `description` | string, min 1 | `"Deterministic USDC price feed..."` |
| `kind` | enum `"http" \| "mcp"` | `"http"` |
| `url` | HTTPS, or localhost/127.0.0.1 | `"https://oracle.provider.example.com"` |
| `routeTemplate` | starts with `/`, no `..` `#` `@` newlines | `"/v1/oracle/{symbol}"` |
| `input[]` | array of `{name (min 1), type: "string"\|"number"\|"boolean", required: boolean}` | `[{name: "symbol", type: "string", required: true}]` |
| `network` | literal `"stellar:testnet"` | `"stellar:testnet"` |
| `payment.scheme` | enum `"exact" \| "upto"` | `"exact"` |
| `payment.asset` | string, min 1 | `"USDC"` |
| `payment.amount` | decimal `^\d+(\.\d{1,7})?$`, must be > 0 | `"0.001"` |
| `payment.destination` | `^G[A-Z2-7]{55}$` | `"GDVR2KDK5..."` |
| `provider.name` | string, min 1 | `"Demo Provider Corp"` |
| `tags` | array of strings, each min 1 | `["oracle", "price-feed"]` |

## The placeholder trap

A destination like the USDC issuer (`GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, used in test fixtures) is format-valid but is **not an account you control** — payments settle to whoever owns it, and a random fake `G…` address is format-valid but unfunded, so settlements fail. `destination` must be a **real, funded testnet account** you control: run `npm run x402:setup-wallets` to generate and fund a payer + seller pair (friendbot funding + USDC trustlines, written to `.env.x402.local`, `scripts/setup-testnet-wallets.mjs`), then use the generated `X402_SELLER_ADDRESS`.
