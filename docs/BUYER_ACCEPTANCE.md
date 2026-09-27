# Independent buyer acceptance (simulation only)

This executable exercises the existing `BazaarAgentClient` → x402 402 challenge → `handleSandboxPayment` → persisted response → authenticated history handlers. Cryptographic signing and facilitator verification/settlement are doubles. Redis is a local persisted double. Every fetch is intercepted in-process; an unexpected origin/path fails closed. There is no live mode, environment loading, faucet, real payment, deployment, or access to wallet files.

Requires installed repository dependencies and Node 24 (native TypeScript stripping). Run from the repository root. Choose a **new** isolated directory; prepare refuses to reuse an existing directory.

```sh
node scripts/buyer-acceptance.mjs prepare --dir ./buyer-simulation
node scripts/buyer-acceptance.mjs buy --dir ./buyer-simulation --operation buyer-order-001 --asset XLM --budget 0.01
node scripts/buyer-acceptance.mjs recover --dir ./buyer-simulation --operation buyer-order-001 --asset XLM --budget 0.01
node scripts/test-buyer-acceptance.mjs
```

Both `buy` and `recover` require an explicit asset (`XLM` or `USDC`), decimal budget (at most seven fractional digits), and operation ID (8–128 letters, digits, `_` or `-`). The fixture price is 0.01 XLM or 0.001 USDC. These are independent limits, never converted across assets. A missing budget or asset is rejected before any signing. The shared `buyerAcceptanceCard()` in `scripts/buyer-acceptance-fixture.mjs` supplies exact service identity and payment conditions for discovery fixtures. The only input is a synthetic XLM/USDC buy quote for amount 2500.

Each command prints JSON with `simulation: true`, `realPayments: 0`, cumulative synthetic signature/settlement counters, and success or error. Success includes the provider outcome and authenticated owner history records. An unrelated synthetic owner sees no records. The executable deliberately returns `humanHistoryLink: null`: no reachable history web server exists and no magic link is invented. Synthetic history tokens are retained locally in `simulation.json` and never printed.

`recover` requires an existing durable response or outcome. It uses the same operation, journal directory, asset and history mode in a **new process**, and retries history recording without signing or settling again. The response and completed outcome must be in the buyer journal before history can be written. `buy` also safely reuses a completed operation. Changing the asset or owner binding fails with `OPERATION_CONFLICT`.

Optional controlled faults:

- `--fault history`: payment and delivery complete; history reports `failed`. Run `recover` without the fault; counters stay unchanged and one owner record appears.
- `--fault uncertain`: settlement completes but its response is lost. Subsequent buy/recover reports `PAYMENT_PENDING` without another signature or settlement. This demo cannot reconcile an unknown payment; do not change the operation ID to retry.
- `--fault tamper`: changes the 402 amount. Buyer rejects conditions before signing; the started marker remains closed to automatic retry.
- `--fault signer`: removes the synthetic signer and fails before payment.
- `--no-history`: explicitly disables history. Keep this option when recovering the operation; the local response remains recoverable and no link is returned.

A persistent session lock serializes commands for the entire isolated directory; concurrent invocations fail closed. A crash can leave locks. Neither this CLI nor recovery steals/deletes stale locks. Administrative reconciliation is outside this demonstration. Cumulative counters are persisted on ordinary completion/error; a hard process kill may lose the latest counter increments, so they are test evidence, not a settlement ledger. Production receipt verification, Redis durability, live discovery, wallet authorization, funding and real network settlement are outside this simulated acceptance. The injected receipt verifier accepts the synthetic receipt only because no external response can enter this process.

For an independent agent, use this instruction: “Run the documented isolated buyer acceptance. Prepare a new directory, purchase the synthetic quote with an explicit XLM budget of 0.01 and a stable operation ID, then recover that same operation in a second process. Report delivery, history and counters. Do not use real credentials or send network requests. If uncertainty occurs, stop and report reconciliation required.”
