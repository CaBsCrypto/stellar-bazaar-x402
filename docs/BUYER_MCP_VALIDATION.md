# Buyer MCP validation (synthetic, no payment)

Run from the repository root after dependencies are installed:

```sh
node scripts/test-buyer-mcp.mjs
```

This starts an ephemeral HTTP server bound only to `127.0.0.1`, runs the official
`@modelcontextprotocol/sdk` Client with StreamableHTTPClientTransport, and closes
both client and listener. It needs no Next dev server, wallet, credential, env
file, RPC, registry service, or provider. Node 24.14.0 and the locked SDK 1.30.0
were used for validation.

For a separately inspectable local session, run:

```sh
node scripts/serve-buyer-mcp-review.mjs
```

In another terminal:

```sh
node scripts/buyer-mcp-review.mjs --url http://127.0.0.1:3214/api/mcp
```

Stop the server with Ctrl+C. The client accepts only uncredentialed HTTP URLs on
127.0.0.1 with the exact `/api/mcp` path and rejects redirects. Its endpoint
argument is intended for this synthetic harness, not a production catalog.

## What is real

The harness transpiles and loads the production `app/api/mcp/route.ts` and
`lib/mcp-onboarding-server.ts`, their serialization and ranking code, and the
actual MCP SDK. Requests travel through a real loopback HTTP socket, the route's
WebStandardStreamableHTTPServerTransport, protocol initialization, and tool
registration. Tests assert both initialize and notifications/initialized reach
the server. No hand-written substitute JSON-RPC responder is used.

Only dependency boundaries are replaced: two synthetic catalog entries,
in-memory empty dynamic registry with an available/unavailable switch, no pilot
cards, and an unauthorized history reader. Application modules see an empty env;
the harness does not load env files. Their external fetch is blocked. The selected card shares `buyerAcceptanceCard()` with the isolated CLI acceptance
test: id `swap-risk-quote`, synthetic loopback provider URL, and deterministic
public simulation recipient. Neither the URL nor recipient is contacted by MCP.
There is no new application/public route; this listener exists only in scripts.

## Assertions and expected result

- Initialize identifies stellar-bazaar-discovery and advertises tools capability.
- tools/list returns exactly all eight current discovery/history tools.
- Capability card declares no writes, no MCP mutation, untrusted provider metadata,
  and no payment-flow side effects.
- list/search/get preserve the synthetic card's price, Stellar testnet network,
  recipient and both USDC/XLM paymentOptions (asset, amount, contract, destination).
- Cursor pagination returns distinct resources and ends without another cursor.
- Missing IDs return RESOURCE_NOT_FOUND when the registry is available.
- Registry failure leaves static discovery usable with partialResults=true;
  missing IDs then return REGISTRY_UNAVAILABLE, not a false definitive absence.
- Private history remains unauthorized; a public endpoint is rejected.

Expected output has three PASS lines: available registry, unavailable registry,
and public endpoint rejection. POST requests are exclusively MCP protocol and
read-only tool calls. Nothing signs, authorizes, transfers, funds, calls a
provider, or verifies a paid delivery.

## Evidence limits and gates

This validates SDK protocol compatibility and discovery contract preservation
against production route/server code with synthetic storage. It does not prove
live provider readiness, deployed routing/authentication, funded balances,
settlement, delivery, or provider ownership. It lists all eight tools but only
executes the buyer discovery/capability tools and unauthorized history; it does
not claim behavioral coverage of workflow bundle or card validation tools.

The fixture intentionally carries two payment options regardless of deployment
feature flags to test lossless transport. It does not enable XLM in production
or change any feature gate, USDC fallback, buyer policy, budget, confirmation,
quote validation or paid-execution logic. Treat partialResults as incomplete
coverage, inspect the selected service, and retain all existing payment gates
before any separately authorized paid execution.


The CLI JSON stdout includes the complete selected contract for agent review. Asset
contract IDs are actual configured testnet identifiers, while the recipient,
provider and delivery behavior are synthetic. Sharing a fixture with acceptance
does not by itself demonstrate an agent handing this response to paid execution.

