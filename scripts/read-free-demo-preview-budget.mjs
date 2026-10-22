// One read of the isolated Preview reservation ledger. No Redis mutation.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const fail = () => { throw Error('PREVIEW_BUDGET_READ_UNCONFIRMED'); };
try {
  if (process.argv.slice(2).join(' ') !== '--execute') fail();
  const receipt = JSON.parse(await readFile('docs/evidence/free-demo-bazaar-preview-deployment-2026-10-11.json', 'utf8'));
  const until = receipt.admissionUntil;
  if (receipt.status !== 'PROTECTED_FREE_PREVIEW_READY_ACCEPTANCE_PENDING' || receipt.target !== 'preview' || receipt.projectId !== 'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3' || receipt.sourceDigest !== '265a9babe5aa64942add49b6b2acd757463d2d8a65b45c9ea300c20c28aca124' || receipt.purchasesEnabled !== false || receipt.filesEnabled !== false || receipt.productionPublished !== false || receipt.payments !== 0 || receipt.crons.length || typeof until !== 'string' || new Date(until).toISOString() !== until) fail();
  let raw = '';
  for await (const chunk of process.stdin) { raw += chunk; if (Buffer.byteLength(raw) > 8192) fail(); }
  const privateAccess = JSON.parse(raw); raw = '';
  if (privateAccess.url !== 'https://smooth-dory-323957.upstash.io' || typeof privateAccess.token !== 'string' || !/^[\x21-\x7e]{20,4096}$/.test(privateAccess.token)) fail();
  const windowId = createHash('sha256').update(until).digest('hex').slice(0, 24);
  const key = `bazaar-workspace:pilot-14eed63c2c93c8d109322394f4e96a50:{pilot-14eed63c2c93c8d109322394f4e96a50}:free-demo-budget:${windowId}`;
  const response = await fetch(privateAccess.url, { method: 'POST', headers: { Authorization: 'Bearer ' + privateAccess.token, 'Content-Type': 'application/json' }, body: JSON.stringify(['GET', key]), redirect: 'error', signal: AbortSignal.timeout(10000) });
  privateAccess.token = '';
  const text = await response.text(); if (!response.ok || Buffer.byteLength(text) > 4096) fail();
  const envelope = JSON.parse(text); if (envelope.error || !Object.hasOwn(envelope, 'result')) fail();
  const limits = { public: 155000, authenticated: 90000, recovery: 105000 };
  let state = null;
  if (envelope.result !== null) {
    if (typeof envelope.result !== 'string' || Buffer.byteLength(envelope.result) > 512) fail();
    state = JSON.parse(envelope.result);
    if (state.version !== 1 || state.window !== windowId || !Number.isSafeInteger(state.last) || !state.used || Object.keys(state.used).sort().join(',') !== 'authenticated,public,recovery' || Object.entries(limits).some(([name, limit]) => !Number.isSafeInteger(state.used[name]) || state.used[name] < 0 || state.used[name] > limit)) fail();
  }
  const evidence = { status: 'PASS_READ_ONLY_PREVIEW_BUDGET', observedAt: new Date().toISOString(), deploymentId: receipt.deploymentId, sourceDigest: receipt.sourceDigest, admissionUntil: until, ledgerPresent: state !== null, usedReservations: state?.used ?? { public: 0, authenticated: 0, recovery: 0 }, limits, evidenceType: 'conservative-reservation-not-provider-invoice', restRequests: 1, redisCommands: 1, redisWrites: 0, realPayments: 0, providerExecutions: 0, productionPublished: false, cronActivated: false };
  await writeFile('docs/evidence/free-demo-preview-budget-2026-10-11.json', JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(evidence));
} catch {
  console.log(JSON.stringify({ status: 'UNCONFIRMED', code: 'PREVIEW_BUDGET_READ_UNCONFIRMED', realPayments: 0, productionPublished: false, cronActivated: false }));
  process.exitCode = 1;
}
