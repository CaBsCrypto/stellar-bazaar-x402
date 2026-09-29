# Seller entry: five-sprint review

Date: 2026-09-29. Base: `28a3c83`, branch `mission/identity-pilot`, plus the uncommitted seller changes described below. Coordinator: root; specialists: seller_public_audit, seller_flow_audit, seller_instruction_audit. No payments, provider execution, external submissions, Redis writes, push or deployment.

## Board and acceptance

| Sprint | Work / owner | Result |
| --- | --- | --- |
| 1 | Published instructions and MCP / public audit | Read-only production audit found stale llms instructions advertising execution and provider-key ingestion; live MCP has eight read-only tools. Repository docs URLs return 404. |
| 2 | Reproduce seller path / flow audit | Existing scriptwriter was added to static catalog in `13a16e4`. This does not establish self-service onboarding. Queue is process memory; proof/review functions have test callers only. Numeric domains crash and expired submissions can transition. |
| 3 | Correct local candidate / instructions + flow + coordinator | Publicly served seller guide, corrected references/examples, local review packet CLI, explicit MCP onboarding limits, retained receipt/manual copy, malformed-domain and expiry fixes. No new account requirement. |
| 4 | Independent review / public audit | Packet, real local MCP, malformed-domain and expiry tests independently reproduced. Approved for local preparation/validation only. Cold preparation needed a local validator harness; not claimed as autonomous public onboarding. |
| 5 | Release readiness / coordinator | Types, webpack build and nine suites pass; localhost available. Public autonomous submission-to-listing remains blocked below. This is not a completed public release. |

## Reproduction

From this repository with installed dependencies:

```text
node scripts/test-provider-self-listing.mjs
node scripts/test-seller-mcp.mjs
node scripts/test-seller-instructions.mjs
node scripts/test-provider-review-packet.mjs
node scripts/test-publisher-brief.mjs
node scripts/test-buyer-instructions.mjs
node scripts/test-provider-kit.mjs
node scripts/test-seller-form.mjs
node scripts/test-buyer-mcp.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build --webpack
```

All passed locally on Node 24. Build used no configured Redis and disabled intake/registry mutation. Build warning: metadataBase unset; no claim of a new CI result or Turbopack validation. MCP tests use real SDK, HTTP transport and handlers with synthetic storage. Form tests use component doubles, including absent/failed clipboard and retained 202 receipt. No notification-enabled public REST conformance call was made.

Manual browser checks on credential-free local production server `http://127.0.0.1:3252`: `/publish` at 390×844 and 1366×768, copy confirmation, disabled-intake explanation, no horizontal overflow (page widths 375 and 1351). `/hub` Publicar shows the new guide and copy confirmation. Clipboard failure and successful receipt paths are doubles, not a live public submission. Responsive checks do not constitute an exhaustive accessibility audit.

Optional local preparation:

```text
node scripts/prepare-provider-review.mjs path/to/service-card.json path/to/new-review-packet
```

This preserves a validated canonical card and pending review checklist; it neither submits nor publishes. Reviewers must inspect content before sharing: credential-field rejection is not a guarantee that arbitrary prose contains no secrets.

## Required next steps

1. Release the corrected public guidance through a reviewed change. Until deployed, recipients still see the stale production instructions; localhost is not available to remote attendees.
2. Persist submissions and state transitions across processes, with duplicate protection, bounded intake and test isolation. Do not enable the existing in-memory queue as a durable public workflow.
3. Provide an operator procedure that actually verifies domain control and records evidence/review. Never expose the internal `verified: true` setter as a public endpoint. Define the concrete operator handoff channel before advertising submission availability.
4. Verify separate authorized registry activation and public discovery of an approved synthetic service, without treating validation or staging as publication. Existing provider-specific updates/deletes remain disabled.
5. Run a fresh independent seller using only the deployed prompt/guide. Acceptance must include retained submission, actual review evidence and correct discovery; current approval stops at preparation and validation.

Payments, signing, historical deliveries, shared payment controls and multichain support are unchanged. No production readiness is inferred from these local tests.
