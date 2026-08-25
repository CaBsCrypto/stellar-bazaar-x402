# Service Registry Testnet Scaffold

The Bazaar registry is an optional **metadata provenance layer**. It is not a facilitator, escrow, custody system, wallet, quality oracle, payment rail or buyer-policy engine.

## Record layout

| Field | On-chain | Purpose |
|---|---:|---|
| `service_id` | `BytesN<32>` | Stable opaque identifier; do not derive it from a buyer brief. |
| `provider` | `Address` | Provider's public Stellar identity. |
| `card_hash` | `BytesN<32>` | SHA-256 of canonical full ServiceCard JSON. |
| `card_uri` | `String` | HTTPS pointer to off-chain metadata. |
| `revision`, `status`, `updated_ledger` | yes | Lifecycle/provenance data. |
| ServiceCard JSON, briefs, result payloads, receipts, private keys | **no** | Remain off-chain. |

## Rules

1. The current TypeScript canonicalizer recursively sorts object keys and preserves array order. The resulting 64-char lowercase SHA-256 hex is converted directly to `BytesN<32>`.
2. Any card mutation requires a new hash and increasing revision. Registry records are not an assertion that an endpoint is secure, live or paid.
3. Provider authentication controls draft creation/update/revocation. Curator authentication controls review/publication/suspension.
4. `Revoked` is terminal. There is no delete operation; historical events remain auditable.
5. No Testnet deploy or transaction is part of this scaffold.

## Testnet deployment gate (future)

Only deploy after local Rust tests and the TypeScript compatibility test pass in CI, a curator public address has been approved, the compiled WASM hash is recorded, and an independent review signs off on storage, auth and event semantics. Testnet deployment must be performed by a separate, explicit change; it is intentionally not automated here.
