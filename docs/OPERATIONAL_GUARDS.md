# Operational guards — local candidate

These changes are local and do not configure production. No real Redis, email, payment or historical credential is used by their tests.

## Deliberate compatibility changes

- `/api/ingest` now requires the same explicit registry flag, configured storage and provider authorization as `createService`. Both existing authorization headers remain supported. Missing configuration returns503, bad authorization401, malformed JSON400, invalid card422, reserved/duplicate ID409. Successful registration retains id/card/registeredAt. There are no built-in provider credentials or memory-only publishing. This administrative indexing route is not approval for an ordinary provider submission.
- Admin master access requires an explicitly configured `BAZAAR_ADMIN_KEY` (32–256 supported token characters); absence or whitespace rejects. `ADMIN_ALLOWED_EMAILS` is the sole email allowlist. Existing embedded emails/credentials no longer grant access.
- Admin OTP redemption uses one atomic Redis Lua GET+DEL. The consumed record must contain a still-authorized email and unexpired numeric expiry. Invalid, missing, expired or uncertain records reject. Redis errors do not fall back to memory. Memory is only available in test/development without Vercel.
- Email links require `RESEND_API_KEY`, an HTTPS root origin in `NEXT_PUBLIC_APP_URL`, allowlisted email and storage. The request Host is not used. Tokens and mail-provider error bodies are not logged or returned, including development. No email was sent during validation.
- An admin OTP opens one statistics snapshot, not a reusable session. No polling, automatic retry, or browser credential persistence. A lost response requires a new link. Explicit master access remains in memory for manual refresh. Lock removes data and aborts pending fetch; stale responses cannot restore access. Administrative responses are private/no-store.
- `X402_LEGACY_PAYMENTS_ENABLED` must be exactly `true` for signed requests to contract-safety, ledger-brief or market-window. Default is disabled, before decoding/verification/settlement; unsigned402 discovery remains. This flag is separate from the Sandbox flag. Enabling either is outside this block.
- Server demo payer additionally rejects production and Vercel even if its local flag is true. No signer key belongs in published configuration.

## Validation

Run with no real credentials:

```sh
node scripts/test-operational-guards.mjs
node scripts/test-admin-ui-guards.mjs
node scripts/test-buyer-mission.mjs
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

The operational test executes actual route handlers and shared ingest logic. Storage, schema parser/conformance and mail/facilitator dependencies are doubles; existing suites cover schema/conformance separately. Redis Lua is inspected/exercised through an atomic storage double, not real Redis. Admin component tests use hook doubles (including StrictMode setup replay, rejected fetch and late response after lock), not a real React StrictMode environment. Browser checks use only a synthetic master credential and built-in demonstration statistics.

## Still required before publication

Verify actual history owner associations and credential rotation offline; do not infer owners. Verify Redis guarantees and private files separately. The admin stats endpoint still contains preexisting illustrative metrics/health entries; screenshots are not real activity evidence and its live wording needs a separate product correction. No claim of real admin telemetry is made here.

Review the resulting access restrictions and environment names before deployment. Missing admin/email/history configuration intentionally fails closed. Preserve original review branches. `fix/operational-guards` is excluded in Vercel configuration; it has not been pushed. Main remains deployable, so merge requires a separate deployment review.
