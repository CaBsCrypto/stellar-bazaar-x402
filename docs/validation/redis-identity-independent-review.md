# Independent review: isolated Redis identity pilot

Date: 2026-09-28. Reviewed local candidate `scripts/validate-identity-redis.mjs` on `mission/identity-pilot`; this report describes the working-tree version, not a published release.

## Independent decision

Approved for the bounded synthetic storage exercise, subject to the coordinator's separate confirmation of the instance, free quota and isolated owners. The reviewer did not execute remote requests, load real credentials, or review their own browser harness as independent evidence.

The runner restricts access to the exact history and delivery keys derived from two synthetic owners. Writes accept only the two existing Lua scripts, the first owner's exact key order and the operation/version identifiers fixed in private state. It does not scan, delete remote keys, expire records, sign or pay. The exclusive local lock and persistent counters precede requests; an attempted seed cannot be restarted automatically.

An initial issue cleared uncertainty before validating the Lua response. The author corrected it: malformed replies, unexpected identifiers or digests now retain the write block. Successful replies must identify the intended saved operation or delivery before uncertainty clears.

## Independently reproduced with doubles

The reviewer extracted the current `command()` function into an in-memory JavaScript function and supplied synthetic `fetch` and state-save doubles. No files were written by this reproduction and no network request was issued.

| Scenario | Observed result |
|---|---|
| Valid `created` response | Accepted; uncertainty cleared |
| Valid `existing` response | Accepted; uncertainty cleared |
| Wrong saved digest | Rejected; uncertainty retained |
| Wrong saved operation identifier | Rejected; uncertainty retained |
| Malformed response result | Rejected; uncertainty retained |
| Lost response | Uncertainty retained; no automatic retry |
| 200-request limit already reached | No send |
| 100,000-byte write budget already reached | No send |
| Existing uncertain marker | No write send |
| Failure saving the pre-send marker | No send |

`node --check scripts/validate-identity-redis.mjs` also passed. Static review of `check` confirmed same-ID registration checks expecting the original saved records, rejection of owner tampering and invalid credentials without Redis access, invalid configuration checks, separate read/write rotation and revocation. Temporary changes restore only the original synthetic configuration in `finally`.

The double-based reproduction is retained as `node scripts/test-identity-redis-guard.mjs`. It extracts the actual guarded command from the runner, fails if the expected boundaries change, and supplies all state and network dependencies in memory.

## Coordinator evidence, separate from this reproduction

The coordinator reported real Redis executions with isolated synthetic records: preflight at 1 cumulative request, seed at 5 requests / 17,478 estimated write bytes, check at 29 / 34,956, and a new-process check at 53 / 52,434. The coordinator reported stopping the server and verifying the listener was absent and state was not uncertain before removing only the local runner lock. These remote results were not independently rerun by this reviewer.

Subsequently, the user explicitly permitted access to a copy of synthetic account A for browser validation. The coordinator reported real-browser checks at 1366×768 and 390×844: recovery after a server restart, token removal from the URL, Escape and focus return, lock and removal of the question draft. Mobile document measurements were `clientWidth = scrollWidth = 375`, with no horizontal overflow. Screenshots are retained outside the repository under `review-release/redis-identity/` for desktop and mobile. The final cumulative count was 141 REST requests and 52,434 estimated write bytes; the coordinator closed the server and browser tab. These browser checks were performed by the coordinator, not independently reproduced by this reviewer.

## Limits and pending evidence

- The 200 limit counts REST requests, not the individual Redis commands inside Lua. The byte budget is a conservative request-based estimate, not measured Redis memory usage.
- An altered-content conflict under the same operation identifier was not independently exercised against external Redis.
- Hard process termination and automatic crash recovery were not reproduced here. An abandoned lock requires operator inspection; it must not be removed to bypass uncertainty.
- The earlier browser credential-access blocker was resolved through explicit user permission for the synthetic copy. Browser results above remain coordinator evidence, distinct from this independent command-level review.
- Successful reads and idempotent registration do not establish backup, disaster recovery, durable payment-marker guarantees or external file persistence.
- This exercise authorizes no deployment, real payment, historical-data mutation or published authentication configuration.
