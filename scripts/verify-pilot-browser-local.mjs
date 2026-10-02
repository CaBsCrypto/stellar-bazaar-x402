import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const [modules, executablePath] = process.argv.slice(2);
assert.ok(modules && executablePath, 'Explicit existing browser runtime required');
const { chromium } = await import(pathToFileURL(resolve(modules, 'playwright/index.mjs')).href);
const origin = 'http://127.0.0.1:3269';
const env = {};
for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT']) if (process.env[key]) env[key] = process.env[key];
Object.assign(env, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', BAZAAR_ENABLE_OPEN_WORKSPACES: 'false', BAZAAR_WORKSPACE_ADMISSION: 'invite-only', BAZAAR_WORKSPACE_PUBLIC_ORIGIN: 'https://pilot.example' });
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3269'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = ''; server.stdout.on('data', chunk => { logs += chunk; }); server.stderr.on('data', chunk => { logs += chunk; });
let browser;
const evidence = resolve('docs/evidence/sprint-public-pilot/browser-local'); mkdirSync(evidence, { recursive: true });
try {
  const deadline = Date.now() + 15000;
  while (!logs.includes('Ready')) { if (server.exitCode !== null || Date.now() > deadline) throw new Error('LOCAL_SERVER_NOT_READY'); await new Promise(done => setTimeout(done, 100)); }
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 768 } });
  const page = await context.newPage(); const errors = []; let externalBlocked = 0;
  page.on('pageerror', () => errors.push('pageerror'));
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : (externalBlocked++, route.abort()));
  await page.goto(origin + '/pilot');
  await page.getByRole('heading', { name: 'Un espacio para trabajar con tu agente.' }).waitFor();
  await page.locator('link[rel=canonical]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://pilot.example/pilot');
  assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'), 'https://pilot.example/pilot');
  assert.equal(await page.locator('meta[name=referrer]').getAttribute('content'), 'no-referrer');
  await page.screenshot({ path: resolve(evidence, 'desktop-initial.png'), fullPage: true });
  await page.getByRole('button', { name: 'Preparar un espacio', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Código de admisión', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Crear mi espacio', exact: true }).isEnabled(), false);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar acceso privado', exact: true }).click();
  const download = await downloading; const packet = JSON.parse(readFileSync(await download.path(), 'utf8'));
  const identity = packet.creationId;
  await page.getByRole('checkbox').check();
  let requested = false, holdResponse = false, release, lateHandled;
  const released = new Promise(done => { release = done; });
  const lateFinished = new Promise(done => { lateHandled = done; });
  await page.route('**/api/workspaces', async route => {
    requested = true;
    assert.equal(route.request().postDataJSON().creationId, identity);
    if (holdResponse) await released;
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ version: '1', record: { creationId: identity, workspaceId: randomUUID(), generation: 1, revoked: false } }) }).catch(() => {});
    if (holdResponse) lateHandled();
  });
  await page.getByRole('button', { name: 'Crear mi espacio', exact: true }).click();
  const recovery = page.getByRole('link', { name: 'Abrir mi espacio privado' });
  await recovery.waitFor();
  assert.equal(await recovery.getAttribute('href'), `${origin}/history#token=${packet.human}`);
  assert.equal(await recovery.getAttribute('referrerpolicy'), 'no-referrer');
  const downloadingAgent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar acceso del agente', exact: true }).click();
  const agentDownload = await downloadingAgent;
  const agentPacketText = readFileSync(await agentDownload.path(), 'utf8');
  const agentPacket = JSON.parse(agentPacketText);
  assert.equal(agentPacket.authorization, `Bearer ${packet.agent}`);
  assert.equal(agentPacket.url, `${origin}/api/mcp`);
  assert.equal(agentPacket.transport, 'streamable-http');
  assert.equal(agentPacketText.includes(packet.human), false);
  assert.equal(agentPacketText.includes(packet.bootstrap), false);
  await page.getByRole('button', { name: 'Bloquear y retirar este acceso', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'access.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packet)) });
  await page.getByLabel('Código de admisión', { exact: true }).waitFor();
  holdResponse = true; requested = false;
  await page.getByRole('button', { name: 'Crear mi espacio', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent?.includes('Creando'));
  while (!requested) await new Promise(done => setTimeout(done, 20));
  await page.getByRole('button', { name: 'Bloquear y retirar este acceso', exact: true }).click();
  release();
  await lateFinished;
  await page.getByRole('button', { name: 'Preparar un espacio', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Abrir mi espacio privado' }).count(), 0);
  assert.equal(await page.getByLabel('Código de admisión', { exact: true }).count(), 0);
  await page.getByRole('textbox').count();
  const storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie, url: location.href }));
  assert.deepEqual(storage, { local: 0, session: 0, cookies: '', url: origin + '/pilot' });
  await page.locator('input[type=file]').setInputFiles({ name: 'access.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packet)) });
  await page.getByLabel('Código de admisión', { exact: true }).waitFor();
  assert.equal(await page.getByRole('checkbox').isChecked(), true);
  const sizes = [];
  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
    await page.setViewportSize(viewport);
    for (const textScale of [1, 2]) {
      const measured = await page.evaluate(scale => {
        const elements = [...document.querySelectorAll('h1,h2,h3,p,button,label,a,textarea,input,footer')];
        for (const element of elements) element.style.removeProperty('font-size');
        const baseline = elements.map(element => parseFloat(getComputedStyle(element).fontSize));
        elements.forEach((element, index) => { element.style.fontSize = `${baseline[index] * scale}px`; });
        return { allTextScaled: elements.every((element, index) => Math.abs(parseFloat(getComputedStyle(element).fontSize) - baseline[index] * scale) < .1), overflow: document.documentElement.scrollWidth > innerWidth };
      }, textScale);
      assert.equal(measured.allTextScaled, true); assert.equal(measured.overflow, false);
      sizes.push({ ...viewport, textScale, ...measured });
    }
  }
  await page.getByRole('button', { name: 'Bloquear y retirar este acceso', exact: true }).click();
  await page.screenshot({ path: resolve(evidence, 'desktop-locked-text200.png'), fullPage: true });
  assert.deepEqual(errors, []);
  const report = { ok: true, scope: 'local native Next page with simulated creation response; workspaces disabled', buildId: readFileSync('.next/BUILD_ID', 'utf8').trim(), browser: browser.version(), runtime: process.version, keyboardPreparation: true, backupRequiredBeforeCreation: true, downloadAndImport: true, privateRecoveryLink: true, agentPacketExcludesHumanAndBootstrap: true, lateResponseAfterLock: true, emptyBrowserStorage: true, activeOnboardingSizes: sizes, pageErrors: errors.length, externalBlocked, redisRequests: 0, limitations: ['No hosted HTTPS acceptance', 'Creation response simulated', 'Text enlarged using measured per-element font sizes; not browser zoom', 'Real creation, connected-agent and Magic Link recovery remain pending'] };
  writeFileSync(resolve(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
} finally { await browser?.close(); server.kill(); }
