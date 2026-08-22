# Testnet E2E readiness gate

This is the minimum **go/no-go checklist before authorizing a new Stellar Testnet settlement**. Passing the visualization tests is necessary but not sufficient. This draft PR performs no signing, payment, provider invocation or settlement.

## 1. Receipt contract — required fields

A normalized receipt must be rejected unless every field below is present and reconciles with both the selected Service Card and the received 402 challenge.

| Group | Required fields | Rule |
|---|---|---|
| Identity | `receiptVersion`, `serviceId`, `serviceCardVersion`, `serviceCardHash`, `requestId` | Exact card/version/hash and request correlation match |
| Request binding | `method`, `resourceUrl`, `challengeExpiresAt` | Exact method and canonical provider URL; challenge not expired |
| Payment | `scheme`, `network`, `assetSymbol`, `assetContract`, `atomicAmount`, `decimals`, `payTo` | Must equal the challenge and buyer policy; only `exact` + `stellar:testnet` for this gate |
| Settlement | `settlementStatus`, `transactionHash`, `ledger`, `settledAt`, `facilitator` | Status must be successful and transaction evidence independently verifiable |
| Delivery | `deliveryStatus`, `resultContentType`, `resultDigest` | Delivery must correlate with the same request and receipt |
| Privacy/display | `payerDisplay`, `payToDisplay` | UI uses shortened identifiers; raw authorization payload and secrets are forbidden |

A transaction hash alone is never sufficient. Receipt reconciliation must fail closed on a network, asset contract, amount, destination, Service Card, request binding, expiry, settlement or delivery mismatch.

## 2. Minimum live-run state labels

Before any real Testnet client is enabled, its machine states must be distinct from fixture and historical evidence:

1. `discovered`
2. `quote-inspected`
3. `402-received`
4. `policy-pending` → `policy-approved` or `policy-rejected`
5. `settlement-pending` → `settled` or `settlement-rejected`
6. `delivery-pending` → `delivered` or `delivery-failed`
7. `receipt-pending` → `receipt-reconciled` or `receipt-mismatch`

The current viewer must continue to show only `visualization-only`, `historical-testnet-evidence`, `testnet-evidence`, `buyer-controlled`, `pending-provider`, `fixture` and `inactive`. It must not emit the live success labels above.

## 3. Automated gates required before settlement

- [x] UI contract test: seven explanatory stages remain ordered and bilingual.
- [x] UI render test: page is HTTP 200 and visibly says no wallet, signing or payment.
- [x] MCP test: 7 read-only tools, 0 writes, all payment-flow side effects `false`.
- [x] Pilot test: inactive payment cannot appear settled.
- [x] Secret scan and server-only boundary checks.
- [ ] 402 contract test against the selected external provider: exact headers/body and pinned requirements.
- [ ] Buyer-policy test: wrong network, asset, amount, destination, route/method, expired challenge and over-budget request reject before signing.
- [ ] Signing isolation test: authorization occurs only in a dedicated Testnet client; no key reaches browser, MCP, logs or build output.
- [ ] Facilitator mock test: verify/settle rejection, timeout and malformed receipt fail closed.
- [ ] Receipt reconciliation test covering every required field and mismatch listed above.
- [ ] Replay test: reused authorization/receipt rejects deterministically.
- [ ] Delivery binding test: result digest/request ID must match the settled receipt.
- [ ] Manually gated Testnet preflight: pinned recipient, asset contract, amount, balances and total spend cap independently checked.

## Current decision

**NO-GO for a new Testnet settlement from this PR.** The visualization and read-only MCP gates pass, while the external-provider, signer-isolation, receipt-reconciliation and manually gated Testnet checks intentionally remain outside this UI-only branch. Disabled controls must remain disabled until those gates pass in an isolated E2E branch.
