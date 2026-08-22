# Security incident: retired Testnet payer

Status: contained in `security/revoke-testnet-example-key`; no Mainnet assets, custody, or production wallet were involved.

A Stellar Testnet payer seed was found in the tracked Python example. It must be treated as permanently compromised because an earlier public Git commit still contains the historical blob. This document intentionally does not reproduce the seed.

Containment completed on this branch:

- removed the seed fallback and converted the example to read-only discovery/402 inspection;
- retired and runtime-denylisted the associated public Testnet identity;
- generated a fresh local payer only in ignored `.env.x402.local`, scrubbed payer fields from auto-loaded `.env.local`, and never printed the seed;
- left the replacement unfunded and not payment-ready; no Friendbot, trustline, faucet or payment transaction was executed;
- kept seller and facilitator credentials unchanged because the exposed file contained neither;
- added scans/tests so the retired identity cannot be used by the local payer paths.

The old Testnet transaction links remain historical evidence only; they do not establish current wallet safety. The public Git history still requires a separately authorized coordinated history rewrite if removal of the old blob is desired. Rotating/retiring the identity is the effective containment; deleting it from the current tip alone cannot erase clones or caches.
