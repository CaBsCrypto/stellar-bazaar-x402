# Service Registry Testnet Scaffold

The Bazaar registry is an optional **metadata provenance layer**. It is not a facilitator, escrow, custody system, wallet, quality oracle, payment rail or buyer-policy engine.

## Record layout

| Field | On-chain | Purpose |
|---|---:|---|
| `service_id` | `BytesN<32>` | Contract-derived SHA-256 over domain + provider XDR + stable service key. |
| `provider` | `Address` | Provider's public Stellar identity. |
| `service_key` | `BytesN<32>` | Stable off-chain slug key; never a buyer brief or mutable card hash. |
| `card_hash` | `BytesN<32>` | SHA-256 of canonical full ServiceCard JSON. |
| `card_uri` | `Bytes` | Printable HTTPS pointer, bounded to 256 bytes and validated fail-closed. |
| `revision`, `status`, `updated_ledger` | yes | Lifecycle/provenance data. |
| ServiceCard JSON, briefs, result payloads, receipts, private keys | **no** | Remain off-chain. |

## Rules

1. The current TypeScript canonicalizer recursively sorts object keys and preserves array order. The resulting 64-char lowercase SHA-256 hex is converted directly to `BytesN<32>`.
2. Any card mutation requires a new hash and increasing revision. Registry records are not an assertion that an endpoint is secure, live or paid.
3. Provider authentication controls draft creation/update/revocation. Curator authentication controls review/publication/suspension.
4. `Revoked` is terminal. There is no delete operation; historical events remain auditable.
5. No Testnet deploy or transaction is part of this scaffold.
6. Contract errors are stable numeric values. Missing authorization is a Soroban host error, not a Bazaar contract error.
7. Reads and writes bump explicit instance/persistent TTLs; this reduces accidental expiry but does not replace a future keeper policy.

## Testnet deployment gate (future)

Only deploy after local Rust tests and the TypeScript compatibility test pass in CI, a curator public address has been approved, the compiled WASM hash is recorded, and an independent review signs off on storage, auth and event semantics. Testnet deployment must be performed by a separate, explicit change; it is intentionally not automated here.
