# Delivery Contract v1

Every provider that Bazaar marks as consumable must disclose how a buyer gets a
result after a successful call or x402 settlement. This is independent from the
payment contract and does not enable payment, custody, callbacks, or external
network access by itself.

## Required delivery fields

| Field | Why an agent needs it |
| --- | --- |
| `mode` | Distinguishes an inline `sync` result from an `async` job. |
| `estimatedDurationMs` | Lets a buyer plan a timeout and budget. |
| `result.schemaVersion`, `contentType`, `terminalStatuses` | Defines the result envelope and completion state. |
| `result.hash` | Requires a SHA-256 hash over the canonical result. |
| `status` | States whether a job URL is required and how it is polled. |
| `callback` | Explicitly declares callback support; absence is not consent. |
| `retention` | Tells the buyer whether the result is durable and for how long. |
| `idempotency` | Defines the `Idempotency-Key` and replay behavior. |
| `retry` | Defines whether a failure can be retried and when it is terminal. |

## Reference profiles

- **Website Intelligence:** `sync`; the JSON audit is returned in the original
  response. It requires an idempotency key and exposes no callback or job URL.
- **Video Repurpose:** `async`; creation returns a job, which is polled until a
  terminal status. Fixture jobs are not durable and have no callback.
- **Brand Identity Studio:** `async`; the human-approval checkpoint is a
  non-terminal state. A job is only terminal after completion, rejection, or
  failure.

Providers remain `Pilot` until their delivery contract, endpoint behavior, and
result-hash verification have passed conformance. This document makes no claim
that a provider is paid, live on Mainnet, or externally durable.
