> **INTERNAL** — historical/aspirational document. Not user-facing; see docs/MCP_DISCOVERY.md for current guides.
> **INTERNO** — documento histórico/aspiracional. No dirigido a usuarios; ver docs/MCP_DISCOVERY.md para las guías actuales.

# Discovery contract — working draft, not an upstream specification

> **Status note (2026-08-18, `feat/product-onboarding-mcp`):** the live registry implements a subset of this draft. Implemented today: `POST/PUT/DELETE/GET /api/publisher/ingest` with `accepted`-equivalent `indexed-dynamic`/`updated-dynamic`/`deleted-dynamic`, `rejected`-equivalent `VALIDATION_FAILED` (shape + 11 conformance rules), `CARD_EXISTS` (duplicate), `UNAUTHORIZED` and `RESOURCE_NOT_FOUND`. **Not yet implemented:** `accepted_with_warnings`, `quarantined`, and the PaymentPayload-extension ingest flow — future work.

## Resource shape

```json
{
  "id": "svc_swap_risk_v1",
  "kind": "http",
  "name": "Swap Risk Quote",
  "description": "Informational route and liquidity risk estimate.",
  "routeTemplate": "https://demo.example/v1/swap-risk/{pair}",
  "payment": {
    "network": "stellar:testnet",
    "scheme": "exact",
    "asset": "USDC",
    "amount": "0.001"
  },
  "discovery": { "version": "draft-0", "tags": ["defi", "risk"] },
  "status": "mock"
}
```

## Search response

```json
{
  "results": [{ "resource": {}, "score": 0.91, "reasons": ["intent_match"] }],
  "nextCursor": null,
  "partialResults": false,
  "rankingVersion": "poc-lexical-v1"
}
```

## Extension outcomes

| Outcome | Meaning |
|---|---|
| `accepted` | Schema and integrity checks passed |
| `accepted_with_warnings` | Searchable with non-security warnings |
| `rejected` | Deterministic invalid metadata; not indexed |
| `quarantined` | Suspicious or ambiguous; operator review required |

Candidate codes: `INVALID_SCHEMA`, `UNSUPPORTED_VERSION`, `ORIGIN_MISMATCH`, `INVALID_ROUTE_TEMPLATE`, `UNSUPPORTED_PAYMENT_SCHEME`, `DUPLICATE_RESOURCE`, `PROVENANCE_UNVERIFIED`.
