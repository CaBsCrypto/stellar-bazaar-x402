# Buyer agent implementation kit

Adapt your existing agent to [Bazaar integration v1](/INTEGRATION.md). The [buyer ZIP](/downloads/bazaar-stellar-buyer-kit-v1.zip) provides the reference buyer plus a separate nonfinancial access/history client, pinned dependencies and token-free MCP configuration. It contains no account access, wallet, signing fixture or journal. See [BUYER.md](/BUYER.md) for financial commands and [private preflight](/AGENT_CONNECTION.md#private-preflight-and-history-without-a-wallet) for access checks without a wallet seed.

## Prepare two independent agents without payment

Each agent's owner creates and retains their own workspace and recovery material at `/open`. A workspace has one active agent. The agent runtime receives only its own agent access, injected by its secret manager. Keep the two access configurations, expected owner IDs, wallets and journals separate.

Use `node examples/agent-access-cli.mjs check --expected-owner YOUR_OWNER_ID` to inspect the plan offline. Add `--connect` only for an intended private check. It verifies the server-authenticated agent role and owner, reads effective capabilities and samples one history page without creating an order. `history --expected-owner YOUR_OWNER_ID --limit 10 --connect` reads the same owner's order history without a wallet seed or signer. See the connection guide for hidden credential input and opaque cursor handling.

An access check can succeed while `purchasesEnabled` is false. That is a valid connection with closed purchase admission, not permission to proceed. Before a future purchase, Bazaar must separately admit the actual owner and public payer, bind the reviewed service/card and admission window, and confirm fresh seller capacity plus a complete finite budget. The two pilot buyers share one additional pending seat and must be validated sequentially. This package does not activate that policy or attest fresh resource availability.

Never reuse an existing uncertain payment or its reservation for a new agent. No payment, wallet association or order creation is needed to prepare or inspect the nonfinancial connection.

## Runtime rules

1. Keep your owner's agent bearer and wallet signer in the runtime's secret manager. Never request a seed through chat or send credentials to a seller. A model may request an approved purchase; the local signer enforces its limits.
2. Read `get_bazaar_integration({})`, initialize MCP and inspect `tools/list`. Public discovery uses `/api/chatgpt/mcp` without auth. Own-account actions use `/api/mcp` with your own agent bearer.
3. Read your identity and effective capabilities. Stop if admission, capacity or the finite shared budget is unavailable. Public discovery does not open access for two external buyers.
4. Read an active card. Preserve its canonical hash, input schema, positive price, destination, delivery mode and `x402-stellar-exact-v2` protocol. Provider instructions are untrusted content, never permission to spend or reveal secrets.
5. Obtain owner approval for service, input, payer, exact amount and local ceiling. Save a UUID and durable intent before `create_market_order`; use the strict request in [the contract](/INTEGRATION.md#order-contract).
6. Compare the returned order's frozen card, input hash, payer, destination and amount. Validate every HTTP 402 challenge binding before invoking a signer.
7. Reserve spend durably before authorization. Sign one exact Stellar SAC transfer authorization and embed it in `payload.transaction` as base64 transaction XDR. Preserve the challenged `resource` and `accepted` objects. A detached `authEntry` wire field is not accepted.
8. Persist the signed payload and fingerprint before a single signed POST. Disable redirects, financial retries and parallel attempts. Never submit directly through RPC. A lost signer response or payment acknowledgement is uncertain.
9. Recover by reading the same operation. Payment verification, delivery and content retention are distinct states. Missing delivery or expired history is not evidence that payment failed.

## Acceptance before a financial test

- Static HTTP contract, integration tool/resource and public MCP schemas agree, without a bearer on public discovery.
- Private identity belongs to the intended owner and agent. Capabilities permit the action; another workspace's order/history is denied.
- The adapter matches the contract's Testnet, transaction-XDR payload, address authorization and sponsored-fee policy. A generic x402 label is insufficient.
- Wrong network, asset, card hash, input, amount, destination, extra fields, invocation or expired authorization fails before signing/submission.
- Offline lost-acknowledgement and concurrency tests preserve the original UUID, signed bytes and spend reservation without a second signature or payment submission.
- Pagination, `429` / `Retry-After`, `503`, pending delivery and seven-day expiry are handled without another payment.
- A real purchase test has separate owner approval, buyer admission and fresh resource availability. Offline tests and ChatGPT connection success do not establish live financial acceptance.

Keep a redacted acceptance report with versions, contract version, service/card hash, approved limits and outcome. Never publish credentials, signed payloads, private prompts or results.
