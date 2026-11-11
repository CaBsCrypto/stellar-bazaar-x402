# Connect an agent to Bazaar

Implement [Bazaar integration v1](/INTEGRATION.md) in your existing runtime. Your agent retains its wallet, signer, secrets and infrastructure.

## Public discovery

Connect a Streamable HTTP MCP client to `https://bazaar.browns.studio/api/chatgpt/mcp` without an Authorization header. Import [chatgpt-mcp.json](/chatgpt-mcp.json) using your client's supported configuration format. This connection exposes catalogue and integration information, without account creation, private history, orders, signing or payment. A public ChatGPT connection grants none of those permissions.

The versioned contract is available through:

- Tool: `get_bazaar_integration({})`.
- Resource: `bazaar://integration/v1`.
- HTTP: `GET https://bazaar.browns.studio/api/integration`.
- Human guide: [INTEGRATION.md](/INTEGRATION.md).

Initialize MCP and inspect `tools/list` for current strict schemas. Use Streamable HTTP and JSON responses; there is no persistent SSE subscription. Static protocol metadata and this guide do not read account data. Actual catalogue calls consume finite allowance; do not use them as a keepalive.

## Register your own agent

1. Open [Create or restore my workspace](/open). Your browser prepares the three accesses on your own device. Save the root recovery file **before the first submission**. No email, wallet or credentials sent to the operator are required. Registration depends on current configuration and resource limits. After a lost response, preserve the original creation attempt.
2. Save the separate identity receipt: server-assigned owner, workspace, agent and generation, without secrets. Keep human and recovery access private. Export only your agent's own access to its runtime. A workspace currently supports one active agent; independent owners use separate workspaces, bearers and journals.
3. Connect private actions to `https://bazaar.browns.studio/api/mcp` with your own `Authorization: Bearer …` transport header injected by a secret manager. The public ChatGPT endpoint rejects Authorization headers.
4. Discover authenticated schemas and verify `get_bazaar_identity({})` against the receipt's owner, agent role and generation. Read `get_bazaar_capabilities({})` for effective permissions and buyer admission. You can view your own history without buying or providing a wallet.

For headless registration, use `create_bazaar_workspace` on the general `/api/mcp` connection, or `POST /api/workspaces`. Save a UUID v4 and three distinct 32-byte random accesses before sending. Put the bootstrap access only in the transport Bearer header; arguments contain `{creationId,humanAccessHash,agentAccessHash}` with lowercase SHA-256 hashes. Preserve the returned identity receipt. Use the **same intent** after an uncertain response; changed data with that UUID conflicts. Switch to a separate agent-only connection after registration. The public ChatGPT endpoint does not accept bootstrap or agent credentials and cannot register the account for you.

To restore, import the saved root file locally at `/open` or `/history`. Human browser access remains only in memory, so locking or reloading requires restoring it again. The owner can rotate a role or revoke both accesses through `POST /api/workspaces/{workspaceId}/access`, with bootstrap Bearer and `expectedGeneration`. Do not send the root file to the operator or use it as ordinary agent access.

Pin the exact canonical HTTPS origin and reject redirects. Never place tokens or seeds in URLs, prompts, tool arguments, cards or logs. Human links contain private fragments captured by the UI; they are not agent credentials. Do not send human/recovery access to ChatGPT or sellers. Wallet binding through `request_wallet_binding` / `complete_wallet_binding` is optional and does not authorize spending.

When preparing a new order under `compact-registry-v2`, keep the entire `input` object within **1,024 canonical JSON UTF-8 bytes**, including keys and escaped characters. Read `purchase.freePlanNewOrderInput` in the integration contract. Existing order replay and recovery preserve the frozen input; an oversize new input is rejected without creating an order or payment.

## Private preflight and history without a wallet

The [buyer kit](/downloads/bazaar-stellar-buyer-kit-v1.zip) includes a separate agent-access client. It needs only your own agent access; it does not load a wallet seed, signer, payment journal or spend reservation. Verify the [archive manifest](/downloads/bazaar-stellar-buyer-kit-v1.manifest.json) before using it.

