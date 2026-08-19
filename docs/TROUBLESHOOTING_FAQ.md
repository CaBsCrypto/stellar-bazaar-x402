# Troubleshooting FAQ · Stellar Bazaar x402

> Nota en español: esta guía técnica está en inglés. Para la descripción general del proyecto en español, consulta [README.es.md](../README.es.md).

Short answers to the most common issues while testing. All answers verified
against `lib/` and `app/api/`.

**Q: I called `/api/x402/swap-risk` and got HTTP 402 — is that an error?**
No, that's the expected x402 challenge. The unpaid call returns `402` with the
`PAYMENT-REQUIRED` header; you must sign with a payer and retry with
`PAYMENT-SIGNATURE` (`app/api/x402/swap-risk/route.ts:85-95`). The reference
`/api/reference/swap-risk` endpoint is the free variant.

**Q: 402 `MALFORMED_PAYMENT_SIGNATURE`**
The `PAYMENT-SIGNATURE` header isn't a valid base64url JSON-RPC signature
(`route.ts:97-102`). Caused by hand-editing the header or reusing a tampered
value; re-run the flow with a freshly generated signature (e.g.
`npm run x402:test-client`).

**Q: 402 `PAYMENT_REQUIREMENTS_MISMATCH`**
The signed `accepted` payload differs from the server requirements — scheme,
network, `payTo`, asset, amount, or `resourceUrl` (`route.ts:104-118`). The
quote is fixed at `exact` / `stellar:testnet` / USDC / `"10000"`; the
signature must be generated from the exact `PAYMENT-REQUIRED` challenge.

**Q: 503 `X402_SERVER_NOT_CONFIGURED`**
The server lacks `STELLAR_X402_FACILITATOR_API_KEY` or `X402_SELLER_ADDRESS`
(`lib/x402-config.ts:19-24`, `route.ts:52-61`). Set both in `.env.local`
(and in Vercel env vars for production), then restart `npm run dev`. Affects
`test:x402:protocol` and `agent:quickstart`.

**Q: 503 `SERVICE_NOT_CONFIGURED` on `/api/publisher/ingest` in production**
Production fails closed when `BAZAAR_PROVIDER_SECRET` is unset
(`app/api/publisher/ingest/route.ts:20-30`). Set it with `openssl rand -hex 32`
and add it to Vercel. Locally it's optional (dev-open mode).

**Q: Why is auth open locally but 401 in production?**
`authorizeProviderKey()` accepts any key when `BAZAAR_PROVIDER_SECRET` is
unset (dev-open), and enforces a `timingSafeEqual` comparison when set
(`lib/service-ingest.ts:54-60`). Deployments are fail-closed: no secret → 503;
wrong/missing `X-Bazaar-Provider-Key` → 401 `UNAUTHORIZED`.

**Q: My registered card vanished after a redeploy**
Registry persistence (Upstash Redis) is **live since 2026-08-19** — cards
survive redeploys and are consistent across serverless instances (verified in
production). If a card disappears, check `storage` in ingest responses: it must
be `"upstash"`; `"memory"` means the `UPSTASH_REDIS_REST_URL`/`TOKEN` envs are
missing in that environment (dev fallback, `lib/dynamic-registry.ts:22-34`).

**Q: The demo payer fails with a port mismatch (3210 vs 3000)**
`x402:setup-wallets` writes `X402_RESOURCE_BASE_URL=http://127.0.0.1:3210`
but the app runs on 3000; `requireLocalResourceBaseUrl()` defaults to 3210
(`lib/x402-config.ts:12-17`). Override to `http://127.0.0.1:3000` in
`.env.local` (as the repo's own `.env.local` does).

**Q: Node version errors on test/agent scripts**
Scripts import `.ts` files directly (`scripts/test-agent-autonomous-flow.mjs`,
`examples/agent-autonomous-buyer.mjs`, etc.) and need Node's type stripping,
on by default since **22.18**. Upgrade Node and retry.

**Q: MCP clients get `406` or connection errors**
`POST /api/mcp` requires both headers: `Accept: application/json, text/event-stream`
and `Content-Type: application/json`. The SDK rejects any `Accept` lacking
`text/event-stream` with 406 (`node_modules/@modelcontextprotocol/sdk/.../webStandardStreamableHttp.js:463-470`).

**Q: How do I verify a settlement on Stellar Expert?**
`agent:quickstart` prints a receipt URL
(`https://stellar.expert/explorer/testnet/tx/<hash>`,
`lib/bazaar-agent-client.ts:164`). For README evidence, paste one of the
three recorded hashes, e.g.
`43f3ea344b5ba0f4e0de88237f91c765adc90c110827282320bd3b7aa2013602`,
into `https://stellar.expert/explorer/testnet/tx/<hash>`.

**Q: Where do I get a facilitator API key?**
`npm run x402:fetch-facilitator-key` (calls `POST https://channels.openzeppelin.com/testnet/gen`
and stores the key in `.env.x402.local`) or the facilitator dashboard at
`https://channels.openzeppelin.com/x402/testnet`. Requires `.env.x402.local`
to exist first.

**Q: How do I fund testnet wallets?**
`npm run x402:setup-wallets` creates a payer + seller pair, funds both via
Friendbot, and sets USDC trustlines (needs a trustline to issuer
`GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`). Top up the
payer with the Circle faucet: `https://faucet.circle.com`
(`scripts/setup-testnet-wallets.mjs`).