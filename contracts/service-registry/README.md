# Bazaar Service Registry · Testnet Scaffold

This is a **Soroban contract scaffold**, not a deployed contract and not a payment mechanism.

It anchors a service identifier, provider public address, canonical ServiceCard SHA-256 digest, HTTPS metadata pointer, revision and lifecycle state. It intentionally stores no ServiceCard JSON, buyer brief, personal data, API key, payment authorization, token balance, escrow or wallet secret.

## Compatibility boundary

`lib/dynamic-registry.ts` computes the source-of-truth canonical deep SHA-256 digest. `lib/service-registry-spec.ts` converts its lowercase hex digest to the exact `BytesN<32>` accepted here. JSON is never re-canonicalized in Soroban.

This avoids a second JSON implementation in Rust. A future breaking change to ServiceCard canonicalization requires a new registry spec version or a migration, never a silent change.

## Lifecycle

```text
provider register -> Draft --curator--> Reviewed --curator--> Published
                                      \--curator--> Suspended --curator--> Reviewed
provider revoke -> Revoked (terminal)
```

- Provider can update **only Draft** metadata and must supply the exact previous revision.
- Curator alone performs review/publication/suspension transitions.
- Provider can revoke from any non-terminal state.
- Every mutation emits an event with service id, event kind, revision and hash/status.

## Local validation

```bash
npm run test:registry:spec
# Optional when the Soroban toolchain and cached dependencies are available:
cd contracts/service-registry && cargo test
```

No deployment command is included deliberately. Before a Testnet deployment, require an approved deployer identity, reproducible WASM build, contract test coverage, independent review, an initialized curator address, and a public migration/rollback plan.