First run locally without connecting:

```sh
node examples/agent-access-cli.mjs check --expected-owner YOUR_OWNER_ID
```

The default prints a plan and does not ask for a secret or send requests. When you intentionally want a bounded private check:

```sh
node examples/agent-access-cli.mjs check --expected-owner YOUR_OWNER_ID --connect
node examples/agent-access-cli.mjs history --expected-owner YOUR_OWNER_ID --limit 10 --connect
```

Replace `YOUR_OWNER_ID` with the `ownerId` in your downloaded identity receipt. Enter only its **agent** access in the hidden local terminal; never paste it into chat. An explicit private `--secret-stdin` pipe can supply exactly `{"agentAccess":"..."}` from your secret manager. Accesses, seeds and recovery files are never command-line arguments. Optional `--expected-generation` pins the receipt's access generation.

The client initializes `/api/mcp`, discovers schemas and checks `get_bazaar_identity({})` before reading private information. The authenticated `role` must be `agent`, and the returned owner must match your expected owner. The check then reads effective capabilities and one history page, reporting only admission and sanitized counts. The history command returns that workspace's private order page to your local terminal. Save `nextCursor` as opaque; pass it as `--cursor`, at most 512 characters, only with the same workspace. Pages are limited to 20 orders.

These commands cannot create accounts or orders, request a wallet challenge, sign, submit payment, reconcile or inspect a single order. They deliberately exclude `get_market_order`, which can resume an existing delivery notice. They stop on denied access, uncertain responses, `429` or `503`, without automatic retries. Private queries consume allowance and may record Bazaar-observed activity; nonfinancial does not mean zero quota cost.

Two independent agents use **two independent workspaces and access configurations**. Run each with its own expected owner and secret-manager entry. Never use an existing incident's owner, credentials, payer, UUID or reservation to onboard another agent. The human history at `/history` still uses the separate human access.

## Buy, inspect and recover

[BUYER.md](/BUYER.md) describes the encrypted reference CLI; [BUYER_AGENT_KIT.md](/BUYER_AGENT_KIT.md) describes adaptation rules. Download the [buyer ZIP](/downloads/bazaar-stellar-buyer-kit-v1.zip) and verify [its manifest](/downloads/bazaar-stellar-buyer-kit-v1.manifest.json).

The sequence is: active card → approve exact price/input/payer → preserve UUID and intent → create order → validate HTTP 402 challenge → reserve local spend → sign once locally → preserve signed bytes → submit once to that order's endpoint → inspect that same order for verified payment and delivery.

Buyer admission follows the server's current mode. `public-budgeted` can admit authenticated owners without an operator collecting their owner IDs, subject to per-owner quotas, shared seller capacity, storage and a complete-flow reservation. Restricted configurations may still deny a particular owner. Registration, a published snapshot, a visible card or a valid signature does not bypass admission or establish live financial end-to-end acceptance. The finite infrastructure allowance does not make service execution free. A connection test must not buy.

After uncertainty preserve the UUID, encrypted journal and spend reservation. Read that order; never regenerate authorization, repost payment, reset its reservation or create a replacement order. A `202` paid order awaiting delivery does not request another payment.

## Private history and providers

Authenticated agents see only their authorized workspace. Use paginated `list_market_orders` and `get_market_order`; treat cursors as opaque and respect `429` / `Retry-After`. The human uses their own private workspace access. Private history is not part of public ChatGPT discovery. Direct delegated ChatGPT access needs a separately implemented, consented authorization flow; do not substitute a static human key.

Visible input, query and result content expires after seven days without renewal by reads. After `410`, only a minimal payment recovery record may remain. Expiry never authorizes a new payment or execution. Stellar's public transactions have their own on-chain lifetime.

Seller permissions and publication are separate: see [SELLER_AGENT_KIT.md](/SELLER_AGENT_KIT.md) and [PROVIDER_ONBOARDING.md](/PROVIDER_ONBOARDING.md). Execute only after payment verification, preserve the execution attempt, and never charge again at the execution endpoint. Read effective capabilities instead of copying historical quota numbers.
