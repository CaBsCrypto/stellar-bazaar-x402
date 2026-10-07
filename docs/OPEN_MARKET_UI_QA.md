# Open market UI verification

Scope: `/open` (with `/pilot` retained as an access alias), `/hub`, `/publish`,
public catalog and private history. This is local UI evidence, not deployment,
Redis acceptance or proof of an actual payment.

## Automated local checks

`scripts/test-open-market-ui.mjs` runs the actual Next pages in Chrome, at 1440
and 390 CSS pixels. Every API response is synthetic, every external origin is
blocked, and the browser creates no real workspace, grant, service or payment.
The 50 checks passed:

- The public MCP URL/configuration are available before signup and have no token.
- Creating a workspace is disabled until the root file is downloaded and its
  saved copy confirmed. A lost acknowledgement is restored from that file and
  replayed with the exact creation UUID and hashes.
- The private importable MCP configuration includes only the agent token, with
  no human or bootstrap credential.
- Restoring the root file in history opens its human access. Agent access can
  read its orders/services and is directed to human access to manage grants.
- A grant change is saved before its POST. A lost acknowledgement is explicitly
  recovered with the same UUID, expected revision and decision, without a second
  change or automatic retry.
- Public catalog, own services and orders use manual 10/20-result pages and
  opaque cursors. Public requests have no Authorization header.
- Catalog pause, read failure and empty states are explicit. A failed refresh
  clears stale cards instead of continuing to label them active.
- History displays original order conditions, text and execution uncertainty.
  Reconciliation sends only `action: reconcile`; no wallet connection, new human
  order or signing flow appears.
- Blocking removes private content. Tokens from an access link are removed from
  the URL before private reads.
- Tabs support arrows/Home/End with matching focus; the mobile menu opens from
  Enter and restores focus on Escape. Open, publish, catalog, hub and private
  history have no horizontal overflow at the tested widths. No JS page errors.

The commands use an existing Playwright installation and Chrome; no package or
browser download is required:

```sh
# Start from this checkout with open/market flags enabled, without live backend credentials.
# Disable Next telemetry for this local verification.
node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3297

# Set PLAYWRIGHT_MODULE to its installed package/import URL if not resolvable locally.
# Set BROWSER_EXE to the installed Chrome executable if needed.
node --experimental-strip-types scripts/test-open-market-ui.mjs
node --experimental-strip-types scripts/test-history-entry-access-capsule.mjs
node --experimental-strip-types scripts/test-pilot-access.mjs
```

Local Next needs `BAZAAR_ENABLE_MARKETPLACE=true`,
`NEXT_PUBLIC_BAZAAR_MARKETPLACE=true`, `BAZAAR_ENABLE_OPEN_WORKSPACES=true`,
`BAZAAR_WORKSPACE_PUBLIC_ORIGIN=http://127.0.0.1:3297` and
`NEXT_TELEMETRY_DISABLED=1`. The runner only accepts `127.0.0.1`; it intercepts all
API calls and refuses external traffic. `UI_SCREENSHOT_DIR=docs/ui-evidence`
optionally writes the four screenshot files below. Windows sandbox socket
restrictions required approved loopback execution. Webpack was used because
Turbopack refuses this isolated clone's shared `node_modules` symlink.

The history capsule suite passed 30 in-memory component checks, including
malformed/oversized inputs, origin binding, human-only root extraction and late
file completions after access changes, lock and unmount. The access-packet suite
also passed preservation and collision checks. Neither suite sends network
requests.

Standalone TypeScript on the UI base reports the existing
`lib/marketplace.ts:47` two-argument `MarketStore.transact` integration mismatch;
the root's guarded-store implementation owns that interface. No UI TypeScript
diagnostics were reported.

## Visual review

The screenshots contain public synthetic cards or the pre-signup screen, with
no private access values. Reviewed the actual images for mobile wrapping and
desktop alignment:

- `ui-evidence/open-market-access-1440.png`
- `ui-evidence/open-market-access-390.png`
- `ui-evidence/open-market-catalog-1440.png`
- `ui-evidence/open-market-catalog-390.png`

Native browser zoom remains a distinct manual check. A headless viewport or CSS
scale does not establish native zoom behavior. On a local browser, set its own
zoom to 200%, visit open/hub/catalog/history and check that text, paging and
  confirmation controls stay usable without horizontal scrolling. Reset to 100%.
No native zoom result is claimed by these tests.
