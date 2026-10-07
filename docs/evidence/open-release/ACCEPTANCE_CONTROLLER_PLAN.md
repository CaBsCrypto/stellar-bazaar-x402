# Prospective acceptance controller for the definitive domain

This controller prepares the new acceptance run for `https://bazaar.browns.studio`. Preparation and local tests perform no network requests, deployments, wallet reads or payments. The previous 190 HTTP allocation is exhausted and remains historical evidence. This run uses a fresh plan ID and only `bazaar-open-acceptance:{planId}:ledger`; it never resets or edits historical application records.

The owner must review a complete explicit resource allocation before execution. There is no live default allocation. The local fixture deliberately uses large synthetic limits to prove that the old 190-row ceiling is absent; those limits are not a proposed production budget. The last reported hosting credit remaining was USD 1.27, so confirm the current credit and Redis allocation before freezing a live plan.

## Files and local verification

The new scripts are `open-acceptance-plan.mjs`, `open-acceptance-controller.mjs`, `open-acceptance-runner.mjs`, `open-browser-capture.mjs` and `open-test-acceptance-controller.mjs`. They reuse the public external buyer and seller implementations. The buyer controls orders through public MCP with Bearer access and submits x402 payment directly through HTTP. The seller uses its own credentials and its existing HTTP provider adapter. No Vercel bypass or Bazaar-held signer is used.

Run from the final integrated checkout:

```powershell
node scripts/open-test-acceptance-controller.mjs --source-root .
node --check scripts/open-acceptance-plan.mjs
node --check scripts/open-acceptance-controller.mjs
node --check scripts/open-acceptance-runner.mjs
node --check scripts/open-browser-capture.mjs
node --check scripts/open-test-acceptance-controller.mjs
git diff --check
```

The local test installs a failing global `fetch` and supplies memory transports. It checks reservation before transmission, rejected responses, exact two payment reservations, provider execution only once for the first operation, source/runtime changes, encrypted fsynced state, lockstep Redis CAS, lost acknowledgement before target effects, monotone read recovery, profile exhaustion, more than 190 rows, ALS numeric validation and incomplete DOM coverage. A local PASS does not grant the independent private review PASS. Tests were run on Windows with Node 24.14.0; exact Node 22, macOS and Linux execution remains unverified.

## Public input, preparation and final source freeze

The public draft has `version: 1`, `kind: "open-release-acceptance-draft"`, definitive `origin`, exact `redisOrigin: "https://smooth-dory-323957.upstash.io"`, the existing HTTPS `providerOrigin`, and `historicalEvidence: {sha256, old190HttpBudgetExhausted: true}`. It contains the final public card and canonical card hash, the declared second failure reason, and precisely two orders with `amountAtomic: "100000"` and their final input objects. New operation IDs do not require new owners, credentials, wallets or an independent spend ledger. Missing operation and seller attempt UUIDs are generated once by `prepare`; keep that prepared file. Never regenerate it to recover an uncertain run.

`participants` contains exactly two distinct existing owners, first seller and second buyer, with public labels bounded to A/B/C/D, public owner IDs, agent IDs and existing Stellar public wallet addresses. Existing A/B identities are valid; labels do not confer permissions. Preserve their credentials and funded wallets. The card must specify official Stellar testnet USDC, amount `0.01`, the existing seller's destination, the public buyer identity, and `x402-stellar-exact-v2`. Private access, provider access and signer material are forbidden in this draft.

`limits` must explicitly contain all six nonnegative integer resources:

```json
{"httpRequests": 0, "redisRestExchanges": 0, "redisCommandsUpperBound": 0,
 "outboundBytes": 0, "inboundBytes": 0, "externalRequests": 0}
```

The zeroes illustrate the field names and are not executable limits. The draft also supplies `profileSpecs`, or complete manually reviewed `profiles`. A specification declares the maximum call count, role, client request maximum and response maximum. Preparation derives application reservations from the current integrated `lib/operational-envelopes.ts`, using a TypeScript AST without evaluating server source. The latest corrected envelopes are authenticated 72 Redis REST / 330 commands / 72 MiB Redis output / 44 MiB Redis input and recovery 44 / 330 / 52 MiB / 34 MiB. Recovery external output is 576 KiB. Public remains 7 / 12 / 192 KiB / 6 MiB. The executable freeze reads the actual final source; these numbers do not override it.

The application vector adds one incoming application HTTP request, Redis REST and allowed server external requests to the HTTP count. It adds external payload and DTO maxima to the server output bound, external payload to the input bound, then adds the owned client's explicit maximum request/response bytes. Each exchange also reserves one controller Redis REST / three commands / 32 KiB output / 8 KiB input. The Lua script has one GET, one SET and its EVAL command; it has no loops or application keys. Capacity CAS has five keys and eight inner commands plus EVAL; operational budget CAS has GET, SET and EVAL plus its HTTP gate GET. These server costs are already in the final role envelopes and must not be added a second time.

