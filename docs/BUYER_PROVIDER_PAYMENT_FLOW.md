# Buyer ↔ provider payment-flow visualization

`/payment-flow` is a bilingual, local state-machine viewer. It explains the contract boundary between a buyer, Bazaar, a provider and a facilitator; it is **not** a wallet, signer, payment client, provider runner or settlement service.

## Seven states

| State | Primary actor | Observable contract | Current UI behavior |
|---|---|---|---|
| Discover | Bazaar | Service Card / MCP discovery result | Reads existing catalog metadata |
| Quote | Provider | Price, asset, scheme, network and destination declared by the card | Shows policy-relevant metadata only |
| 402 challenge | Provider | HTTP 402 + `PAYMENT-REQUIRED` | Describes the expected challenge; sends no request |
| Buyer policy authorization | Buyer | Independent allowlist, budget and card reconciliation | Local explanatory state; never signs |
| Settle | Facilitator/provider | Verify and settle against pinned requirements | No facilitator call or chain write |
| Delivery | Provider | Result only after its payment policy succeeds | No provider invocation |
| Receipt | Buyer | Reconcile network, asset, amount, destination and transaction evidence | Describes required checks; does not certify settlement |

The Swap Risk Quote card is labelled as **historical Stellar Testnet evidence**. Moving through the viewer does not replay that transaction. Website Intelligence now has one verified public x402 Testnet payment plus reconciled delivery evidence; the other external pilot cards remain payment inactive.

## Non-custodial boundary

- Bazaar does not hold buyer or provider funds.
- Bazaar does not possess wallet credentials or sign for a buyer.
- The buyer owns policy approval. A UI selection is not cryptographic authorization.
- Provider metadata is untrusted data, not certification or reputation.
- A transaction hash alone is insufficient: a buyer must reconcile the receipt with the selected card and challenge.
- No browser request, paid call, facilitator call, wallet action or provider execution is performed by this viewer.

## MCP representation

No new write or paid-call tool is exposed. Existing read-only tools carry the visualization contract:

- `get_bazaar_capabilities` includes `paymentFlow` with `mode: read-only-visualization` and all side effects set to `false`.
- `get_service` includes a `paymentFlow` snapshot for existing static and verified-pilot cards.

The stable stage schema is `bazaar.payment-flow/v1`. Protocol enums and machine IDs are not translated; human-facing titles and explanations are Spanish/English.

## Receipt readiness panel

The viewer and `get_service` show a normalized read-only projection: Testnet network, asset and atomic amount, abbreviated `payTo`, card ID/version/hash status, request/result hash status, transaction reference, delivery status and reconciliation status. The historical reference receipt is deliberately `partial-evidence` because its card, request and result hashes were not recorded; the UI displays `not-recorded` instead of fabricating them. Pilot receipts remain `inactive` / `not-started`.

## Validation

```bash
npm run typecheck
npm run test:payment-flow
npm run test:mcp:onboarding
npm run build
```

These tests use no secrets or network payment flow.

Before enabling any real Testnet action, apply the stricter [E2E Testnet readiness gate](E2E_TESTNET_READINESS_GATE.md). This visualization branch is explicitly `NO-GO` for a new settlement.
