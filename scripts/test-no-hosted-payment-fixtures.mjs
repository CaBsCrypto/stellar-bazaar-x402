import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as reference from '../app/api/buyer-execution/reference/route.ts';
import { localBuyerFixture } from './fixtures/buyer-execution-handler.ts';

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
// The retired route cannot be enabled by preview/production/dev flags or bodies.
const oldNodeEnvironment = process.env.NODE_ENV;
try {
  for (const nodeEnvironment of ['production', 'development', 'test']) {
    process.env.NODE_ENV = nodeEnvironment;
    for (const method of methods) {
      const response = await reference[method]();
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-bazaar-demo'), null);
      assert.deepEqual(await response.json(), { error: { code: 'NOT_FOUND' } });
    }
  }
} finally {
  if (oldNodeEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = oldNodeEnvironment;
}

// A fixture can only be invoked directly with a loopback HTTP Request.
const refused = await localBuyerFixture(new Request('https://bazaar.example/fixtures/buyer-execution/reference', { method: 'POST', body: JSON.stringify({ action: 'challenge', serviceId: 'script-creator', input: { topic: 'local' } }) }));
assert.equal(refused.status, 403);
assert.deepEqual(await refused.json(), { error: { code: 'LOCAL_FIXTURE_ONLY' } });
const root = fileURLToPath(new URL('../', import.meta.url));
async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(?:[cm]?js|tsx?)$/.test(entry.name)) files.push(path);
  }
  return files;
}
for (const directory of ['app', 'lib', 'components']) {
  for (const file of await sourceFiles(join(root, directory))) {
    const source = await readFile(file, 'utf8');
    assert.ok(!/(?:from|import\s*\()\s*['"][^'"]*(?:scripts\/fixtures|lib\/buyer-execution)/.test(source), `${file}: production module must not import local payment fixtures`);
    assert.ok(!/\b(?:executeFixtureRequest|pollFixtureStatus|LOCAL_DEMO_AUTHORIZATION)\b/.test(source), `${file}: production module contains a payment simulator`);
  }
}
const page = await readFile(join(root, 'app/buyer-execution/page.tsx'), 'utf8');
assert.ok(!page.includes('BuyerExecutionDemo'), 'public page cannot expose retired simulation controls');
console.log('Hosted payment fixtures disabled: PASS (all HTTP methods, all runtime modes, local-only invocation, no app imports)');
