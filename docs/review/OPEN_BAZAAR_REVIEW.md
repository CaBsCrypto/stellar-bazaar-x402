# Open Bazaar: independent acceptance

Reviewer: specialist 3, independent of the identity/storage, chat, and MCP/helper authors.
Scope: local candidate `mission/open-bazaar-review`, baseline `b780db4`, followed by the integrated SHA recorded after acceptance. No push, deployment, historical credentials, external Redis, provider execution, or payments.

## Status

The local candidate is independently accepted on built integrated code `a4804947fff04a02822d3f01e767955ace5acd36`, with reviewer test `02b049f` (integrated `a480494`), Node 22.18.0, and isolated evidence directory `C:/Users/MGC/AppData/Local/Temp/bazaar-independent-open-Fo54dU`. The complete black-box suite passed, including the extended Redis protocol gates. No external requests, real payments or production writes occurred. This is local acceptance, not approval of a public deployment or actual Redis service. The coordinator tracks the subsequent DocsCodeTabs copy/regression change `406bb82` separately with specialist 2; this full-suite evidence remains tied to the built `a480494` candidate.

Independent review found and verified corrections for Next's loopback hostname normalization, missing MCP `Origin`/forwarded authority context, whitespace normalization of frozen chat inputs, and bootstrap administration racing an access generation change. The suite verifies legitimate configured Origins, actual wire Host spoof rejection, no private content in denied history, exact message preservation, and simultaneous rotation returning one `200` and one CAS `409`. The chat fragment lifecycle correction (`1597c86`, integrated `4377088`) was independently reviewed; its executed hook/HTTP double passes and is supporting evidence rather than a browser test. The final history-to-chat link forwards its in-memory access in a relative same-origin fragment, which the chat removes before fetching; it persists no browser token and grants no inferred role.

The original intermittent file-backed creation `503` was diagnosed as Windows `EPERM` while acquiring the exclusive lock, before the callback or any effects. The reviewed fix (`98dde7a`) retries only acquisition for `EPERM`/`EEXIST` within the existing 2.5-second deadline; it does not retry writes or clear transaction evidence. An independently executed strict probe on `cbdc45c` used 20 fresh directories, 40 built Next processes and 120 simultaneous creation requests: exactly 20 `201` plus 100 `200`, zero `409`/`503`, three observed `lock-contention:EPERM` recoveries, and one persisted owner per intent. Its owner rebind (`42fd75d`) authenticates frozen hashes before a second read-only transaction; no mutation is repeated. File locking and owner rebind remain unchanged in `a480494`; its full suite repeats file-backed HTTP concurrency and verifies that a persistent stale lock still returns `503` without altering the lock, registry or owner document. The fatal regression gates remain intact.

The independent Redis barrier first reproduced one committed creation and five `WORKSPACE_CONFLICT` rejections on `cbdc45c`. The reviewed correction (`5b490ab`, author `8a595d0`) distinguishes only Lua's numeric CAS `0`, which proves no write occurred, from an unknown result or lost acknowledgement. Creation then reconciles a committed matching intent by reading, authenticating bootstrap and frozen hashes, and validating its owner document; it never retries creation. Only the request counter retries confirmed CAS rejection, at most eight attempts, validating current authority, document and quota each time.

The independently executed directed protocol on integrated `a4804947fff04a02822d3f01e767955ace5acd36` passed using the actual configured SDK/store and local REST double. Six simultaneous registry/transaction snapshots yield six matching receipts, exactly one creation mutation and five read-only reconciliations. Six native handler requests yield one `201`, five `200`, and exactly six quota increments. Further gates verify one quota effect after lost acknowledgement without a second request, eight confirmed CAS failures ending in `503` with unchanged state, an unknown commit result without retry, and an actual competing rotation invalidating stale quota authority before any increment. This is local protocol/native-handler evidence, not actual Upstash or deployed Redis HTTP traffic.

## Reproduction

From the integrated checkout with Node 22.18+ and installed dependencies:

```text
node --check scripts/test-open-bazaar-independent.mjs
node scripts/test-open-bazaar-independent.mjs
# Or, before the reviewer commits are integrated:
node scripts/test-open-bazaar-independent.mjs --checkout ../mission-consolidation
node --experimental-strip-types scripts/test-open-bazaar-independent.mjs --independent-redis-protocol ../mission-consolidation
node scripts/diagnose-workspace-file-concurrency.mjs
```

Build the integrated candidate before the full command. The acceptance refuses `.env`/production environment files, starts its own loopback Next processes with an environment allowlist, blocks external `fetch`, and uses fresh synthetic credentials. Its output gives a temporary directory with workspace state containing hashes only. Both helpers retain synthetic credentials in separate private recovery packets outside the repository; the delegated agent directory contains only `agent.json`. It never accepts an externally supplied base URL. Host spoof probes use `node:http`, because Node 22 fetch silently ignores an explicit Host override. File diagnostics expose only whitelisted phase/errno codes.

## Acceptance gates

