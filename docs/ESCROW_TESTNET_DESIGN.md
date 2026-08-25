# Opt-in escrow design — Stellar Testnet

> Status: design and local acceptance tests only. This document does **not** add
> Soroban code, wallets, a deployment, funds, a facilitator, or a network call.

## Decision

Stellar Bazaar remains non-custodial by default: x402 settles directly from
buyer to provider. Escrow is a future, explicitly opt-in protocol for an
asynchronous job where direct settlement alone is insufficient. It is not a
replacement for x402 `exact`, and must never be silently selected by Bazaar.

The first implementation target, after a separate review, is a **Testnet-only
Soroban contract**. It must use its own contract address and token balance; the
Bazaar application, facilitator and provider do not receive custody of buyer
funds.

## Contract boundary

### On-chain escrow contract owns

- one job identifier and its immutable payment terms;
- buyer and provider public addresses;
- one allowlisted SEP-41 token, exact atomic amount and expiry ledger/time;
- the state transition, release or refund event.

### Bazaar and providers own off-chain

- Service Card, discovery, pricing display and provider identity UX;
- work inputs, result payloads, hashes, polling and delivery evidence;
- receipt display and reconciliation against an escrow event;
- all quality assessment and human support.

No result hash or personal/user content should be stored on-chain. A future
anchor may store a hash only after a separate privacy review.

## Constrained state machine

| State | Who may enter it | Allowed next state | Notes |
|---|---|---|---|
| `proposed` | buyer | `funded`, `cancelled` | Created with immutable terms; no token transfer yet. |
| `funded` | buyer deposit succeeds | `released`, `refunded` | Token amount is held by the contract. |
| `released` | buyer only | terminal | Transfers the exact amount to provider. Delivery quality is not certified. |
| `refunded` | buyer after expiry or provider before work starts | terminal | Transfers the exact amount back to buyer. |
| `cancelled` | buyer before funding | terminal | No funds were accepted. |

There is deliberately no `disputed`, `arbitrated`, `partial-release`,
`operator-release` or `Bazaar-release` state. This excludes subjective quality
judgment, support custody and partial accounting from the first version.

### Required guards

1. `fund` only from `proposed`, only buyer authorization, only exact token and
   exact atomic amount, only before expiry.
2. `release` only from `funded`, only buyer authorization, only once.
3. `refund` only from `funded`, only after expiry by buyer; provider may refund
   before expiry only if the design exposes this explicit, no-fee path.
4. Every terminal transition emits an event containing job id, state, token,
   amount, buyer and provider; never a secret, result or private input.
5. No arbitrary token transfers, administrator drain, mutable recipient,
   mutable amount, or upgrade authority in the Testnet prototype.

## Threat model and mitigations

| Threat | Required mitigation | Out of scope |
|---|---|---|
| Provider does not deliver | Buyer-controlled release; expiry refund | Determining result quality |
| Buyer refuses after valid work | Do not promise provider protection in v1; use direct x402 for synchronous work | Arbitration/disputes |
| Wrong token/amount/recipient | Immutable terms and exact checks | Multi-token baskets |
| Replay/double release/refund | One-way state transitions and terminal guards | Off-chain job retries |
| Expiry race | Define one canonical ledger/time source and test both boundary sides | Cross-chain clocks |
| Token callback/reentrancy-like effects | Checks-effects-interactions ordering; post-transfer terminal state; Soroban auth tests | General token compatibility claims |
| Operator/Bazaar custody | No operator release path or privileged withdrawal | Customer support recovery |
| Private inputs/result leakage | Keep content off-chain; events carry only public payment metadata | Full confidential computation |
| Contract bug or upgrade | Testnet only; independent review and audit before Mainnet | Mainnet guarantee |

## Acceptance gates

### Before contract code

- This design test passes locally: `npm run test:escrow:design`.
- A product decision records why escrow is needed for a specific asynchronous
  service rather than direct x402.
- Token address, expiry convention and event schema are pinned in a versioned
  interface, with no secrets in the interface or repository.

### Before Testnet deployment

- Rust/Soroban unit tests cover every allowed and forbidden transition.
- Property/fuzz tests prove conservation: contract balance is either zero before
  funding, exact amount while funded, or zero after a terminal state.
- Negative tests reject wrong buyer/provider, token, amount, expiry and a second
  terminal action.
- A threat-model review confirms no private payload enters events or storage.
- The deployer has a Testnet-only identity and no private key is committed.

### Before Mainnet consideration

- Independent smart-contract audit; no unresolved high-severity findings.
- Operational incident runbook, monitoring of funded jobs and tested expiry
  refund recovery.
- Explicit user disclosure that escrow confirms funds movement, not work quality.

## Dependencies and sequencing

1. Finish the existing direct x402 buyer-to-provider Testnet E2E first.
2. Use a stable Rust/Soroban SDK and Stellar Testnet deployment tooling.
3. Build a provider-owned asynchronous status/result contract before escrow:
   `job-id`, status endpoint, delivery evidence and idempotency.
4. Implement the contract in a separate repository or a `contracts/` package,
   not in the Next.js route layer.
5. Make Bazaar consume escrow events read-only; it must not sign, release,
   refund or hold the buyer/provider keys.
