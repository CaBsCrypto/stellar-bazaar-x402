# Buyer Execution and Delivery v1

This sprint closes the conceptual gap between discovering a service and receiving
a usable result. The current implementation is deliberately local and
non-transactional: it exercises two deterministic in-process fixtures behind a
contract-shaped HTTP flow. It does not call an external provider or facilitator.

## Current demonstrable flows

The versioned core is `bazaar.execution-request/v1` plus
`bazaar.delivery-envelope/v1`. The envelope binds service, HTTP method, fixed
route, canonical input hash, idempotency key and canonical result hash.

- **Script creation / Creación de guion:** local synchronous fixture returning a
  structured script and canonical result hash.
- **Video repurpose / Edición de video:** local async fixture returning a job ID,
  progress, and an inert upload handoff. A status action at the fixed, allowlisted
  Bazaar route deterministically transitions it to `completed` with a metadata-only
  fixture artifact and verifiable manifest hash. It uploads or stores no file and
  exposes no arbitrary URL.

Negative conformance covers binding tamper, input tamper, expiry, replay with
idempotent return, conflicting reuse, non-canonical or invalid timestamps, TTL
bounds, provider unavailable, allowlisted status routing, and result/artifact
mismatch. All payment fields remain `not-performed`.

## Reference sequence

1. The buyer selects deterministic inputs.
2. `POST /api/buyer-execution/reference` with `action=challenge` returns HTTP 402
   and a `bazaar.execution-request/v1` request explicitly marked as a local
   fixture with `settlement=not-performed`.
3. The UI simulates a buyer-owned external-client authorization. It creates no
   signature and accesses no wallet.
4. `action=execute` accepts only the fixed local reference service and a challenge
   bound to the exact inputs. No arbitrary provider URL can be supplied.
5. The fixture returns a script immediately or a video job that can be polled to
   completion. Bazaar displays the result in a `bazaar.delivery-envelope/v1`
   beside canonical SHA-256 result and artifact hashes.

The envelope says `evidence=local-fixture-only`, has no transaction hash or ledger,
and never claims settlement or independently verified quality.

## Future external Testnet acceptance gate

The local contract can only be replaced by an external provider run after all of
these are independently demonstrated:

- public versioned Service Card and fixed HTTPS endpoint;
- genuine x402 v2 402 challenge matching network, scheme, asset, amount and payTo;
- buyer-controlled signer outside Bazaar and no browser/server secret leakage;
- facilitator receipt reconciled against the selected card, request and result;
- provider result hash bound to the same request;
- deterministic rejection of tamper, expiry, replay and receipt mismatch.

Bazaar remains a discovery and conformance layer. It does not custody funds,
operate the buyer wallet, certify provider quality, or promise delivery solely
because a settlement exists.
