# Receipt and delivery boundaries

## What Bazaar can verify

When a `PAYMENT-RESPONSE` is reconciled against a Service Card, Bazaar can state that a settlement receipt matches the declared **network**, **asset**, **amount**, and **destination**. This is payment evidence only.

## What Bazaar does not claim

- Bazaar does not custody funds, sign for an agent, or guarantee provider uptime.
- A successful settlement does **not** prove that an asynchronous job completed.
- A synchronous HTTP result is displayed as `result-returned`: it is a provider response after settlement, not an independent assessment of correctness or quality.

## Delivery states

| State | Meaning | Bazaar claim |
| --- | --- | --- |
| `result-returned` | A synchronous provider response was received after settlement. | Provider response received; result quality is not independently verified. |
| `accepted-pending` | A provider accepted an asynchronous job after settlement. | Payment is separate from final delivery; outcome remains pending. |
| `not-confirmed` | No provider delivery evidence is available. | Settlement must not be represented as delivery. |

Future asynchronous providers must expose a provider-owned status/result endpoint. Bazaar may show that provider-reported status, but must continue to label it as provider-reported unless an independent verifier is added.

For synchronous results, Bazaar may reconcile the provider's SHA-256 over a canonical result envelope. This confirms response integrity against the provider-declared hash; it never certifies result quality.
