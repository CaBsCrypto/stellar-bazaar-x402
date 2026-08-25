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
cd contracts/service-registry
cargo test --locked --offline
stellar contract build --locked --out-dir .\\out
```

## Reproducible local build matrix

The scaffold is locked to the matrix that compiled locally with the installed
Stellar CLI:

| Component | Required version / policy |
|---|---|
| Stellar CLI | `27.0.0` (records the contract's `cliver` metadata) |
| Rust / Cargo | `1.96.0` MSVC runner image; record the exact executable version in CI artifacts |
| Soroban SDK | exact `=21.7.7` |
| `soroban-env-host` | lockfile-resolved `21.2.1` |
| `ed25519-dalek` | lockfile-resolved `2.2.0` |
| target | `wasm32v1-none` via `stellar contract build` |

`Cargo.lock` is a release input and must be committed. CI and review builds use
`--locked`; restricted runners additionally use `--offline` with a pre-approved
crate cache or vendored source. Do not substitute a mutable `stable` Rust label
for the recorded compiler version. The CLI 27 build embeds protocol 21,
`rssdkver 21.7.7`, and the CLI version in the generated WASM metadata.

The previously broad `22.x` SDK constraint is intentionally not retained: it
resolved an incompatible `soroban-env-host 22.1.3` dependency on this Rust
1.96 environment. No contract source API migration was required for this
scaffold; the only build configuration addition is release overflow checking,
required by Stellar CLI 27.

No deployment command is included deliberately. Before a Testnet deployment, require an approved deployer identity, reproducible WASM build, contract test coverage, independent review, an initialized curator address, and a public migration/rollback plan.
