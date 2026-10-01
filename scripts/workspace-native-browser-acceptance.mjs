import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function existingBrowserRuntime() {
  const packages = process.env.BAZAAR_NATIVE_PLAYWRIGHT_MODULES, executable = process.env.BAZAAR_NATIVE_CHROMIUM_EXECUTABLE;
  assert.ok(packages && executable, 'EXPLICIT_EXISTING_BROWSER_RUNTIME_REQUIRED');
  const { chromium } = await import(pathToFileURL(join(packages, 'playwright', 'index.mjs')).href);
  return { chromium, executablePath: resolve(executable) };
}
export async function preflightNativeBrowserAcceptance() {
  const { chromium, executablePath } = await existingBrowserRuntime();
  const browser = await chromium.launch({ headless: true, executablePath, timeout: 10000 });
  const result = { ok: true, chromium: browser.version(), dataRequests: 0 };
  await browser.close(); return result;
}

// Browser requests use the runner's public loopback proxy, sharing its global
// HTTP/Redis ledger and deadline. This helper never creates another workspace.
export async function runNativeBrowserAcceptance({ origin, fixture, plan, mode, evidenceDirectory, restartNext, signal }) {
  const { chromium, executablePath } = await existingBrowserRuntime();
  await mkdir(evidenceDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath, timeout: 10000 });
  const abortBrowser = () => { void browser.close().catch(() => {}); };
  signal?.addEventListener('abort', abortBrowser, { once: true });
  if (signal?.aborted) abortBrowser();
  const token = fixture.identities[0].tokens.human;
  const allTokens = fixture.identities.flatMap(identity => Object.values(identity.tokens));
  const p = plan.payloads, agentText = p.response.text.trim(), serviceTitle = p.operation.service.title;
  const cases = [], externalBlocked = [], pageErrors = [], requests = {};
  const staticTransport = { interceptedBrowserRequests: 0, cacheHits: 0, nativeGetRequests: 0, nativeRangeRequests: 0, decodedBytes: 0,
    policy: 'Build static assets only; first native responses verified against build SHA256. Assets with gzip size above 65536 use contiguous identity ranges <=65536 via counted Next proxy. Exact validated bytes cached in this browser context. No fallback or retries.' };
  assert.ok(['real', 'double'].includes(mode), 'BROWSER_EXECUTION_MODE_REQUIRED');
  const report = { category: 'native-next-browser-with-' + (mode === 'real' ? 'real-redis' : 'redis-double'), ok: false,
    candidateSha: plan.candidateSha, sourceFingerprint: plan.sourceFingerprint, planHash: plan.planHash,
    buildId: plan.nativeBuild.buildId, runtime: process.version, chromium: browser.version(), origin,
    cases, requests, externalBlocked, pageErrors, staticTransport,
    limitations: ['Chromium viewport emulation; physical device untested', 'Computed text doubling; browser zoom not claimed', 'Simulation badge verified inside technical details', 'Static asset distribution instrumented with verified native ranges and context memory cache to retain 64KiB individual responses; dynamic requests unaltered'] };
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'es-CL' });
    context.on('request', request => { const u = new URL(request.url()), key = request.method() + ' ' + u.pathname; requests[key] = (requests[key] ?? 0) + 1; });
    const staticCache = new Map(); let staticFailure = null;
    await context.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.origin !== origin && !['data:', 'blob:'].includes(u.protocol)) { externalBlocked.push(u.origin); return route.abort(); }
      if (u.origin !== origin || !u.pathname.startsWith('/_next/static/')) return route.continue();
      staticTransport.interceptedBrowserRequests++;
      try {
        assert.ok(!u.search && !u.hash && !u.pathname.includes('%'), 'STATIC_ASSET_URL_ALIAS_REJECTED');
        const base = resolve(checkout, '.next/static'), file = resolve(base, u.pathname.slice('/_next/static/'.length)), rel = relative(base, file);
        assert.ok(rel && rel !== '..' && !rel.startsWith('..' + sep) && !rel.startsWith(sep), 'STATIC_ASSET_OUTSIDE_BUILD');
        if (staticCache.has(u.pathname)) { staticTransport.cacheHits++; return route.fulfill(staticCache.get(u.pathname)); }
        const expected = await readFile(file), digest = hash(expected), headers = { ...route.request().headers(), 'accept-encoding': 'gzip' };
        delete headers['if-none-match']; delete headers['if-modified-since']; delete headers.range;
        let body, contentType;
        if (gzipSync(expected).length > 65536) {
          const chunks = [];
          for (let start = 0; start < expected.length; start += 65536) {
            const end = Math.min(expected.length - 1, start + 65535);
            staticTransport.nativeRangeRequests++;
            const response = await route.fetch({ headers: { ...headers, 'accept-encoding': 'identity', range: `bytes=${start}-${end}` }, maxRetries: 0, maxRedirects: 0, timeout: 10000 });
            assert.equal(response.status(), 206, 'NATIVE_STATIC_RANGE_NOT_SUPPORTED');
            assert.equal(response.headers()['content-range'], `bytes ${start}-${end}/${expected.length}`, 'NATIVE_STATIC_RANGE_MISMATCH');
            assert.ok(!response.headers()['content-encoding'] || response.headers()['content-encoding'] === 'identity', 'NATIVE_STATIC_RANGE_ENCODED');
            const chunk = await response.body(); assert.equal(chunk.length, end - start + 1, 'NATIVE_STATIC_RANGE_SIZE');
            contentType ??= response.headers()['content-type']; chunks.push(chunk);
          }
          body = Buffer.concat(chunks);
        } else {
          staticTransport.nativeGetRequests++;
          const response = await route.fetch({ headers, maxRetries: 0, maxRedirects: 0, timeout: 10000 });
          assert.equal(response.status(), 200, 'NATIVE_STATIC_RESPONSE_FAILED');
          body = await response.body(); contentType = response.headers()['content-type'];
        }
        assert.equal(body.length, expected.length, 'NATIVE_STATIC_ASSET_SIZE_CHANGED');
        assert.equal(hash(body), digest, 'NATIVE_STATIC_ASSET_HASH_CHANGED'); assert.ok(contentType, 'NATIVE_STATIC_MIME_MISSING');
        staticTransport.decodedBytes += body.length;
        const served = { status: 200, body, headers: { 'content-type': contentType, 'cache-control': 'private, no-store' } };
        staticCache.set(u.pathname, served); return route.fulfill(served);
      } catch (error) { staticFailure ??= error; await route.abort(); }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(10000);
    page.on('pageerror', error => pageErrors.push(error.message));
    async function bounded(promise, label) {
      let timer;
      try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label)), 10000); })]); }
      finally { clearTimeout(timer); }
    }
    async function privacy() {
      if (staticFailure) throw staticFailure;
      assert.equal(new URL(page.url()).hash, '', 'MAGIC_LINK_FRAGMENT_RETAINED');
      assert.ok(!new URL(page.url()).searchParams.has('token'), 'MAGIC_LINK_QUERY_RETAINED');
      const storage = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]));
      for (const secret of allTokens) assert.ok(!storage.includes(secret), 'PRIVATE_ACCESS_IN_BROWSER_STORAGE');
    }
    async function enterChat() {
      await page.goto(origin + '/agent-chat#token=' + token);
      await page.getByText(agentText, { exact: true }).waitFor();
      await privacy();
      assert.equal(await page.getByText(p.humanMessage.text.trim(), { exact: true }).count(), 1);
      assert.equal(await page.getByText(agentText, { exact: true }).count(), 1);
    }
    async function measure(path, width, doubled) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
      const measurement = await page.evaluate(async double => {
        const painted = e => {
          if (!e.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
          for (let parent = e.parentElement; parent; parent = parent.parentElement) {
            if (parent.tagName === 'DETAILS' && !parent.open && !parent.querySelector(':scope > summary')?.contains(e)) return false;
          }
          return true;
        };
        const elements = [...document.body.querySelectorAll('*')].filter(e => !['SCRIPT', 'STYLE', 'SVG', 'PATH'].includes(e.tagName));
        const baseline = elements.map(e => [e, parseFloat(getComputedStyle(e).fontSize), e.getAttribute('style')]);
        if (double) for (const [e, size] of baseline) if (Number.isFinite(size)) {
          e.style.setProperty('transition', 'none', 'important'); e.style.setProperty('font-size', `${size * 2}px`, 'important');
        }
        await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)));
        const ratios = baseline.filter(([e, size]) => painted(e) && size > 0 && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(([e, size]) => parseFloat(getComputedStyle(e).fontSize) / size);
        window.__nativeReviewStyleBaseline = baseline.map(([e, , style]) => [e, style]);
        return { textSamples: ratios.length, minRatio: Math.min(...ratios), maxRatio: Math.max(...ratios), viewport: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          overflowing: [...document.querySelectorAll('main, section, input, textarea, select, button, a, summary')].filter(e => {
            const r = e.getBoundingClientRect(); return painted(e) && r.width && r.height && (r.right > innerWidth + 1 || r.left < -1);
          }).map(e => ({ tag: e.tagName, text: e.textContent.trim().slice(0, 90) })).slice(0, 25) };
      }, doubled);
      assert.ok(measurement.textSamples > 10);
      if (doubled) assert.ok(measurement.minRatio >= 1.99 && measurement.maxRatio <= 2.01, 'TEXT_NOT_DOUBLED');
      const name = `${path.slice(1)}-${width}-${doubled ? 'text200' : 'text100'}`;
      await privacy();
      await page.screenshot({ path: join(evidenceDirectory, name + '.png'), fullPage: true, mask: [page.locator('#history-access-token')] });
      cases.push({ name, ...measurement });
      await page.evaluate(() => { for (const [e, style] of window.__nativeReviewStyleBaseline) { if (style === null) e.removeAttribute('style'); else e.setAttribute('style', style); } delete window.__nativeReviewStyleBaseline; });
      assert.ok(measurement.scrollWidth <= measurement.viewport + 1 && measurement.overflowing.length === 0, 'BROWSER_OVERFLOW');
    }
    await enterChat();
    for (const width of [390, 1366]) for (const double of [false, true]) await measure('/agent-chat', width, double);
    await page.getByRole('button', { name: 'Actualizar mensajes' }).focus(); await page.keyboard.press('Tab');
    report.keyboardTabFocus = await page.evaluate(() => { const e = document.activeElement, r = e.getBoundingClientRect(); return { tag: e.tagName, text: e.textContent.trim().slice(0, 80), visible: r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth }; });
    assert.ok(report.keyboardTabFocus.visible && ['BUTTON', 'A', 'TEXTAREA'].includes(report.keyboardTabFocus.tag), 'KEYBOARD_TAB_FOCUS_NOT_VISIBLE');
    await page.getByLabel('Mensaje para tu agente').fill('Borrador privado que debe retirarse');
    await page.getByRole('button', { name: 'Bloquear', exact: true }).focus(); await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Conversación bloqueada' }).waitFor();
    assert.ok(!(await page.locator('body').innerText()).includes(agentText));
    assert.equal(await page.locator('textarea').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'private-chat-title');
    await page.evaluate(value => { location.hash = 'token=' + value; }, token);
    await page.getByText(agentText, { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Mensaje para tu agente').inputValue(), '');
    let entered, release, finished, lateFailure;
    const waiting = new Promise(ok => { entered = ok; }), delivered = new Promise(ok => { finished = ok; });
    // Only a successful read response is held locally. Redis data and transport
    // are untouched; the component must ignore a response delivered after lock.
    await page.evaluate(() => {
      window.__nativeReviewFetch = window.fetch;
      window.fetch = (input, init = {}) => {
        const u = new URL(input instanceof Request ? input.url : input, location.href);
        return window.__nativeReviewFetch(input, u.pathname === '/api/conversations' && (init.method ?? 'GET') === 'GET' ? { ...init, signal: undefined } : init);
      };
    });
    const lateFinished = page.waitForEvent('requestfinished', { predicate: request => request.url() === origin + '/api/conversations', timeout: 10000 }).then(() => true, () => false);
    await page.route('**/api/conversations', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      try {
        const response = await route.fetch({ maxRetries: 0, maxRedirects: 0, timeout: 10000 });
        assert.equal(response.status(), 200, 'LATE_READ_NOT_SUCCESSFUL');
        const payload = await response.json(); assert.equal(payload.conversations.length, 1);
        assert.equal(payload.conversations[0].conversationId, p.conversation.conversationId);
        assert.equal(payload.conversations[0].title, p.conversation.title);
        entered(); await new Promise(ok => { release = ok; }); await route.fulfill({ response }); finished();
      } catch (error) { lateFailure = error; entered(); await route.abort(); finished(); }
    });
    await page.getByRole('button', { name: 'Actualizar mensajes' }).click(); await bounded(waiting, 'LATE_READ_NOT_RECEIVED');
    if (lateFailure) throw lateFailure;
    await page.getByRole('button', { name: 'Bloquear', exact: true }).focus(); await page.keyboard.press('Enter');
    release(); await bounded(delivered, 'LATE_READ_NOT_DELIVERED'); assert.equal(await lateFinished, true, 'LATE_READ_NOT_FINISHED');
    await page.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))));
    await page.getByRole('heading', { name: 'Conversación bloqueada' }).waitFor();
    assert.ok(!(await page.locator('body').innerText()).includes(agentText));
    await page.unroute('**/api/conversations');
    await page.evaluate(() => { window.fetch = window.__nativeReviewFetch; delete window.__nativeReviewFetch; location.hash = ''; });
    await page.evaluate(value => { location.hash = 'token=' + value; }, token);
    await page.getByText(agentText, { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Abrir mi biblioteca' }).click();
    await page.getByRole('button', { name: new RegExp(serviceTitle) }).waitFor();
    await page.getByRole('button', { name: new RegExp(serviceTitle) }).click();
    await page.getByText('Consultar contenido original', { exact: true }).click();
    assert.deepEqual(JSON.parse(await page.locator('.delivery-original pre').textContent()), p.operation.delivery.result);
    const details = page.locator('summary', { hasText: 'Últimas operaciones · vista técnica detallada' });
    await details.click(); await page.locator('.history-record .history-badge', { hasText: /^Simulación$/ }).waitFor({ state: 'visible' });
    await details.click(); await privacy();
    for (const width of [390, 1366]) for (const double of [false, true]) await measure('/history', width, double);
    await page.getByRole('button', { name: /Bloquear y borrar vista/ }).focus(); await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Biblioteca bloqueada' }).waitFor();
    assert.ok(!(await page.locator('body').innerText()).includes(serviceTitle));
    await restartNext();
    await enterChat();
    assert.equal(await page.getByLabel('Mensaje para tu agente').inputValue(), '');
    await page.getByRole('button', { name: 'Abrir mi biblioteca' }).click();
    await page.getByRole('button', { name: new RegExp(serviceTitle) }).waitFor(); await privacy();
    await page.getByRole('button', { name: new RegExp(serviceTitle) }).click();
    await page.getByText('Consultar contenido original', { exact: true }).click();
    assert.deepEqual(JSON.parse(await page.locator('.delivery-original pre').textContent()), p.operation.delivery.result);
    assert.equal(pageErrors.length, 0, 'BROWSER_RUNTIME_ERRORS');
    report.ok = true;
    report.assertions = ['Magic Link token removed from URL', 'access absent from local/session storage and cookies', 'one human and agent message', 'delivery original matches preserved payload', 'eight viewports/text cases without overflow', 'computed text 2x', 'keyboard lock and focus', 'draft erased', 'same-tab reentry', 'late successful read ignored after lock', 'Magic Link and delivery restored after Next restart', 'library lock and recovery'];
    report.lateProbe = { successfulReadHeldLocally: true, ignoresAbortSignalAtBrowser: true, deliveredAfterLock: true, remainedLocked: true };
    return report;
  } finally {
    signal?.removeEventListener('abort', abortBrowser);
    await browser.close();
    const serialized = JSON.stringify(report, null, 2) + '\n';
    for (const secret of allTokens) assert.ok(!serialized.includes(secret), 'BROWSER_EVIDENCE_CONTAINS_SECRET');
    await writeFile(join(evidenceDirectory, 'browser-report.json'), serialized);
  }
}
