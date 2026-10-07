# Measured Vercel deployment transport

`scripts/open-vercel-transport.mjs` performs direct native HTTPS, using the
protocol inspected in the locally installed Vercel CLI **58.9.4**. It does not
launch the CLI. The installed CLI's upload path has five retries and its
status/log paths also retry; those behaviors cannot satisfy this acceptance.
Preparation and the local test perform no remote operation or credential read.

The inspected sources are the installed CLI's
`dist/chunks/chunk-3GTCSDQR.js` (`prepareFiles`, `uploadFiles`, `postDeployment`)
and `dist/commands-bulk.js` (`fetchRequestLogs`), plus the historical
`mission-consolidation/scripts/prepare-x402-vercel-preview.mjs` and
`docs/evidence/sprint-public-pilot/audit-preview-upload.mjs`. The requested
`network-transfer-helper.mjs` is an encrypted local handoff helper rather than
a deployment API implementation. None of those historical executable modules
is imported or run by this helper.

## Exact contract

```js
import {
  prepareOpenVercelTransfer, createOpenVercelTransport, openVercelReservation,
} from './scripts/open-vercel-transport.mjs';

// The existing project/team, audited build and reviewed private options come
// from the root's frozen plan and private in-memory/pipe loader.
const transfer = await prepareOpenVercelTransfer({
  root: absoluteTrustedSourceRoot,
  planId: frozen.planId,
  sourceSha: frozen.sourceSha,
  projectId: existingProjectId,
  teamId: existingTeamId,
  name: reviewedProjectName,
  target: 'preview', // or explicit reviewed 'production'
  autoAssignCustomDomains: false, // true only for reviewed production
  productionOrigin: frozen.origin, // exact definitive origin
  mode: 'prebuilt-upload', // alternative: 'source-inline'
  files: auditedFiles, // [{path,size,sha1,sha256,mode?}]
  auditedExtraPaths: [], // explicit reviewed prebuilt filePathMap references
  deploymentOptions: privateReviewedDeploymentOptions,
  limits: {
    maximumStatusReads: reviewedStatusReads,
    maximumLogPages: reviewedLogPages,
    maximumRequestBytes: reviewedRequestCap,
    maximumResponseBytes: reviewedResponseCap,
    requestHeaderBytes: reviewedHeaderCap, // 8192..65536
    timeoutMs: reviewedTimeout, // 1000..60000
  },
  // Omit with maximumLogPages=0; otherwise freeze a <=15 minute interval.
  logWindow: {startDate: frozenStartMs, endDate: frozenEndMs},
});

// Review transfer.plan publicly. The opaque upload/body object stays private.
// Freeze BOTH transfer hashes and segment UUIDs in frozen.vercelTransfers:
// [{segmentId,transferHash}, {segmentId:replacementId,transferHash:replacementHash}]
// For production autoassignment, freeze verified existing project/domain proof:
// frozen.deploymentProject={projectId,teamId,origin:frozen.origin,
//   customDomains:['bazaar.browns.studio'],verified:true,evidenceSha256}.
// Before freeze: root:deployment.maximumCalls=2 and its per-segment reservation
// must dominate BOTH deployment transfer reservations component by component.
const minimum = openVercelReservation(transfer.plan);

const transport = await createOpenVercelTransport({
  ...transfer,
  acceptancePlan: frozen,
  controller: sharedController, // preparation controller before first deploy
  journal: privateStore.journal('vercel.' + segmentId),
  segmentId, // frozen UUID; independent initial/replacement segments
  acquireLock: () => privateStore.acquireLock('vercel.' + segmentId),
  credentialProvider: loadExistingConfiguredVercelTokenIntoMemory,
});
try {
  const created = await transport.uploadAndCreate();
  // Call explicitly, at most the frozen count, until READY. No helper polling.
  const current = created.readyState === 'READY'
    ? created : await transport.readStatus();
  const beforePayment = await transport.checkpoint();
  // Require current.readyState==='READY' and beforePayment.complete===true.
  // This records verified root transport in the shared controller.
  // The runner still requires source/deployment/private PASS/catalog gates.

  // After the frozen server window ends, call explicit page reads until the
  // returned hasMoreRows is false, without exceeding maximumLogPages.
  const page = await transport.readLogPage();
  // page.value contains PRIVATE raw log messages. Never print/save publicly.
  // Root extracts sanitized numeric API/SSR/proxy ALS rows independently.
  const final = await transport.finish();
  // Require final.complete for a complete final transport record; verify
  // server-window ALS/export completeness separately in the controller.
} finally {
  await transport.close(); // drains, drops token reference, releases lock
}
```

There is intentionally no executable deployment CLI. The root must construct
this call in its gated private orchestrator. Authentication is supplied only
after the aggregate reservation and the pending request's encrypted fsync.
The helper never reads environment variables, CLI credential files, wallets,
or private historical packets. Keep private options and credentials out of
arguments, public files and logs. Recompute the prepared public transfer plan
from the same audited files/options in the execution process and require its
`transferHash` to equal the independently reviewed value before constructing
the transport. The constructor requires that hash and segment UUID in the two
frozen `vercelTransfers` entries, so config/body changes after review reject. The `opaque` object cannot be serialized as a secret packet.

