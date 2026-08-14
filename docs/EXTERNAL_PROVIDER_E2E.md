# External Quote provider E2E / E2E del proveedor Quote externo

## Current public truth / Estado público actual

The independent repository is [stellar-defi-quote-service](https://github.com/CaBsCrypto/stellar-defi-quote-service). Bazaar reads its public contract only; no provider code or secrets are shared.

El manifiesto público del proveedor declara actualmente `payment.enabled=false`, `networkAccess=false`, HTTP 200 gratuito y ningún transporte MCP publicado. GitHub reports no deployment. Por ello Bazaar publishes the external record as `contract-only`, `publiclyReachable:false` and `provider-not-x402-enabled`. No real external Testnet payment was attempted.

Browse the bilingual record at `/providers/stellar-defi-quote-service` or fetch `/api/discovery/external-providers/stellar-defi-quote-service`.

## CI/local E2E

`npm run test:e2e:external` starts four isolated loopback processes: discovery, provider contract fixture, mocked facilitator and independent buyer. It demonstrates discover → inspect → 402 → authorization → mock settlement/receipt → structured result without secrets or network writes.

Negative coverage: no payment, tamper, wrong network, asset, payTo and amount, expired authorization, replay, receipt mismatch and provider unavailable. The fixture models the public contract; it is not copied provider implementation and is never listed as a live provider.

## Manual Testnet profile

`npm run test:e2e:external:testnet` fails closed unless `RUN_EXTERNAL_X402_TESTNET=1` and ignored local secrets are present. It then requires an HTTPS provider manifest explicitly declaring `stellar:testnet`, `exact`, `10000` atomic and payment enabled. The current provider fails this preflight, before authorization or settlement.

Once the standalone provider independently publishes the protected endpoint and valid card, implement/review the final settlement runner, preserve the 0.001 USDC cap, and record only sanitized public receipt evidence.
