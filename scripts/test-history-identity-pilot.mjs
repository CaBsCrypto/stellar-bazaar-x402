import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { authenticateHistory, generateHistoryKeypair } from '../lib/operation-history-auth.ts';
import { createHistoryHandlers } from '../lib/operation-history-http.ts';
import { createDeliverableHandlers } from '../lib/deliverable-http.ts';
import { createHistoryStore } from '../lib/operation-history-store.ts';

// Only loopback HTTP and an in-memory Redis double. No dotenv, configured store or payer.
const privateRoot = mkdtempSync(join(tmpdir(), 'bazaar-identity-http-'));
const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PATHEXT|SYSTEMDRIVE)$/i.test(key)));
let server;
try {
  function provision(name) {
    const directory = join(privateRoot, name);
    const output = spawnSync(process.execPath, ['scripts/provision-history-account.mjs', '--out', directory], { encoding: 'utf8', env: childEnv });
    assert.equal(output.status, 0, 'Offline provisioning failed (output intentionally withheld)');
    return { account: JSON.parse(readFileSync(join(directory, 'account.json'), 'utf8')), credentials: JSON.parse(readFileSync(join(directory, 'credentials.json'), 'utf8')) };
  }
  const a = provision('a'), b = provision('b');
  let accounts = [a.account, b.account];
  let configuration = JSON.stringify(accounts);
  const hashes = new Map(), lists = new Map();
  const redis = {
    async eval(_script, [recordKey, indexKey], [id, digest, entry]) {
      const records = hashes.get(recordKey) ?? new Map();
      if (records.has(id)) return [JSON.parse(records.get(id)).digest === digest ? 'existing' : 'conflict', records.get(id)];
      records.set(id, entry); hashes.set(recordKey, records);
      lists.set(indexKey, [id, ...(lists.get(indexKey) ?? [])]);
      return ['created', entry];
    },
    async lrange(key, start, end) { return (lists.get(key) ?? []).slice(start, end + 1); },
    async hmget(key, ...ids) { return Object.fromEntries(ids.map(id => [id, hashes.get(key)?.get(id)])); },
  };
  const handlers = createHistoryHandlers({
    authenticate: (header, write) => authenticateHistory(header, write, configuration === undefined ? null : configuration),
    store: () => createHistoryStore(redis),
  });
  const manifests = new Map();
  const deliveryHandlers = createDeliverableHandlers({
    auth: (header, write) => authenticateHistory(header, write, configuration === undefined ? null : configuration),
    history: () => createHistoryStore(redis),
    store: () => ({
      async reserve(owner, record) {
        const key = owner + ':' + record.manifest.versionId;
        const existing = manifests.get(key);
        if (existing) return { created: false, record: existing };
        manifests.set(key, record); return { created: true, record };
      },
      async list(owner, operation) { return [...manifests].filter(([key, value]) => key.startsWith(owner + ':') && value.operationId === operation).map(([, value]) => value); },
      async usage() { return 0; },
    }),
    objects: () => { throw new Error('External files forbidden in identity test'); },
  });
  server = createServer(async (incoming, outgoing) => {
    try {
      if (!['/api/operations', '/api/deliveries'].includes(incoming.url.split('?')[0])) { outgoing.writeHead(404).end(); return; }
      const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
      const request = new Request(`http://127.0.0.1:${server.address().port}${incoming.url}`, {
        method: incoming.method, headers: incoming.headers,
        ...(incoming.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
      });
      const result = await (incoming.url.startsWith('/api/deliveries') ? deliveryHandlers : handlers)[incoming.method](request);
      outgoing.writeHead(result.status, Object.fromEntries(result.headers)); outgoing.end(Buffer.from(await result.arrayBuffer()));
    } catch { outgoing.writeHead(500).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(token, body, path = '/api/operations') {
    const response = await fetch(`${origin}${path}`, {
      method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error',
    });
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    return { status: response.status, body: await response.json() };
  }
  const input = {
    clientOperationId: 'synthetic-identity-operation', mode: 'fixture', agentId: 'synthetic-agent',
    service: { id: 'identity-fixture', title: 'Synthetic delivery', provider: 'Local test', url: 'https://example.invalid/sample' },
    payment: { status: 'unknown', network: 'stellar:testnet', asset: 'USDC', amountAtomic: '10000', recipient: 'G' + 'A'.repeat(55) },
    delivery: { status: 'reported-delivered', result: { text: 'Synthetic identity sample; no purchase occurred.' } },
  };
  const created = await request(a.credentials.writeToken, input);
  assert.equal(created.status, 201);
  const original = created.body.record;
  const manifestInput = { operationId: input.clientOperationId, manifest: {
    schemaVersion: 'bazaar.deliverable/v1', deliveryId: 'identity-delivery', versionId: 'identity-v1', versionLabel: 'Synthetic v1',
    title: 'Synthetic poster', summary: 'Identity test, not a purchase',
    files: [{ id: 'poster', name: 'sample.png', mediaType: 'image/png', size: 3, sha256: 'a'.repeat(64) }],
    content: { kind: 'gallery', variants: [{ id: 'sample', title: 'Synthetic', fileId: 'poster' }] },
  } };
  const saved = await request(a.credentials.writeToken, manifestInput, '/api/deliveries'); assert.equal(saved.status, 201);
  const deliveryPath = '/api/deliveries?operationId=' + input.clientOperationId;
  async function expectDelivery(token) {
    const result = await request(token, undefined, deliveryPath); assert.equal(result.status, 200);
    assert.deepEqual(result.body.versions, [saved.body.record]);
    assert.equal(result.body.versions[0].files.poster, 'pending');
  }
  await expectDelivery(a.credentials.readToken);
  assert.equal((await request(b.credentials.readToken, undefined, deliveryPath)).status, 404);
  assert.equal((await request(b.credentials.writeToken, manifestInput, '/api/deliveries')).status, 404);
  assert.equal((await request(a.credentials.readToken, manifestInput, '/api/deliveries')).status, 403);
  assert.equal((await request(a.credentials.writeToken, { ...manifestInput, ownerId: b.account.ownerId }, '/api/deliveries')).status, 400);
  async function expectRecord(token) {
    const response = await request(token); assert.equal(response.status, 200); assert.deepEqual(response.body.records, [original]);
  }
  await expectRecord(a.credentials.readToken); await expectRecord(a.credentials.writeToken);
  assert.deepEqual((await request(b.credentials.readToken)).body.records, []);
  assert.equal((await request(a.credentials.readToken, input)).status, 403);
  assert.equal((await request('bz_read_' + 'f'.repeat(48))).status, 401);
  assert.equal((await request('bz_write_' + 'f'.repeat(48), input)).status, 401);
  assert.equal((await request(a.credentials.writeToken, { ...input, ownerId: b.account.ownerId })).status, 400);
  for (const invalid of [undefined, '', '{}', JSON.stringify([a.account, a.account]), JSON.stringify([a.account, { ...b.account, readTokenHash: a.account.readTokenHash }])]) {
    configuration = invalid;
    assert([401, 503].includes((await request(a.credentials.readToken)).status));
    assert([401, 503].includes((await request(a.credentials.writeToken, input)).status));
  }
  configuration = JSON.stringify(accounts);
  // Trusted operator holds the original private account record. No HTTP owner provisioning exists.
  const trustedAccount = JSON.parse(readFileSync(join(privateRoot, 'a', 'account.json'), 'utf8'));
  assert.deepEqual(accounts.find(account => account.ownerId === trustedAccount.ownerId), trustedAccount);
  const rotated = generateHistoryKeypair(trustedAccount.ownerId);
  accounts = [{ ...trustedAccount, readTokenHash: rotated.readTokenHash }, b.account]; configuration = JSON.stringify(accounts);
  assert.equal((await request(a.credentials.readToken)).status, 401);
  await expectRecord(rotated.readToken); await expectDelivery(rotated.readToken); await expectRecord(a.credentials.writeToken);
  accounts[0] = { ...accounts[0], writeTokenHash: rotated.writeTokenHash }; configuration = JSON.stringify(accounts);
  assert.equal((await request(a.credentials.writeToken, input)).status, 401);
  await expectRecord(rotated.readToken); await expectDelivery(rotated.readToken);
  const retry = await request(rotated.writeToken, input); assert.equal(retry.status, 200); assert.deepEqual(retry.body.record, original);
  configuration = JSON.stringify([b.account]);
  assert.equal((await request(rotated.readToken)).status, 401); assert.equal((await request(rotated.writeToken, input)).status, 401);
  // Restore under the same operator-verified identity; old hashes are deliberately never restored.
  const restored = generateHistoryKeypair(trustedAccount.ownerId);
  const { ownerId, readTokenHash, writeTokenHash } = restored;
  configuration = JSON.stringify([{ ownerId, readTokenHash, writeTokenHash }, b.account]);
  for (const token of [a.credentials.readToken, a.credentials.writeToken, rotated.readToken, rotated.writeToken]) assert.equal((await request(token)).status, 401);
  await expectRecord(restored.readToken); await expectDelivery(restored.readToken);
  assert.equal((await request(a.credentials.readToken, undefined, deliveryPath)).status, 401);
  assert.equal((await request(restored.writeToken, input)).status, 200);
  assert.deepEqual((await request(b.credentials.readToken)).body.records, []);
  console.log('PASS real loopback HTTP: provisioned pairs, owner isolation, least privilege, fail-closed configuration, operator-applied rotation/revocation/restoration and same delivery. Real operation/delivery handlers, synthetic storage doubles and pending file manifest; no payments or external requests. Rotation CLI is validated separately.');
} finally {
  if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  assert.equal(dirname(realpathSync(privateRoot)), realpathSync(tmpdir()));
  assert(basename(privateRoot).startsWith('bazaar-identity-http-'));
  rmSync(privateRoot, { recursive: true, force: true });
}