Each source-inline file must be in the historical source allowlist. Prebuilt
files must be below `.vercel/output/`, or an explicit reviewed extra path used
by Build Output filePathMap. The caller supplies a trusted repository root;
the helper rejects links/junctions in the root and every relative component,
parent traversal, private upload filenames, changed size/SHA1/SHA256 and
literal seeds/private keys/tokens. Modes accept permission bits or the CLI's
full regular-file stat mode. No generated directory is gathered implicitly. Prebuilt builder junction aliases
remain rejected; the root/ops must audit mappings/target hashes and materialize
regular files before preparing this transfer. Per-file hardlinks inside the
trusted output can avoid duplicate disk data. Logical manifest/create-body
bytes still count separately from deduplicated upload blob bytes. There is no
arbitrary file-row ceiling; exact body/request/aggregate limits apply.

## Requests and reservation

Prebuilt mode sends one `POST /v2/files?teamId=...` per unique audited SHA1,
with binary body and `x-now-digest`/`x-now-size`; **all uploads precede exactly
one** `POST /v13/deployments?teamId=...&forceNew=1&prebuilt=1`. Its file entries
are the CLI's `{file,size,sha,mode?}`. Source-inline mode sends only one create,
with `{file,data,encoding:'base64'}`. Files, existing identity, explicit target,
domain-assignment setting, source SHA and configuration hash are bound into
the private body hash/public transfer hash. A missing-files rejection stops.
There is no create repost, token refresh, retry or redirect. Production
autoassignment is permitted only with the exact definitive origin and a frozen
verified existing project/team/domain proof whose only custom domain is
`bazaar.browns.studio`. The root must review/currently verify that evidence:
Vercel autoassignment applies the project's configured domains. The helper
does not itself read or alter project/domain settings.

READY reads are explicit `GET /v13/deployments/{id}?teamId=...`. Response ID,
project, target, origin and all four `open*` metadata bindings must match.
Request logs use **`https://vercel.com/api/logs/request-logs`**, with fixed
projectId/ownerId/deploymentId, inclusive startDate/endDate and sequential
page numbers. Both HTTPS origins must appear in the reviewed transport plan.
There are no source/search filters hiding API, SSR or proxy rows. Pagination
with a missing schema, more pages than budget, or truncated messages cannot
produce complete final log evidence. Vercel's API/export retention or omitted
rows must still be assessed independently; a last page does not prove every
physical server request was returned.

For U unique uploaded blobs, S status reads and L log pages, the aggregate
reserves N=U+1+S+L HTTP/external requests (U=0 for inline), total upload bytes
plus create-body bytes plus N times the header cap outbound, and N times the
response cap inbound. Redis resources here are zero; the acceptance controller
adds and conserves its own CAS cost. The helper requires the frozen root
profile to cover that entire aggregate before credential access or HTTPS.
Every request then appends an encrypted pending record before sending,
invalidates the root segment before credential/network access, checks remaining
aggregate bytes/calls, and captures actual serialized HTTP bytes. An in-flight
request blocks payment reservation and also the POST of an already reserved
payment. A new checkpoint after completion is needed before a later payment.
All upper bounds stay charged; no successful response releases a reservation.

Uploads and create attempts have durable markers written before each effect.
A lost response, failed journal write, unexpected response or capture mismatch
stops the segment. Reopening uncertain/pending state and effect reposts are
forbidden. Successful reopening may perform remaining explicit read-only
status/log calls with the same frozen transfer/segment and exclusive lock;
it may not repeat uploads or creation. Unknown deployment creation without a
confirmed ID requires manual read-only investigation outside this helper.

## Capture limits and evidence

Each request uses a separate native HTTPS socket (`agent:false`), HTTP/1.1
only, identity encoding and a finite deadline. Before sending, the helper
checks Node's actual serialized header length. It counts/hashes socket writes
and incoming decrypted data, including status/header lines and HTTP chunk
framing. The outgoing hash must match exactly the serialized request header
plus the frozen body. Reports contain counts, hashes and sanitized deployment
identity, never tokens, request headers, body values, log messages or raw bytes.

This is **HTTP plaintext representation**, not physical-wire byte capture.
It excludes TLS handshakes/record overhead, DNS, retransmissions and other
processes. A response cap can stop processing only after the offending data
chunk arrives; partial observed bytes are retained as uncertain evidence, and
must never be represented as a successful in-budget capture. An error also
invalidates the shared root segment immediately. Its incomplete marker retains the full actual partial counts. The controller
persists over-bound observations and sticky uncertainty before reporting a
bound violation; it never clips bytes to make them fit. Uncertain or decreasing
counters cannot restore a payable state.
The root must stop on every error and recheck the latest capture before a
wallet callback. It must not continue using an earlier verified checkpoint.

`checkpoint()` attests the performed exchanges through its timestamp after
READY, within the already fully charged future upper bound. Later explicit
reads append to the same segment and update cumulative evidence. `finish()`
additionally requires the planned log window to have closed and its export to
end without truncation. `readLogPage()` rejects before the frozen endDate, so
an early empty response cannot be mislabeled as a completed final export.
Neither attests browser HAR, all-actor ALS export, runtime configuration,
domain routing or independent review; those remain separate required gates.
An injected test transport is permanently `SYNTHETIC_ONLY` and always records
`complete:false`, so unit fixtures cannot authorize a real payment.

Run locally:

```powershell
node scripts/open-test-vercel-transport.mjs
node scripts/open-test-acceptance-controller.mjs --source-root .
```

The transport fixture uses only synthetic in-memory HTTPS events and temporary
public files. It checks fragmented/chunked byte hashes, aggregate/journal order,
one creation, private report redaction, replay/tamper, lost response, missing
files, 429, caps and incomplete exports. It reads no existing credentials,
creates no deployment and cannot grant an independent review PASS.
