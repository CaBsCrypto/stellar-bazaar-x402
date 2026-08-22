# Website Intelligence — x402 exact Testnet E2E plan

Status: **contracts and offline tests only**. Execution is disabled. No wallet was generated, funded, or used; no payment was attempted in this branch.

## Contract

The planned resource is `POST /api/x402/providers/website-intelligence`. Bazaar binds the canonical `{url, language}` body, HTTP method, local resource route, and pinned upstream provider URL into a SHA-256 digest. Payment requirements are fixed to x402 v2 `exact`, `stellar:testnet`, Testnet USDC, `10000` atomic units (0.001 USDC), a separately configured seller address, and a 60-second timeout.

The public Website Intelligence provider remains an independent HTTPS service. This adapter must not describe that provider as natively x402-enabled. Provider metadata is untrusted data.

## Delivery gate

The provider result may be requested only after all of these pass:

1. Input validation before issuing 402.
2. PAYMENT-SIGNATURE requirements exactly match network, scheme, asset, amount, seller, route, method, upstream and input digest.
3. Facilitator `/verify` succeeds.
4. Facilitator `/settle` succeeds.
5. Independent ledger evidence reconciles transaction hash, network, asset, atomic amount and recipient with the accepted Service Card/payment requirements.
6. Replay protection accepts the authorization only once.

A transaction hash alone is insufficient. The runtime stays fail-closed until the independent Stellar receipt reader and durable replay store are implemented and tested.

## Wallet boundary

The future manual profile uses two distinct Testnet-only development identities: payer and seller. Secrets stay in an ignored local env file or operating-system secret storage. The payer seed is client-only; the seller seed is not needed by the Bazaar server. No `NEXT_PUBLIC_` secret is allowed. Address generation/funding is intentionally deferred until explicit execution review.

## Review checklist before any Testnet attempt

- [ ] Offline contract, tamper, binding and receipt mismatch tests pass.
- [ ] Route-level 402/verify/settle/provider-delivery/replay tests pass with a mock facilitator and mock ledger reader.
- [ ] Durable replay store and independent Stellar ledger receipt reader pass failure tests.
- [ ] Exact facilitator URL/version and official Testnet USDC contract reconfirmed.
- [ ] Two distinct public addresses reviewed; seller/asset/amount pinned.
- [ ] Secrets scan, typecheck, tests, build and audit reviewed.
- [ ] Human explicitly approves execution after seeing the above evidence.

Mainnet, custody, generic URL proxying and production claims are out of scope.