The actual retained-store basis includes market 512 KiB, settlement 128 KiB, review 1 MiB workspace registry 1 MiB, per-owner document 128 KiB, aggregate workspace 12 MiB and an additional 4 KiB permission reservation per owner. Registry/owner/global bounds are separate. Registry escaping and quota retries are covered by the corrected source envelopes. Storage projections are ceilings, not observed database size. The old 49 KiB acceptance cap is not used.

Use explicit counts for all planned endpoints, including rejected authentication and reads after the replacement deployment:

| Profile | Purpose | Source role |
| --- | --- | --- |
| `http:catalog` | Public catalog/card/status/purchase | public |
| `http:discovery:resources`, `http:discovery:search` | Explicit rejection probes; marketplace mode closes legacy discovery | public |
| `mcp:initialize`, `mcp:tools/list`, `mcp:get_bazaar_capabilities`, `mcp:get_bazaar_skills` | Optional metadata/skill checks | public, workload metadata |
| `mcp:list_market_services`, `mcp:list_services`, `mcp:search_services`, `mcp:get_service` | Public MCP discovery | public |
| `mcp:create_market_order` | Two new frozen orders | authenticated |
| `x402:challenge` | Existing frozen order's challenge | recovery |
| `x402:pay` | One signed submission per frozen order | authenticated |
| `mcp:get_market_order`, `mcp:list_market_orders`, `mcp:get_operation_history` | Private status/history and replacement recovery | recovery |
| `mcp:claim_market_order`, `mcp:deliver_market_order`, `mcp:fail_market_order` | Frozen seller attempt and terminal result | recovery |
| `http:orders:read`, `http:orders:list`, `http:history` | Optional private HTTP evidence | recovery |
| `rpc:getLatestLedger`, `rpc:simulateTransaction`, `horizon:account` | Bounded existing-wallet/RPC evidence | external |
| `provider:execute` | Exactly one first-order execution | external |
| `browser:*` | Entire page/session reservation before navigation | explicit aggregate |
| `server:*` | All actors, including public/rejected API, SSR and proxy traffic | explicit aggregate |

For example, one profile specification is:

```json
"mcp:create_market_order": {"kind":"application", "operationalProfile":"authenticated",
  "maximumCalls":2, "maxRequestBytes":65536, "maxResponseBytes":262144}
```

Browser and `server-window` specifications must include their full resource vectors and maximum calls. Global server reservations cover all actors conservatively and can overlap owned and browser reservations; no upper bound is released or subtracted. Server windows are at most 15 minutes and require source-bound proof of the configured application-wide guard. A window reservation must be acknowledged before any new payment or other effect.

```powershell
node scripts/open-acceptance-plan.mjs prepare PUBLIC_DRAFT.json NEW_PREPARED.json
# Integrate all corrections, commit executable files, and complete local checks first.
node scripts/open-acceptance-plan.mjs freeze NEW_PREPARED.json NEW_FROZEN.json
```

Outputs use exclusive creation. Freeze requires the final committed executable checkout to be clean. It hashes every tracked executable/configuration file, package-lock, both operational envelope and budget sources, the Node binary/version/OpenSSL and installed critical SDK/compiler entry points plus their package metadata. Markdown/evidence artifacts, `.next` and `node_modules` are excluded from the tracked source manifest. Installed entry-point hashes do not attest every transitive npm file; the independent reviewer must also verify the clean lockfile installation/build provenance. Both deployments use this same SHA and manifest. A code, dependency or Node change requires a new review before effects.

## Review, deployment proof, owner consent and private runtime

An independent reviewer supplies a public artifact of kind `open-controller-private-review`, status `PASS`, `independent: true`, exact `sourceSha`, `filesHash`, `planHash`, `remoteRequests: 0` and `realPayments: 0`. The authoring test cannot issue this review.

Read-only preview/capture can use a READY deployment proof with the exact definitive origin, `dpl_` ID, source SHA and files hash. Configure `BAZAAR_OPERATIONAL_METER=true` and keep `BAZAAR_ACCEPTANCE_METER` disabled: the old acceptance branch rejects the new capacity CAS. Payment additionally requires `publicDomainVerified`, `operationalMeterVerified`, `configurationVerified`, and a 64-character `payloadFingerprint`. The global server allocation is bound by `globalServerBudgetHash` and `globalServerBudgetVerified: true`. `serverWindow` contains the selected `profile`, fresh `windowId`, `startsAtMs`, `endsAtMs` and identical `serverBudgetHash`; the runner reserves it before loading a wallet.

