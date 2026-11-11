import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { GET as identity } from '../app/api/account/identity/route.ts';
import { POST as createChallenge } from '../app/api/account/wallet/challenge/route.ts';
import { POST as completeChallenge } from '../app/api/account/wallet/complete/route.ts';
import { inheritDemoIngress } from '../lib/demo-http.ts';
import { walletMessage } from '../lib/demo-wallet.ts';
import { setFreeDemoBudgetStoreForTests } from '../lib/free-demo-budget.ts';
import { setWorkspaceStoreForTests } from '../lib/workspace-store.ts';
import { WorkspaceError } from '../lib/workspace-types.ts';

Object.assign(process.env, {
  NODE_ENV: 'test',
  BAZAAR_ENABLE_OPEN_WORKSPACES: 'true',
  BAZAAR_PUBLIC_DEMO: 'true',
  BAZAAR_FREE_DEMO_ADMISSION_UNTIL: '2040-01-01T00:00:00.000Z',
});
const origin = 'https://example.invalid';
const owner = { role: 'bootstrap', generation: 1, ownerId: 'ow_fixture', workspaceId: randomUUID(), agentId: 'agent-fixture' };
const treasury = { ...owner, ownerId: 'ow_treasury', workspaceId: randomUUID(), role: 'bootstrap', purpose: 'treasury-controls' };
const treasuryHuman = { ...treasury, role: 'human' };
const digest = token => createHash('sha256').update(token).digest('hex');
const accesses = { regular: 'r'.repeat(43), treasury: 't'.repeat(43), treasuryHuman: 'h'.repeat(43) };
const principals = new Map([[digest(accesses.regular), owner], [digest(accesses.treasury), treasury], [digest(accesses.treasuryHuman), treasuryHuman]]);
const wallet = Keypair.random();
const challenge = {
  challengeId: randomUUID(), ownerId: owner.ownerId, agentId: owner.agentId, generation: owner.generation,
  wallet: wallet.publicKey(), origin, network: 'stellar:testnet', nonce: 'a'.repeat(64), expiresAt: Date.now() + 300_000,
};
const proof = { challengeId: challenge.challengeId, signature: wallet.sign(Buffer.from(walletMessage(challenge), 'utf8')).toString('base64') };
const counts = { ownerQuota: 0, identity: 0, challengeWrites: 0, challengeReads: 0, bindings: 0, horizonReads: 0 };
setWorkspaceStoreForTests({
  resolveHash: async hash => {
    const principal = principals.get(hash);
    if (!principal) throw new WorkspaceError('UNAUTHORIZED', 401);
    return principal;
  },
  consumeIngress: async () => {},
  consumeRequest: async () => { counts.ownerQuota++; },
  walletIdentity: async principal => { counts.identity++; return { identity: principal }; },
  walletChallenge: async () => { counts.challengeWrites++; return { challengeId: challenge.challengeId }; },
  forPrincipal: () => ({ readWalletChallenge: async () => { counts.challengeReads++; return challenge; } }),
  bindWallet: async () => { counts.bindings++; return { wallet: challenge.wallet }; },
});
setFreeDemoBudgetStoreForTests({ reserve: async () => {} });
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
  counts.horizonReads++;
  assert.equal(String(url), `https://horizon-testnet.stellar.org/accounts/${challenge.wallet}`);
  return Response.json({
    account_id: challenge.wallet,
    thresholds: { low_threshold: 1, med_threshold: 1, high_threshold: 1 },
    signers: [{ key: challenge.wallet, type: 'ed25519_public_key', weight: 1 }],
  });
};
const request = (path, access, body) => new Request(origin + path, {
  method: body ? 'POST' : 'GET',
  headers: { authorization: 'Bearer ' + access, 'content-type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
});
const routes = [
  [identity, '/api/account/identity'],
  [createChallenge, '/api/account/wallet/challenge', { wallet: challenge.wallet }],
  [completeChallenge, '/api/account/wallet/complete', proof],
];

try {
  for (const [handler, path, body] of routes) {
    const response = await handler(request(path, accesses.treasury, body));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'TREASURY_CONTROL_SCOPE');
  }
  const mcpRequest = request('/api/mcp', accesses.regular, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_bazaar_identity', arguments: {} } });
  assert.equal((await identity(inheritDemoIngress(mcpRequest, request('/api/account/identity', accesses.regular)))).status, 403);
  assert.deepEqual(counts, { ownerQuota: 0, identity: 0, challengeWrites: 0, challengeReads: 0, bindings: 0, horizonReads: 0 });

  for (const [handler, path, body] of routes) {
    const response = await handler(request(path, accesses.regular, body));
    assert.equal(response.status, 200, await response.text());
  }
  assert.equal((await identity(request('/api/account/identity', accesses.treasuryHuman))).status, 200);
  assert.deepEqual(counts, { ownerQuota: 4, identity: 2, challengeWrites: 1, challengeReads: 1, bindings: 1, horizonReads: 1 });
  console.log('PASS treasury recovery cannot access wallet routes; regular HTTP recovery and treasury human identity still work.');
} finally {
  globalThis.fetch = originalFetch;
  setFreeDemoBudgetStoreForTests(undefined);
  setWorkspaceStoreForTests(undefined);
}
