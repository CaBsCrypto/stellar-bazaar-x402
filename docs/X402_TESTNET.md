# x402 v2 exact — Stellar Testnet POC

Branch-only work. No Mainnet, custody, facilitator implementation, or browser-held keys.

## Official components

- `@x402/core`, `@x402/express`, `@x402/fetch`, `@x402/stellar` pinned to 2.20.0 (Apache-2.0).
- Hosted facilitator: `https://channels.openzeppelin.com/x402/testnet`.
- API key: generate once at `https://channels.openzeppelin.com/testnet/gen`; keep server-only.
- USDC issuer: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`.
- SEP-41 USDC contract: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`.
- Test USDC: official Circle Faucet `https://faucet.circle.com` after trustline.

## Local setup

1. Run `npm run x402:setup-wallets`. It creates two Testnet-only wallets, funds XLM through official Friendbot, creates USDC trustlines, and writes seeds only to gitignored `.env.x402.local`.
2. At Circle Faucet select **Stellar Testnet** and fund the printed payer public address with USDC.
3. Generate the facilitator Testnet API key at the official URL above and add it to `.env.x402.local`. Never paste it into chat or commit it.
4. Load server variables from that local file, run the app, then `npm run x402:test-client`.

The protected route binds payment requirements to `GET`, canonical query inputs, route, exact USDC contract/amount, pinned seller destination, and a 60-second maximum timeout. Facilitator/SDK handle Soroban auth verification, expiry, replay protection and settlement. Errors are structured and logs are redacted.

## Evidence status (2026-08-13)

- Local/read-only quote: implemented and independently callable without payment.
- Testnet validation: a standards-shaped `402` and `PAYMENT-REQUIRED` are implemented; malformed signatures are rejected deterministically.
- Testnet settlement evidence: one exact 0.001 USDC payment settled successfully after the local resource server was granted outbound access to the hosted facilitator. Transaction `9dfb7e3045e40d59fb51c8eb2ec6fe60dc15560e48888933103c5652eced937f`, ledger `4129217`; payer delta `-0.0010000 USDC`, seller delta `+0.0010000 USDC`.
- Public payment: **not deployed or generally available**. The evidence above validates this branch locally on Testnet only; it is not a Mainnet, production-readiness, audit, or public-payment claim.
- Service-card fields and provider descriptions are untrusted metadata. Bazaar validates their shape; it does not certify safety, reputation, purchases, popularity, or financial suitability.

## Vercel

The existing Vercel project uses server-only `STELLAR_X402_FACILITATOR_API_KEY` and `STELLAR_X402_FACILITATOR_URL` for facilitator access in Preview and Production. A deployed paid route additionally needs the public seller address. Never deploy `X402_PAYER_SECRET` or `X402_SELLER_SECRET`.

The production site remains the read-only/local-MVP preview until this branch is reviewed and separately authorized for merge and deployment.
