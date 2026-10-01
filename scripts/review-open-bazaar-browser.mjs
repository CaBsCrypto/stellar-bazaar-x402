// Synthetic browser acceptance. No dotenv, external network, provider, or Redis.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const root = process.cwd();
assert.equal(process.versions.node.split('.')[0], '22', 'Run this review with Node 22');
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  await assert.rejects(access(join(root, name)), { code: 'ENOENT' });
}
const runtimePackages = process.argv[2];
assert.ok(runtimePackages, 'Supply the bundled runtime node_modules directory');
const { chromium } = await import(pathToFileURL(join(runtimePackages, 'playwright', 'index.mjs')).href);
const evidence = resolve(root, 'docs/evidence/sprint-redis-browser');
await mkdir(evidence, { recursive: true });
const candidateSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const buildProvenance = JSON.parse(await readFile(join(root, '.next/BAZAAR_REVIEW_BUILD.json'), 'utf8'));
const buildId = (await readFile(join(root, '.next/BUILD_ID'), 'utf8')).trim();
assert.equal(buildProvenance.sourceSha, candidateSha, 'Build provenance must match candidate HEAD');
assert.equal(buildProvenance.buildId, buildId, 'Build provenance must identify the served build');
const data = await mkdtemp(join(tmpdir(), 'bazaar-sprint-browser-'));
const reservation = createServer();
await new Promise(ok => reservation.listen(0, '127.0.0.1', ok));
const port = reservation.address().port;
await new Promise(ok => reservation.close(ok));
const origin = `http://127.0.0.1:${port}`;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PATHEXT|SYSTEMDRIVE|PROGRAMDATA)$/i.test(key)));
Object.assign(env, {
  NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_APP_URL: origin,
  BAZAAR_INDEPENDENT_NETWORK_GUARD: '1', BAZAAR_ENABLE_OPEN_WORKSPACES: 'true',
  BAZAAR_WORKSPACE_BACKEND: 'file', BAZAAR_WORKSPACE_PREFIX: 'bazaar-workspace:local-test',
  BAZAAR_WORKSPACE_FILE_DIRECTORY: data, BAZAAR_WORKSPACE_LOCAL_ORIGIN: origin,
  BAZAAR_ENABLE_SELF_LISTING_INTAKE: 'false', BAZAAR_ENABLE_PUBLIC_PROVIDER_REVIEW: 'false',
  BAZAAR_ENABLE_PROVIDER_ACTIVATION: 'false', BAZAAR_ENABLE_REGISTRY_MUTATIONS: 'false',
  X402_PILOT_PAYMENTS_ENABLED: 'false', X402_LEGACY_PAYMENTS_ENABLED: 'false',
  X402_ENABLE_LOCAL_PAYER: 'false', NEXT_PUBLIC_X402_XLM_PILOT: 'false',
});
let server;
let readinessRequests = 0;
async function start() {
  server = spawn(process.execPath, ['--import', pathToFileURL(join(root, 'scripts/test-open-bazaar-independent.mjs')).href,
    'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '-p', String(port)], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.resume(); server.stderr.resume();
  for (let attempt = 0; attempt < 60; attempt++) {
    assert.equal(server.exitCode, null, 'Isolated Next exited during startup');
    try { readinessRequests++; if ((await fetch(`${origin}/api/mcp`, { signal: AbortSignal.timeout(500) })).ok) return; } catch {}
    await new Promise(ok => setTimeout(ok, 100));
  }
  throw Error('Bounded startup readiness exhausted');
}
async function stop() {
  if (server && server.exitCode === null) { const done = new Promise(ok => server.once('exit', ok)); server.kill(); await done; }
}
const secrets = Object.fromEntries(['bootstrap', 'human', 'agent'].map(role => [role, randomBytes(32).toString('base64url')]));
const hash = value => createHash('sha256').update(value).digest('hex');
let httpRequests = 0;
const traffic = { fixtureHttp: {}, fixtureMcp: {}, browser: {} };
const count = (category, method, path) => { const key = `${method} ${path}`; category[key] = (category[key] ?? 0) + 1; };
async function bounded(promise, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label)), 10000); })]); }
  finally { clearTimeout(timer); }
}
async function http(path, token, body) {
  httpRequests++;
  count(traffic.fixtureHttp, body ? 'POST' : 'GET', path);
  const response = await fetch(origin + path, { method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { Origin: origin, 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(10000) });
  assert.ok(response.ok, `Synthetic HTTP failed: ${path} ${response.status}`);
  return response.json();
}
let browser, client;
const cases = [], externalBlocked = [], pageErrors = [];
try {
  await start();
  const receipt = await http('/api/workspaces', secrets.bootstrap, { creationId: randomUUID(), humanAccessHash: hash(secrets.human), agentAccessHash: hash(secrets.agent) });
  const conversationId = randomUUID(), taskId = randomUUID(), attemptId = randomUUID();
  await http('/api/conversations', secrets.human, { conversationId, title: 'Revisión visual sintética' });
  const humanText = 'Prepara una entrega sintética y conserva esta conversación.';
  const agentText = 'Entrega sintética conservada. No se invocó un modelo ni un proveedor.';
  await http(`/api/conversations/${conversationId}/messages`, secrets.human, { messageId: randomUUID(), taskId, text: humanText });
  client = new Client({ name: 'sprint-browser-fixture', version: '1.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp', origin), {
    requestInit: { headers: { Authorization: `Bearer ${secrets.agent}` } },
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
    fetch: (input, init) => { const url = new URL(input instanceof Request ? input.url : input); count(traffic.fixtureMcp, init?.method ?? 'GET', url.pathname); return fetch(input, { ...init, redirect: 'error' }); },
  }));
  async function tool(name, args) {
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, `Synthetic MCP failed: ${name}`);
    return result.structuredContent ?? JSON.parse(result.content.find(v => v.type === 'text').text);
  }
  await tool('claim_bazaar_agent_task', { taskId, attemptId });
  const operationId = 'sprint-browser-' + randomUUID();
  await tool('record_bazaar_operation', { operation: { clientOperationId: operationId, taskId, mode: 'mock',
    service: { id: 'sprint-visual-fixture', title: 'Entrega sintética del sprint', provider: 'Agente externo sintético', url: origin },
    payment: { status: 'not-requested', network: 'stellar:testnet', asset: 'USDC', amountAtomic: '0', recipient: 'G' + 'A'.repeat(55) },
    delivery: { status: 'reported-delivered', result: { text: agentText } } } });
  await tool('respond_bazaar_agent_task', { taskId, attemptId, messageId: randomUUID(), text: agentText, operationId });
  const originalHistory = await http('/api/operations', secrets.human);
  const originalConversation = await http(`/api/conversations/${conversationId}/messages`, secrets.human);
  await client.close(); client = null;
  browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: resolve(process.argv[3]) } : {}) });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'es-CL' });
  context.on('request', request => { const url = new URL(request.url()); count(traffic.browser, request.method(), url.pathname); });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    externalBlocked.push(url.origin); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  async function openPrivate(path) {
    await page.goto(`${origin}${path}#token=${secrets.human}`);
    await page.waitForFunction(() => !location.hash && !location.search.includes('token'));
    if (path === '/agent-chat') await page.getByText(agentText, { exact: true }).waitFor();
    else {
      await page.getByRole('button', { name: /Entrega sintética del sprint/ }).waitFor();
      await page.getByRole('button', { name: /Entrega sintética del sprint/ }).click();
      await page.getByText(agentText, { exact: true }).first().waitFor();
      await page.getByText('Consultar contenido original', { exact: true }).click();
      assert.deepEqual(JSON.parse(await page.locator('.delivery-original pre').textContent()), { text: agentText });
      const technical = page.locator('summary', { hasText: 'Últimas operaciones · vista técnica detallada' });
      const simulationBadge = page.locator('.history-record .history-badge', { hasText: /^Simulación$/ });
      await technical.click();
      await simulationBadge.waitFor({ state: 'visible' });
      await technical.click();
      await simulationBadge.waitFor({ state: 'hidden' });
    }
    const stored = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]));
    for (const secret of Object.values(secrets)) assert.ok(!stored.includes(secret), 'Private access persisted in browser storage');
  }
  async function measure(path, width, enlarged) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    await openPrivate(path);
    const measurement = await page.evaluate(async double => {
      const samples = [...document.body.querySelectorAll('*')].filter(e => !['SCRIPT','STYLE','SVG','PATH'].includes(e.tagName));
      const baseline = samples.map(e => [e, parseFloat(getComputedStyle(e).fontSize)]);
      if (double) for (const [e, size] of baseline) if (Number.isFinite(size)) {
        e.style.setProperty('transition', 'none', 'important');
        e.style.setProperty('font-size', `${size * 2}px`, 'important');
      }
      await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)));
      const ratios = baseline.filter(([e, size]) => size > 0 && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(([e, size]) => parseFloat(getComputedStyle(e).fontSize) / size);
      return { samples: ratios.length, minRatio: Math.min(...ratios), maxRatio: Math.max(...ratios),
        viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll('main, section, input, textarea, select, button, a, summary')].filter(e => {
          const r = e.getBoundingClientRect(); return r.width && r.height && (r.right > innerWidth + 1 || r.left < -1);
        }).map(e => ({ tag: e.tagName, text: e.textContent.trim().slice(0, 90) })).slice(0, 25) };
    }, enlarged);
    assert.ok(measurement.samples > 10);
    if (enlarged) assert.ok(measurement.minRatio >= 1.99 && measurement.maxRatio <= 2.01, `Text did not double: ${measurement.minRatio}/${measurement.maxRatio}`);
    const name = `${path.slice(1)}-${width}-${enlarged ? 'text200' : 'text100'}`;
    await page.screenshot({ path: join(evidence, name + '.png'), fullPage: true, mask: [page.locator('#history-access-token')] });
    cases.push({ name, ...measurement });
  }
  for (const path of ['/agent-chat', '/history']) for (const width of [390, 1366]) for (const enlarged of [false, true]) await measure(path, width, enlarged);
  await openPrivate('/agent-chat');
  await page.getByLabel('Mensaje para tu agente').fill('Borrador privado que debe retirarse');
  await page.getByRole('button', { name: 'Bloquear', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Conversación bloqueada' }).waitFor();
  assert.ok(!(await page.locator('body').innerText()).includes(agentText));
  assert.equal(await page.locator('textarea').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'private-chat-title');
  await page.evaluate(token => { location.hash = 'token=' + token; }, secrets.human);
  await page.getByText(agentText, { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Mensaje para tu agente').inputValue(), '');
  let release, entered, finishLate;
  const waiting = new Promise(ok => { entered = ok; });
  const lateCompleted = new Promise(ok => { finishLate = ok; });
  // Explicit test perturbation: keep this one GET alive despite AbortController,
  // so a real late HTTP response reaches the component's generation guard.
  await page.evaluate(() => {
    const native = window.fetch; window.__sprintReviewFetch = native;
    window.fetch = (input, init = {}) => {
      const url = new URL(input instanceof Request ? input.url : input, location.href);
      return native(input, url.pathname === '/api/conversations' && (init.method ?? 'GET') === 'GET' ? { ...init, signal: undefined } : init);
    };
  });
  const lateFinished = page.waitForEvent('requestfinished', { predicate: request => request.url() === origin + '/api/conversations' }).then(() => true, () => false);
  await page.route('**/api/conversations', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch(); entered();
    await new Promise(ok => { release = ok; });
    await route.fulfill({ response });
    finishLate();
  });
  await page.getByRole('button', { name: 'Actualizar mensajes' }).click();
  await bounded(waiting, 'Late-response probe did not receive its GET');
  await page.getByRole('button', { name: 'Bloquear', exact: true }).focus();
  await page.keyboard.press('Enter');
  release();
  await bounded(lateCompleted, 'Late-response probe did not deliver its response');
  assert.equal(await bounded(lateFinished, 'Late-response request did not finish'), true);
  await page.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))));
  await page.getByRole('heading', { name: 'Conversación bloqueada' }).waitFor();
  assert.ok(!(await page.locator('body').innerText()).includes(agentText));
  await page.unroute('**/api/conversations');
  await page.evaluate(() => { window.fetch = window.__sprintReviewFetch; delete window.__sprintReviewFetch; });
  await stop(); await start();
  assert.deepEqual(await http('/api/operations', secrets.human), originalHistory);
  assert.deepEqual(await http(`/api/conversations/${conversationId}/messages`, secrets.human), originalConversation);
  await openPrivate('/agent-chat');
  await page.getByRole('button', { name: 'Abrir mi biblioteca' }).click();
  await page.getByText('Entrega sintética del sprint', { exact: true }).first().waitFor();
  assert.equal(new URL(page.url()).hash, '');
  await page.getByRole('button', { name: /Bloquear y borrar vista/ }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Biblioteca bloqueada' }).waitFor();
  assert.ok(!(await page.locator('body').innerText()).includes('Entrega sintética del sprint'));
  await openPrivate('/history');
  assert.equal(pageErrors.length, 0, 'Browser runtime errors occurred');
  const report = { category: 'real-browser-with-isolated-file-storage', ok: cases.every(v => v.scrollWidth <= v.viewport + 1 && v.overflowing.length === 0),
    sourceSha: candidateSha, runtime: process.version,
    chromium: browser.version(), origin, buildProvenance, buildId, config: Object.fromEntries(Object.entries(env).filter(([k]) => /^(BAZAAR_|X402_|NEXT_PUBLIC_)/.test(k))),
    command: 'Node22 scripts/review-open-bazaar-browser.mjs <bundled-node_modules> <existing-chromium-executable>', fixtureHttpRequests: httpRequests, readinessRequests, traffic,
    cases, pageErrors, externalBlocked, lateProbe: { ignoresAbortSignalAtTransport: true, responseDeliveredAfterLock: true, contentRemainedLocked: true }, assertions: ['fragment removed', 'access absent from browser storage', 'text computed 2x', 'keyboard lock', 'draft retired', 'same-tab reentry', 'late response delivered and ignored', 'same records after restart', 'inline original JSON matches fixture', 'simulation badge visible when technical details are opened', 'library lock and reentry'],
    simulationLabelVerifiedInTechnicalDetails: true,
    limitations: ['Synthetic file storage; real Redis remains separate', 'Chromium viewport emulation; physical device untested', 'Computed text doubling; browser zoom not claimed', 'Main delivery view shows no payment; simulation badge is in technical details'] };
  await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: report.ok, evidence, runtime: report.runtime, chromium: report.chromium, cases: cases.map(v => ({ name: v.name, minRatio: v.minRatio, scrollWidth: v.scrollWidth, viewport: v.viewport, overflowing: v.overflowing })), pageErrors, externalBlocked }));
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  let message = String(error.stack ?? error);
  for (const secret of Object.values(secrets)) message = message.split(secret).join('[redacted]');
  console.error(message); process.exitCode = 1;
} finally {
  if (client) await client.close().catch(() => {});
  if (browser) await browser.close();
  await stop();
}
