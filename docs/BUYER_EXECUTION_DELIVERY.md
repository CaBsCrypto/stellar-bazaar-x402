# Buyer Execution and Delivery v1

This workspace now separates two evidence levels: one verified external
Website Intelligence purchase on Stellar Testnet, and two deterministic local
contract fixtures available only through checkout scripts. Bazaar displays and exports the provider result but never
stores a buyer seed, signs an authorization, or repeats a payment from the UI.

## Current demonstrable flows

- **Website Intelligence:** `POST /api/buyer-execution/website-intelligence`
  inspects the provider's live public 402 without signing or paying. `GET` returns
  the redacted, reconciled delivery evidence from the already completed 0.001
  USDC Testnet purchase: full structured report, canonical result hash,
  transaction reference and ledger. The buyer UI can copy the result or download
  the complete evidence envelope. Only `https://example.com` is accepted by this
  fixture pilot.

The versioned core is `bazaar.execution-request/v1` plus
`bazaar.delivery-envelope/v1`. The envelope binds service, HTTP method, fixed
route, canonical input hash, idempotency key and canonical result hash.

- **Script creation / Creación de guion:** a scripts-only local synchronous fixture returning a
  structured script and canonical result hash.
- **Video repurpose / Edición de video:** a scripts-only local async fixture returning a job ID,
  progress, and an inert upload handoff. A status action at the fixed, allowlisted
  Bazaar route deterministically transitions it to `completed` with a metadata-only
  fixture artifact and verifiable manifest hash. This handler is invoked directly by the local test; there is no hosted status endpoint. It uploads or stores no file and
  exposes no arbitrary URL.

Negative conformance covers binding tamper, input tamper, expiry, replay with
idempotent return, conflicting reuse, non-canonical or invalid timestamps, TTL
bounds, provider unavailable, allowlisted status routing, and result/artifact
mismatch. All payment fields remain `not-performed`.

## Reference sequence

1. Run `node --experimental-strip-types scripts/test-buyer-execution.mjs` from the checkout. The test chooses deterministic inputs.
2. The test directly invokes `scripts/fixtures/buyer-execution-handler.ts` with a loopback HTTP `Request` and `action=challenge`. This produces a simulated HTTP 402 and a `bazaar.execution-request/v1` request with `settlement=not-performed`; no network request is made.
3. The test supplies its fixed local fixture authorization. It creates no signature and accesses no wallet.
4. `action=execute` accepts only the fixed reference service and a challenge bound to those inputs. No arbitrary provider URL can be supplied.
5. The fixture returns a script or a video job that the test can poll to completion, with canonical result and artifact hashes.

`/api/buyer-execution/reference` now returns 404 for every HTTP method in every environment. The public page has no fixture execution controls, and application modules do not import the simulator. `scripts/test-no-hosted-payment-fixtures.mjs` verifies this boundary. These fixtures provide local contract evidence only; they cannot validate a preview or production purchase.

The envelope says `evidence=local-fixture-only`, has no transaction hash or ledger,
and never claims settlement or independently verified quality.

## External Testnet acceptance gate

Website Intelligence has independently demonstrated these gates. They remain
mandatory for every later provider:

- public versioned Service Card and fixed HTTPS endpoint;
- genuine x402 v2 402 challenge matching network, scheme, asset, amount and payTo;
- buyer-controlled signer outside Bazaar and no browser/server secret leakage;
- facilitator receipt reconciled against the selected card, request and result;
- provider result hash bound to the same request;
- deterministic rejection of tamper, expiry, replay and receipt mismatch.

Bazaar remains a discovery and conformance layer. It does not custody funds,
operate the buyer wallet, certify provider quality, or promise delivery solely
because a settlement exists.