- Public discovery and skills remain readable; private task/history tools deny public or unknown access.
- Workspace creation authenticates bootstrap before replay, allocates owner/workspace/agent on the server, rejects client authority and hash collisions, and preserves one intent across concurrent file-backed HTTP processes: exactly one `201`, then only `200` for identical inputs.
- Human, agent, bootstrap, provider submission, and legacy history accesses retain distinct authority. Human cannot record operations/activity or claim/answer tasks; bootstrap cannot read private history; another owner cannot observe or link private data.
- Human message queues a task; agent claim is stable; MCP writes use native operation/activity schemas; the human sees the same synthetic result in its history; responses link only this owner's operation.
- Frozen creation/claim/operation/response replays are idempotent; changed bodies conflict. A restart recovers the original result and messages without reexecuting a task.
- Rotation invalidates original access without changing ownership. Generation CAS rejects stale administration. Creation replay never restores rotated/revoked access; revoked intents retain tombstones.
- File state contains no raw credentials. Selecting unconfigured Redis fails closed without a file fallback. Existing synchronous legacy authentication retains read/write permissions.
- Simultaneous generation CAS has one winner. Corrupt registry, incomplete owner document, pending transaction evidence and a persistent stale lock fail closed without being silently cleared or overwritten.
- Authenticated human/agent delivery listing for this owner's inline operation returns `200`, empty versions and `inlineOnly: true`; another owner's operation returns `404`, malformed/missing queries return `400`, and every anonymous file creation/upload/confirmation/access POST remains `403`.
- An authenticated provider request remains separate from workspace/history access. The helper retains its immutable accepted receipt through successful and failed status checks; explicit retry after confirmed intake rejection reuses the same frozen intent.
- Actual SDK discovery advertises exactly 17 tools, including six writes, and agrees with HTTP health/capabilities. MCP creation/write/history contexts preserve Origin and configured loopback authority; denied reads return no owner, task, operation, or result text.
- Whitespace in accepted conversation titles, human messages and agent responses is preserved. Reusing their IDs with trimmed content conflicts rather than replacing or silently normalizing the intent.
- The published workspace command sequence works with the real helper and SDK: prepare/create/tasks/claim/record/activity/respond/recover/rotate/revoke. The delegated packet needs no bootstrap/human secret. Original receipts and frozen response attempts remain unchanged through replay and credential administration.
- The configured Redis protocol reconciles identical confirmed-CAS creation races by reading only. Quota contention has at most eight confirmed-CAS attempts with current authority revalidation; exhausted contention, unknown results and lost acknowledgements fail explicitly without unsafe automatic retries.

## Evidence limits and remaining checks

The file-backed HTTP test is distinct from a Redis protocol double and from actual Upstash. No actual shared Redis availability, durability, capacity, or HTTP contention behavior is inferred from these local results. Even successful store-level reconciliation cannot establish that concurrent Redis request-quota mutations always succeed. Actual Upstash requires a fresh approved budget.

The workspace helper and full black-box lifecycle were independently executed. Chat fragment/memory/lock/reentry and manual delivery refresh behavior were reviewed in source and the authors' hook/HTTP doubles reproduced; these are distinct from an independent browser runtime test. The coordinator reports real browser checks for 390/1366 widths, keyboard lock/reentry, inline result and activity; those remain separately attributed evidence. A human check at 200% zoom remains pending because the attempted in-app browser zoom did not change the rendered scale. An independent external user following only deployed instructions remains untested.

The independent Redis protocol test reproduces the installed SDK's `retry: false` behavior: two wire requests after acknowledgement loss. It uses the actual `configuredWorkspaceStore()` and verifies its `retry: {retries: 0}`, `enableAutoPipelining: false` configuration with lost acknowledgements for creation, access rotation, operation recording and request counters. Each uncertain mutation is sent once; explicit exact replay recovers the original receipt/result, and changed content conflicts. The simultaneous creation and bounded quota gates also pass on `a480494`. A tightly scoped transport adapter maps only its synthetic HTTPS loopback origin to a local HTTP REST double. This tests the installed SDK/configuration/CAS protocol, not TLS or actual Upstash. The author's separately written protocol/quota tests were reproduced as supporting evidence.

## Practical contract and next decisions

Anonymous workspace creation requires Node 22.18+, this checkout's installed SDK dependencies, a private terminal directory, and a deployment with open workspaces explicitly enabled. It requires no email or admission approval. Three independently generated secrets separate bootstrap administration, human conversation/history access, and the external agent. Owner and stable agent identity come from the server; a caller cannot route another owner's writes or impersonate the human through tool arguments.

The chat is a durable human-to-external-agent task channel. An external agent reads/claims tasks, preserves its own execution evidence, records the inline unpaid operation/activity through the existing native handlers exposed by MCP, and responds with that same owner's operation link. The human sees the same result in its private history. Hosting a model or automatically purchasing a service is outside this implementation. History writes do not require a second storage/authentication system.

Recovery keeps the frozen creation, claim, response, submission and access-change inputs. Accepted receipts are immutable; later statuses/errors are separate snapshots. A confirmed intake rejection permits an explicit same-intent retry. A lost acknowledgement, conflicting administration, pending journal, corrupt document or stale lock requires inspection/recovery; none proves that an external effect did not occur, and none authorizes replacement IDs or automatic payment retries.

Before considering public use: retain the lost-acknowledgement, bounded Redis CAS and file contention gates; complete browser zoom and independent guide onboarding; then separately validate a fresh shared Redis deployment and public endpoint with explicit capacity/retention settings. The diagnosed file contention, identical-creation races and bootstrap administration race are corrected and independently pass within the tested scope. Sustained Redis contention can still exhaust the bounded counter attempts and return an explicit `503`; no claim of unlimited contention tolerance follows. Public provider registration remains a private review request; domain proof, independent review, activation and paid delivery are separate stages.

The release is local until a separate reviewed deployment and public read smoke exist. First external submission, domain-control review, public provider activation, and paid execution remain separate acceptance stages.