Owner consent is `OWNER_AUTHORIZED_TWO_NEW_TESTNET_PAYMENTS` with the exact plan hash, source SHA, independent review hash, `maximumPayments: 2`, `totalAtomic: "200000"`, and the two frozen operation IDs in order. It covers 0.01 official testnet USDC for the delivered first order and 0.01 for the declared failed second order. No faucet, new funding, third payment, signing retry or provider execution for the second order is authorized.

The CLI accepts secrets only through the existing private input helper. From an owner-controlled process, write one bounded JSON packet directly to the child's private stdin; do not interpolate it into a shell command, argv, environment or plaintext file. Required private packet fields are `controllerPassword`, `controllerDirectory`, `createController`, `redisCredential`, `buyerPassword`, `buyerDirectory`, `sellerPassword`, `sellerDirectory`. The existing buyer/seller encrypted stores must already match the existing seller/buyer owners and wallets and the card. The controller uses an exclusive encrypted-store lock and an encrypted fsynced journal.

Exact child argument vectors are:

```text
node scripts/open-acceptance-runner.mjs buy 0 NEW_FROZEN.json DEPLOYMENT.json REVIEW.json CONSENT.json --secret-stdin
node scripts/open-acceptance-runner.mjs buy 1 NEW_FROZEN.json DEPLOYMENT.json REVIEW.json CONSENT.json --secret-stdin
node scripts/open-acceptance-runner.mjs recover 0 NEW_FROZEN.json REPLACEMENT.json REVIEW.json CONSENT.json --secret-stdin
node scripts/open-acceptance-runner.mjs recover 1 NEW_FROZEN.json REPLACEMENT.json REVIEW.json CONSENT.json --secret-stdin
```

Root may call exported `runOpenAcceptanceOrder({plan, authorization, index, controllerOptions, loadPrivateRuntime})` instead. `loadPrivateRuntime` executes after the full public gate and global reservation. It can unwrap an existing DPAPI packet in process memory and return the same existing owner signer/options and encrypted journals, without modifying historical packets. The callback returns `{buyer:{options,journal}, seller:{agentAccess,providerAccess,journal}, dispose}`. The runner replaces both buyer network transports and MCP control with the shared controller, and wraps the existing durable spend reservation before signing. Raw fetch is injected only into the reviewed controller; SDK RPC uses the explicit measured RPC transport. No SDK HTTP reconnect/payment retry is enabled.

## Recovery, replacement and evidence

Every owned request is journaled and fsynced before the isolated Redis CAS, then before target transmission. Responses require bounded payloads and the source-bound numeric operational headers. Rejected responses still consume their full allocation. Lost Redis acknowledgement means zero target transmission and an uncertain retained reservation. Lost target response, missing meter, excessive bytes, server uncertainty or capacity errors stop the run. No automatic retry occurs. Original buyer/seller journals, operation IDs, attempt IDs and spend reservations remain unchanged.

Explicit recovery performs a counted GET of the isolated controller ledger, preserves all conservative local totals, and reads the original operation. It never clears uncertainty, signs, posts payment, claims, delivers, fails or executes a provider. Existing started phases cannot run again. A replacement is bound with `controller.bindReplacement` to distinct deployment IDs, the same SHA/files hash/origin, and equal payload fingerprints before the read-only persistence checks. New effects require separate owner/reviewer handling if a phase is uncertain.

Before each browser navigation, root calls `reserveBrowserNavigation` with the frozen browser profile, fresh segment ID, origin and path. `openDomEvidence` records actual DOM/screenshot hashes, viewport, zoom and keyboard/mobile observations. It always reports `DOM_ONLY_INCOMPLETE`, `captureComplete: false`, `networkVerified: false` and `physicalWireObserved: false`. CUA-only screenshots or DOM snapshots cannot produce a network PASS.

When actual complete private HAR and NetLog captures exist, `openNetworkCapture` validates the full isolated session, source/deployment/segment binding, frozen counts and bytes, redirects/retries, and unknown transport evidence through the existing parser. It still makes no physical-wire claim. Raw captures remain private; only sanitized hashes and numeric reports enter public evidence. `recordBrowserEvidence` stores the result.

Root exports complete source/deployment/time-bound ALS logs covering API, SSR and proxy scopes, including anonymous and rejected requests and other clients. Feed sanitized numeric rows to `recordServerWindowEvidence`; duplicate request IDs, unknown/missing numeric metrics, exceeded limits and uncertainty fail closed. Incomplete exports report `GLOBAL_SERVER_CAPTURE_INCOMPLETE`. The reserved aggregate remains charged. This controller cannot itself prevent an unowned browser or external actor from transmitting; completeness requires the configured server guard plus complete ALS evidence.

