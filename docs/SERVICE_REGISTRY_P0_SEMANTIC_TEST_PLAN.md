# Service Registry V1 — P0 semantic test plan

Status: plan only. No contract deployment, Testnet identity, key, payment, or
network action is implied by this file.

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

All P0 rows must be implemented as Rust tests and pass with
`cargo test --locked --offline`; `cargo fmt --check`, Clippy, a locked WASM
build, WASM SHA-256/spec capture, TypeScript vector compatibility, Next
typecheck/build, secret scan and independent auth/storage/event review must
also pass. A committed `rust-toolchain.toml` is required so CI and the approved
build environment use the same toolchain.
