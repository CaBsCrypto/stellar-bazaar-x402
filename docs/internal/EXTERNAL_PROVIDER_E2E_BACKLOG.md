# External provider E2E backlog and status

Branch: `feat/external-provider-e2e`. The CI/mock profile and Bazaar's external contract/discovery surfaces are implemented without changing the standalone Quote repository. The real external Testnet profile remains blocked because the provider has no deployment and publicly declares payments/MCP transport unavailable.

## Boundary

Bazaar connects to the standalone Stellar DeFi Quote Service exclusively through public HTTP, x402 v2, and service-card contracts. No copied provider implementation, shared source tree, shared payer/seller secrets, private imports, custody, or implicit trust relationship.

## Acceptance flow

1. Standalone Quote provider exposes a protected deterministic quote endpoint.
2. A validated Bazaar service card points to that public endpoint and declares exact Testnet network, SEP-41 asset, amount, destination, method, route and schemas.
3. An independent buyer discovers the card through Bazaar search/list APIs.
4. The buyer calls the provider directly and receives standards-compliant HTTP 402 plus `PAYMENT-REQUIRED`.
5. The buyer creates an x402 `exact` Stellar Testnet authorization and retries with `PAYMENT-SIGNATURE`.
6. The provider verifies/settles through the configured facilitator and returns the structured quote plus `PAYMENT-RESPONSE`.
7. Bazaar ingests or receives the public receipt, validates it against the selected card/request, and renders a normalized, redacted receipt without claiming custody or delivery.

## Test profiles

### Default CI — no real secrets

- Run Bazaar, provider and independent buyer as separate processes/packages.
- Use a deterministic mocked facilitator implementing `/supported`, `/verify`, and `/settle` fixtures.
- Assert no secret variables are required and no network write occurs.
- Contract-test service-card, 402 headers, request binding, structured quote and normalized receipt.

### Manual Testnet — explicitly gated

- Script name proposal: `scripts/e2e-external-provider-testnet.mjs`.
- Require `RUN_EXTERNAL_X402_TESTNET=1` plus ignored local env; fail closed otherwise.
- Preflight network, exact asset, amount, destination, balances and facilitator support.
- Cap payment count/amount, print only public addresses and receipt fields, never seeds/API keys/auth payloads.
- Save sanitized evidence: transaction hash, ledger, timestamp, amount/asset/network, shortened parties, HTTP states and provider result hash.

## Negative matrix

- No payment → deterministic 402.
- Wrong network, asset, payTo or amount → reject before result delivery.
- Tampered signature/auth entry → reject.
- Expired authorization and replay → facilitator/provider reject without second delivery.
- Provider unavailable/timeout → structured retryable transport error; never imply payment success.
- Receipt mismatch against service card/request/result → quarantine/reject normalization.
- Malformed or hostile metadata/route template → conformance failure or soft drop according to catalog policy.

## Deliverables and sequencing

- Public contract fixtures and schemas shared only by published format, not secrets or provider code.
- CI orchestration, mocked facilitator, independent buyer, negative tests and receipt normalizer.
- Manually gated Testnet walkthrough and sanitized evidence template.
- Update docs/claim matrix: local CI evidence vs Testnet validation vs public/production availability.

Before enabling the manual settlement runner, require the standalone provider to publish its exact public HTTPS URL and versioned x402 service card with approved destination/price. Re-run security baselines and retain the existing Testnet budget controls.
