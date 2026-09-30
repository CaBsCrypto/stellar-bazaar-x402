import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

// Built application, isolated configuration. No Redis calls, credentials or writes.
const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(BAZAAR_|UPSTASH_|KV_|RESEND_|ADMIN_|X402_|STELLAR_X402_)/.test(key)));
const cases = [
  { intake: 'false', backend: 'file', text: 'Recepción cerrada:' },
  { intake: 'true', backend: 'file', text: 'La recepción no está disponible' },
  { intake: 'true', backend: 'redis', text: 'Recepción abierta:' },
];
for (const [index, scenario] of cases.entries()) {
  const port = 3270 + index;
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    env: { ...clean, NODE_ENV: 'production', BAZAAR_ENABLE_SELF_LISTING_INTAKE: scenario.intake,
      BAZAAR_PROVIDER_REVIEW_BACKEND: scenario.backend, BAZAAR_REVIEW_PREFIX: 'bazaar-review:local-test',
      BAZAAR_REVIEW_REDIS_REST_URL: 'https://synthetic.invalid', BAZAAR_REVIEW_REDIS_REST_TOKEN: 'synthetic-unused' },
    stdio: 'ignore',
  });
  try {
    let response;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { response = await fetch(`http://127.0.0.1:${port}/publish`, { signal: AbortSignal.timeout(2000) }); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.equal(response?.status, 200);
    const html = await response.text();
    assert.ok(html.includes(scenario.text), scenario.text);
    assert.ok(html.includes('Los pagos permanecen deshabilitados.'));
    assert.ok(!html.includes('El piloto local conserva solicitudes en disco'));
  } finally {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  }
}
console.log('PASS built /publish: closed, unavailable and shared-configured reception; synthetic configuration, no storage writes.');
