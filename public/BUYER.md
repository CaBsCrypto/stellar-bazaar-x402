# Run the reference Stellar buyer

To check your own agent connection or read private history **without a wallet seed**, use the separate `examples/agent-access-cli.mjs` from the [buyer kit](/downloads/bazaar-stellar-buyer-kit-v1.zip). Start with `check --expected-owner YOUR_OWNER_ID` offline; add `--connect` only for an intentional private check. See [private preflight and history](/AGENT_CONNECTION.md#private-preflight-and-history-without-a-wallet). The financial runtime below remains a separate, explicitly authorized workflow.

Download the [buyer ZIP](/downloads/bazaar-stellar-buyer-kit-v1.zip), verify [its SHA-256 manifest](/downloads/bazaar-stellar-buyer-kit-v1.manifest.json), and extract it. Use **Node.js 24.x** and the included dependency lock. The kit requires no Bazaar repository checkout or hosting credentials.

This implements [Bazaar integration v1](/INTEGRATION.md): MCP SDK `1.30.0`, Stellar SDK `14.4.2`, x402 core `2.24.0`, and a classic Ed25519 Testnet payer. Contract wallets, multisig and other x402 variants require a separately validated adapter.

For new orders under the finite free-plan profile `compact-registry-v2`, the complete `input` object must fit **1,024 bytes of canonical JSON encoded as UTF-8**. Count keys, punctuation and JSON escapes, not just displayed characters. `ORDER_INPUT_TOO_LARGE` (400) creates no order or payment. Preserve an existing intent unchanged when replaying or recovering it.

## Configure locally

From the verified kit directory:

```sh
npm ci --ignore-scripts --no-audit --no-fund
```

This downloads locked software; it does not register or buy. The package was assembled and checked offline. Run your own isolated acceptance tests before using credentials.

Register your own workspace at [Open](/open), preserve its recovery file and check buyer admission. Configure a **new private directory outside the kit, repositories and cloud-synced folders**, with an existing private parent:

```sh
node examples/buyer-cli.mjs configure /absolute/private/bazaar-buyer
```

Hidden terminal prompts request a passphrase of at least 12 bytes, your agent access and your Stellar Testnet seed. Do not paste these into ChatGPT. Secrets and journals are encrypted using scrypt/AES-256-GCM; the local signer temporarily holds the seed in memory. This is software custody: protect the device, directory and passphrase and restrict filesystem access to the owner.

Automation may supply `--secret-stdin` through an explicitly private inherited pipe backed by a secret manager: `password`, plus `agentAccess` / `stellarSecret` only when configuring those values. Never use plaintext files, shell arguments, shared environment variables, URLs or logs. No credentials are supplied in the kit.

## Discover and prepare

```sh
node examples/buyer-cli.mjs discover
node examples/buyer-cli.mjs discover SERVICE_ID
node examples/buyer-cli.mjs prepare /absolute/private/bazaar-buyer SERVICE_ID public-input.json
node examples/buyer-cli.mjs budget /absolute/private/bazaar-buyer
```

Discovery consumes catalogue allowance. Input JSON must contain only non-secret fields accepted by the chosen card. Preparation reads that card and writes a local encrypted intent; it does not create a remote order, sign or pay. Save its operation UUID and review the frozen card, input, destination and price.

The default local ceiling is **0.01 USDC per intent** and **0.02 USDC total reservations**. A different price requires explicit owner approval. `prepare … --max-price 0.03` changes only that intent's ceiling. `budget-increase … 0.03` explicitly raises the total ceiling while preserving reservations. Neither command grants server admission, capacity or two purchases, or clears an uncertain payment.

## Buy only after admission and approval

This command has financial effects: order creation, challenge, durable spend reservation, one local authorization and one payment submission. Run only for an admitted, explicitly approved intent:

```sh
node examples/buyer-cli.mjs buy /absolute/private/bazaar-buyer OPERATION_UUID
```

The runtime validates the exact card/challenge and embeds a signed address authorization in transaction XDR. Its sponsored network-fee ceiling is 1,000,000 stroops (0.1 XLM), separate from the USDC ceiling. It simulates through the pinned Testnet RPC and does not call `sendTransaction`; the facilitator sponsors and submits settlement. See [the wire profile](/INTEGRATION.md#stellar-payment-profile).

## Inspect and recover

```sh
node examples/buyer-cli.mjs inspect /absolute/private/bazaar-buyer OPERATION_UUID
node examples/buyer-cli.mjs recover /absolute/private/bazaar-buyer OPERATION_UUID
node examples/buyer-cli.mjs history /absolute/private/bazaar-buyer 10
```

These read commands never sign or submit payment. Reading an existing order can resume its previously recorded server delivery notice. History accepts an opaque cursor for subsequent pages and a limit of at most 20.

After uncertainty, preserve the encrypted store, UUID and reservation. Do not rerun `buy`, regenerate authorization, repost bytes, change payer, delete locks/journals or initialize another budget. `recover` does not make a new payment attempt. Corrupt or inconsistent journals require investigation, not automatic repair.

Visible inputs, queries and delivery expire after seven days; reads do not renew retention. After expiry, only minimal payment recovery data may remain (`contentExpired: true`). HTTP `202`, `410`, `429`, `503`, missing content or failed history never authorizes a replacement charge. Respect `Retry-After` and avoid fast polling. Public connection and offline tests do not attest live financial acceptance; admission remains restricted and shared budgets are finite.
