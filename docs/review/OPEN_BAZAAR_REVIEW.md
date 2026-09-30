# Open Bazaar: independent acceptance

Reviewer: specialist 3, independent of the identity/storage, chat, and MCP/helper authors.
Scope: local candidate `mission/open-bazaar-review`, baseline `b780db4`, followed by the integrated SHA recorded after acceptance. No push, deployment, historical credentials, external Redis, provider execution, or payments.

## Status

Pending integration and production build. The test exists for independent review but has not yet passed against the integrated candidate. An author's passing test is supporting evidence, not independent approval.

## Reproduction

From the integrated checkout with Node 22.18+ and installed dependencies:

```text
node --check scripts/test-open-bazaar-independent.mjs
node scripts/test-open-bazaar-independent.mjs
# Or, before the reviewer commits are integrated:
node scripts/test-open-bazaar-independent.mjs --checkout ../mission-consolidation
```

Build the integrated candidate before the second command. The acceptance refuses `.env`/production environment files, starts its own loopback Next processes with an environment allowlist, blocks external `fetch`, and uses fresh synthetic credentials held in memory. Its output gives a temporary directory with workspace state containing hashes only; the provider helper's separate private packet retains its synthetic submission token with exclusive directory permissions. It never accepts an externally supplied base URL.

## Acceptance gates

- Public discovery and skills remain readable; private task/history tools deny public or unknown access.
- Workspace creation authenticates bootstrap before replay, allocates owner/workspace/agent on the server, rejects client authority and hash collisions, and preserves one intent across concurrent HTTP processes.
- Human, agent, bootstrap, provider submission, and legacy history accesses retain distinct authority. Human cannot record operations/activity or claim/answer tasks; bootstrap cannot read private history; another owner cannot observe or link private data.
- Human message queues a task; agent claim is stable; MCP writes use native operation/activity schemas; the human sees the same synthetic result in its history; responses link only this owner's operation.
- Frozen creation/claim/operation/response replays are idempotent; changed bodies conflict. A restart recovers the original result and messages without reexecuting a task.
- Rotation invalidates original access without changing ownership. Generation CAS rejects stale administration. Creation replay never restores rotated/revoked access; revoked intents retain tombstones.
- File state contains no raw credentials. Selecting unconfigured Redis fails closed without a file fallback. Existing synchronous legacy authentication retains read/write permissions.
- Simultaneous generation CAS has one winner. Corrupt registry, incomplete owner document, and pending transaction evidence fail closed without being silently cleared or overwritten.
- An authenticated provider request remains separate from workspace/history access. The helper retains its immutable accepted receipt through successful and failed status checks; explicit retry after confirmed intake rejection reuses the same frozen intent.

## Evidence limits and remaining checks

The file-backed HTTP test is distinct from a Redis protocol double and from actual Upstash. No actual shared Redis availability, durability, or capacity is inferred from local files. Actual Upstash requires a fresh approved budget.

Pending checks: execute the integrated black-box suite, workspace helper acceptance, browser fragment/memory/lock behavior, and an independent external user following only published instructions. Record each result and exact integrated SHA before recommending release.

The core author found that the installed Upstash SDK performs an additional request when configured with `retry: false`; `retry: {retries: 0}` and `enableAutoPipelining: false` are required. The author's local REST protocol double includes acknowledgement-loss request counting. Independently review/reproduce that test before treating a failed write as evidence of zero mutation; it is not evidence from actual Upstash.

The release is local until a separate reviewed deployment and public read smoke exist. First external submission, domain-control review, public provider activation, and paid execution remain separate acceptance stages.
