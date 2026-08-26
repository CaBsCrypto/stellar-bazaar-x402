# Service Registry V1 — P0 semantic test plan

Status: P0 core implemented locally; the Testnet deployment gate remains
closed. No deployment, identity, key, payment, or network action is implied.

## Test fixture contract

Before Rust tests are written, freeze shared vectors for a domain-separated
`service_id` and `card_hash_spec`. Each vector includes provider public address,
service slug, canonical card JSON (including nested reordering and Unicode),
expected 32-byte values, and card revision. TypeScript and Rust must consume the
same vectors. Array order is significant.

## P0 semantic cases

| Area | Required assertions |
| --- | --- |
| Initialization | Curator auth is required; initialization succeeds once; a second initialization returns a stable contract error. |
| Service identity | Same provider+slug derives the same id; distinct provider or slug differs; mutable card content never changes id. |
| Registration | Only the provider can register; duplicate id is rejected; stored fields and Draft event exactly match the input vector. |
| Draft update | Only owner; only Draft; expected revision must match; hash/URI update atomically; revision increments once; stale replay fails. |
| Curated lifecycle | Only curator; permit only Draft→Reviewed, Reviewed→Published/Suspended, Published→Suspended and Suspended→Reviewed; reject all others. |
| Revocation | Only provider; any non-revoked status may revoke; Revoked is terminal for update/status/revoke. |
| Events | Register, update, status and revoke publish expected topic/value shape and never include full card, brief, result or secret. |
| Storage | Persistent record uses an explicit TTL extension policy; read/update/status/revoke extend it; expiry behavior is tested deterministically. |
| URI/errors | URI policy rejects oversized/non-HTTPS/PII-like values; all rejected transitions use stable `contracterror` codes, not panic text. |

## Required properties

- A record's provider, service id and revision history cannot be mutated by an
  unauthorized actor.
- Revision is monotonically increasing and no accepted operation returns it to a
  previous value.
- Revocation and invalid transitions cannot create a second terminal event.
- The contract never holds or transfers a token, and its emitted data is public
  provenance only.

## Candidate-to-Testnet gate

The branch now implements the P0 core with typed errors, provider/curator auth,
domain-separated identity, HTTPS URI policy, checked revision, terminal
revocation and explicit TTL bumps. Shared TypeScript/Rust identity vectors and
a pinned CI toolchain are included. Before Testnet, still require exact event
snapshot assertions, expiry/keeper simulation, Stellar CLI spec capture,
recorded WASM SHA-256 and independent auth/storage/event review.
