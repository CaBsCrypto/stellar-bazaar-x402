# Open Bazaar: independent acceptance

Reviewer: specialist 3, independent of the identity/storage, chat, and MCP/helper authors.
Scope: local candidate `mission/open-bazaar-review`, baseline `b780db4`, followed by the integrated SHA recorded after acceptance. No push, deployment, historical credentials, external Redis, provider execution, or payments.

## Status

The final complete independent black-box suite passed on integrated code `c91f1bb` with integrated reviewer test `f5f1af8` (review branch `c313c3e`), Node 22.18.0, and isolated evidence directory `C:/Users/MGC/AppData/Local/Temp/bazaar-independent-open-uvCA4m`. No external requests, real payments or production writes occurred. The preceding complete run on `7a661ac`/`c079baa` also passed (`.../bazaar-independent-open-YaXXlU`). These are local functional results.

Independent review found and verified corrections for Next's loopback hostname normalization, missing MCP `Origin`/forwarded authority context, whitespace normalization of frozen chat inputs, and bootstrap administration racing an access generation change. The final suite verifies legitimate configured Origins, actual wire Host spoof rejection, no private content in denied history, exact message preservation, and simultaneous rotation returning one `200` and one CAS `409`. The new chat fragment lifecycle correction (`1597c86`, integrated `4377088`) was independently reviewed; its executed hook/HTTP double passes and is labelled as supporting evidence rather than a browser test.

Unconditional readiness remains blocked by an unexplained intermittent file-backed creation `503 WORKSPACE_UNAVAILABLE`: two prior Node 22 built-Next runs returned one `503` alongside one `201` and successful `200` replays. Subsequent full runs passed, including the final instrumented run; no diagnostic reproduced the original failure. The fatal `503` gate remains in the tester. Successful later runs do not prove the file failure has been fixed. Actual shared Redis and public onboarding are also untested.

## Reproduction

From the integrated checkout with Node 22.18+ and installed dependencies:

```text
node --check scripts/test-open-bazaar-independent.mjs
node scripts/test-open-bazaar-independent.mjs
# Or, before the reviewer commits are integrated:
node scripts/test-open-bazaar-independent.mjs --checkout ../mission-consolidation
```

Build the integrated candidate before the second command. The acceptance refuses `.env`/production environment files, starts its own loopback Next processes with an environment allowlist, blocks external `fetch`, and uses fresh synthetic credentials. Its output gives a temporary directory with workspace state containing hashes only. Both helpers intentionally retain synthetic credentials in separate private recovery packets outside the repository; the delegated agent directory contains only `agent.json`. It never accepts an externally supplied base URL. Host spoof probes use `node:http`, because Node 22 fetch silently ignores an explicit Host override. File diagnostics expose only whitelisted phase/errno codes.

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
- Actual SDK discovery advertises exactly 17 tools, including six writes, and agrees with HTTP health/capabilities. MCP creation/write/history contexts preserve Origin and configured loopback authority; denied reads return no owner, task, operation, or result text.
- Whitespace in accepted conversation titles, human messages and agent responses is preserved. Reusing their IDs with trimmed content conflicts rather than replacing or silently normalizing the intent.
- The published workspace command sequence works with the real helper and SDK: prepare/create/tasks/claim/record/activity/respond/recover/rotate/revoke. The delegated packet needs no bootstrap/human secret. Original receipts and frozen response attempts remain unchanged through replay and credential administration.

## Evidence limits and remaining checks

The file-backed HTTP test is distinct from a Redis protocol double and from actual Upstash. No actual shared Redis availability, durability, or capacity is inferred from local files. Actual Upstash requires a fresh approved budget.

The workspace helper and full black-box lifecycle were independently executed. Browser fragment/memory/lock/reentry behavior was reviewed in source and the author's hook/HTTP double reproduced; that is distinct from an independent browser runtime test. The coordinator's browser evidence, if provided, must retain its own exact tested build and limitations. An independent external user following only deployed instructions remains untested.

The independent Redis protocol test reproduces the installed SDK's `retry: false` behavior: two wire requests after acknowledgement loss. It uses the actual `configuredWorkspaceStore()` and verifies its `retry: {retries: 0}`, `enableAutoPipelining: false` configuration with lost acknowledgements for creation, access rotation and operation recording. Each mutation is sent once; explicit exact replay recovers the original receipt/result, and changed content conflicts. A tightly scoped transport adapter maps only its synthetic HTTPS loopback origin to a local HTTP REST double. This tests the installed SDK/configuration/CAS protocol, not TLS or actual Upstash. The author's separately written protocol/quota tests were also reproduced as supporting evidence.

## Practical contract and next decisions

Anonymous workspace creation requires Node 22.18+, this checkout's installed SDK dependencies, a private terminal directory, and a deployment with open workspaces explicitly enabled. It requires no email or admission approval. Three independently generated secrets separate bootstrap administration, human conversation/history access, and the external agent. Owner and stable agent identity come from the server; a caller cannot route another owner's writes or impersonate the human through tool arguments.

The chat is a durable human-to-external-agent task channel. An external agent reads/claims tasks, preserves its own execution evidence, records the inline unpaid operation/activity through the existing native handlers exposed by MCP, and responds with that same owner's operation link. The human sees the same result in its private history. Hosting a model or automatically purchasing a service is outside this implementation. History writes do not require a second storage/authentication system.

Recovery keeps the frozen creation, claim, response, submission and access-change inputs. Accepted receipts are immutable; later statuses/errors are separate snapshots. A confirmed intake rejection permits an explicit same-intent retry. A lost acknowledgement, conflicting administration, pending journal, corrupt document or stale lock requires inspection/recovery; none proves that an external effect did not occur, and none authorizes replacement IDs or automatic payment retries.

Before considering public use: diagnose the intermittent file error without removing its regression gate or clearing lock/journal evidence, run browser runtime checks and independent guide onboarding, then separately validate a fresh shared Redis deployment and public endpoint with explicit capacity/retention settings. The CAS race is corrected and independently passes. Public provider registration remains a private review request; domain proof, independent review, activation and paid delivery are separate stages.

The release is local until a separate reviewed deployment and public read smoke exist. First external submission, domain-control review, public provider activation, and paid execution remain separate acceptance stages.