Deployment control-plane calls, log retrieval and any other root-owned outbound transports are driven by root rather than the buyer/seller helper. Root uses a `root-transport` profile (with frozen HTTPS origin and explicit full reservation), `reserveRootTransport` before transmitting, and `recordRootTransportEvidence` afterward to include them in the same reviewed allocation; do not claim end-to-end accounting if they use an unmeasured CLI/connector. A reviewable plan and local PASS do not imply that the two live payments, provider result, physical/browser capture, deployment persistence or global traffic coverage have been performed.

## Preparation mode and mandatory hosted preflight

Root constructs `createOpenAcceptanceController({plan, authorization:{source,review}, preparation:true, journal, redisExchange})` before the first deployment. This mode still requires the frozen clean source and independent private PASS, and shares the exact eventual encrypted journal and isolated Redis ledger. It can reserve root transport segments and record their evidence; it cannot issue application requests or reserve payments. `root:deployment` must declare exactly two maximum calls, covering the initial deployment and same-source replacement. The public origin for Vercel control transport is `https://api.vercel.com`; credentials remain private process memory.

For each root segment, `reserveRootTransport({profile,segmentId,origin,payloadSha256})` returns the acknowledged reservation. Root then performs its separately reviewed bounded transport and supplies `recordRootTransportEvidence({segmentId,sourceSha,planHash,origin,payloadSha256,captureSha256,complete,uncertain,observed})`. `observed` is the six-field resource vector. A nonempty actual capture is required for `complete:true`. Unknown CLI/connector traffic stays `ROOT_TRANSPORT_CAPTURE_INCOMPLETE`; all upper bounds remain charged and signing stays blocked. An empty list of root segments cannot authorize a payment.

After the deployment proof exists, the full controller requires at least one verified `root:deployment` segment and requires every reserved root segment to have complete capture before signing. The runner also calls `verifyHostedPreflight()` before loading the private wallet runtime. This issues a counted real catalog GET through the controller, requires a successful bounded response with operational v1 metrics, `paused:false`, and the activated card with the exact frozen hash, and fsyncs the actual response hash plus source/deployment binding. Missing root capture or hosted preflight rejects `reservePayment`. This is evidence for the owned HTTP exchange; it does not turn DOM-only browser evidence or an incomplete global ALS export into a coverage PASS.

## Existing DPAPI runtime adaptation

Read only the previous runner source to identify fields; do not open an owner packet during preparation or review. The old source maps `packet.sale.wallets[1].secret` to the existing buyer signer, `packet.identities[1].agent` to the buyer access, `packet.identities[0].rotatedAgent` to the existing seller access, and `packet.sale.worker` to the provider access. These private values are read only inside root's gated in-memory callback. No Bazaar bypass is forwarded to the public domain.

Return exactly the new runner's journal interfaces. A buyer journal is `createDpapiBuyerJournal(absoluteNewOperationPath)` from `examples/marketplace-x402-buyer.mjs`, or a previously configured `store.journal(name)`: both provide `read()` (missing file throws `ENOENT`), `initialize(intent)` and `append(intent)`. `createDpapiBuyerJournal` validates buyer intents and must not be used for generic controller or seller snapshots. The generic encrypted store's `journal('open.' + planId)` serves the controller, and `journal('seller.' + operationId)` serves the new seller worker. Each new buyer operation gets its own path/name; historical intents stay intact.

Construct the signer as `{address:key.publicKey(), ...basicNodeSigner(key, Networks.TESTNET)}` after asserting it equals the frozen existing buyer wallet. Return buyer options with `origin`, `agentToken`, this signer, `rpcUrl:'https://soroban-testnet.stellar.org'`, and `reserveSpend:value => spend.reserve(value)` plus the separate buyer journal. The runner supplies the measured network transports, MCP order control, and intent persistence. Return seller `{agentAccess,providerAccess,journal}` and a disposer that clears the in-memory key.

Reuse the existing owner budget source from the old runner: `packet.x402.spendReservations`, including every historical or uncertain reservation. `createBuyerSpendBudget({maximumAtomic, reservations, persistReservations})` copies and validates this list and appends only after durable persistence. The owner-authorized additional two 0.01 payments require an explicit maximum increase of `200000` atomic units over the retained owner maximum, once, recorded with the new plan/consent hash. For example, a retained `200000` maximum becomes `400000`; no reservation is deleted. On recovery reload that persisted increased maximum instead of adding another increase. Keep the old sale fields and old HTTP counters unchanged.

Root's `persistReservations` updates that same existing owner's reservation ledger and seals/fsyncs it using the already reviewed DPAPI persistence helper. It must not substitute a fresh empty reservation array, a fresh same-wallet portable store, or a new owner budget merely because the prospective transport plan has a new plan ID. Any unconfirmed budget or intent write stops before signing/posting, with the reservation retained.
