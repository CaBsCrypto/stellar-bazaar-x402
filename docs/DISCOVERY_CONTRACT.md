# Discovery contract — working draft, not an upstream specification

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
    "amount": "0.025"
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
