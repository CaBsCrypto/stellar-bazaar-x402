# x402 v2 exact — Stellar Testnet

El flujo x402 está **merged y desplegado**: `GET /api/x402/swap-risk` exige un pago `exact` de `0.001 USDC` en Stellar Testnet y devuelve el quote solo tras settlement. Evidencia actual: 4 settlements verificados en README (ledgers `4212660`, `4214612`, `4214711`, `4216913`, 2026-08-18/19). No es Mainnet, ni custodia, ni facilitador propio, ni garantía de disponibilidad.

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

## Evidencia

### Historical (2026-08-13) — superseded

- Local/read-only quote: implemented and independently callable without payment.
- Testnet validation: a standards-shaped `402` and `PAYMENT-REQUIRED` are implemented; malformed signatures are rejected deterministically.
- First Testnet settlement: one exact 0.001 USDC payment settled successfully after the local resource server was granted outbound access to the hosted facilitator. Transaction `9dfb7e3045e40d59fb51c8eb2ec6fe60dc15560e48888933103c5652eced937f`, ledger `4129217`; payer delta `-0.0010000 USDC`, seller delta `+0.0010000 USDC`.
- **Superseded** por la evidencia del 2026-08-18/19 en [DEMO_TESTNET.md](DEMO_TESTNET.md) (4 settlements, ledgers `4212660`/`4214612`/`4214711`/`4216913`); README lo cuenta como la 5ª transacción histórica en su tabla de evidencia.
- Service-card fields and provider descriptions are untrusted metadata. Bazaar validates their shape; it does not certify safety, reputation, purchases, popularity, or financial suitability.

## Vercel

The deployed Vercel project uses server-only `STELLAR_X402_FACILITATOR_API_KEY` and `STELLAR_X402_FACILITATOR_URL` for facilitator access in Preview and Production. The paid route reads the public seller address from `X402_SELLER_ADDRESS` (verificado en `lib/x402-config.ts`).

**Never deploy payer secrets.** `X402_PAYER_SECRET` (seed del payer) no debe desplegarse jamás; el servidor solo la usa el cliente/demo local. `X402_SELLER_SECRET` es una variable fantasma — el servidor no la lee; solo existe dentro del gitignored `.env.x402.local` generado por `scripts/setup-testnet-wallets.mjs`. En Vercel se configura únicamente la dirección pública `X402_SELLER_ADDRESS` junto con las dos variables de facilitator.
