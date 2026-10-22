import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { freeDemoBudgetConfiguration, createFreeDemoBudgetStore, classifyFreeDemoRequest, freeDemoCommandReservation, FREE_DEMO_BUDGET_LUA, setFreeDemoBudgetStoreForTests } from '../lib/free-demo-budget.ts';
import { demoIngress, inheritDemoIngress } from '../lib/demo-http.ts';
import { setWorkspaceStoreForTests } from '../lib/workspace-store.ts';
import { WorkspaceError } from '../lib/workspace-types.ts';

let assertions = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const rejects = async (action, expected) => { await assert.rejects(action, expected); assertions++; };
const until = '2026-10-12T20:00:00.000Z', prefix = 'bazaar-workspace:pilot-' + 'a'.repeat(32);
const tinyLimits = { public: 488, authenticated: 896, recovery: 856 };
const config = limits => freeDemoBudgetConfiguration({ BAZAAR_FREE_DEMO_ADMISSION_UNTIL: until, BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON: JSON.stringify(limits) });
const request = (name, token) => new Request('https://free.example/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: {} } }) });
let calls = 0, commits = 0, lose = false, fail = false, serverNow = Date.parse('2026-10-11T20:00:01.000Z');
const rows = new Map();
// Atomic protocol fixture. No network and no hosted test adapter.
const redis = { async eval(script, [key], [window, profile, weight, p, a, r, fallback]) {
  eq(script, FREE_DEMO_BUDGET_LUA); calls++;
  if (fail) throw Error('Synthetic unavailable transport');
  const limits = { public: +p, authenticated: +a, recovery: +r };
  const state = rows.has(key) ? JSON.parse(rows.get(key)) : { version: 1, window, last: 0, used: { public: 0, authenticated: 0, recovery: 0 } };
  if (state.window !== window || state.last > serverNow || Object.keys(limits).some(k => !Number.isInteger(state.used[k]) || state.used[k] < 0 || state.used[k] > limits[k])) return [-2, 0];
  if (state.used[profile] + +weight > limits[profile] && profile==='public' && fallback==='1') profile='recovery';
  if (state.used[profile] + +weight > limits[profile]) return [0, state.used[profile],profile];
  state.used[profile] += +weight; state.last = serverNow; rows.set(key, JSON.stringify(state)); commits++;
  if (lose) { lose = false; throw Error('Synthetic lost reply'); }
  return [1, state.used[profile],profile];
} };

eq(freeDemoBudgetConfiguration({}), undefined);
eq(freeDemoBudgetConfiguration({ BAZAAR_FREE_DEMO_ADMISSION_UNTIL: until }).limits, { public: 155000, authenticated: 90000, recovery: 105000 });
for (const bad of ['', '2026-99-12T20:00:00.000Z', '2026-10-12T20:00:00Z', 'Infinity']) {
  assert.throws(() => freeDemoBudgetConfiguration({ BAZAAR_FREE_DEMO_ADMISSION_UNTIL: bad }), { code: 'FREE_DEMO_BUDGET_UNAVAILABLE' }); assertions++;
}
for (const limits of [{ public: 0, authenticated: 1, recovery: 1 }, { public: 1.5, authenticated: 1, recovery: 1 }, { public: 200000, authenticated: 100000, recovery: 100000 }, { public: 1, authenticated: 1, recovery: 1, other: 1 }, [], null]) {
  assert.throws(() => config(limits), { code: 'FREE_DEMO_BUDGET_UNAVAILABLE' }); assertions++;
}
assert.throws(() => createFreeDemoBudgetStore(redis, 'other:production', config(tinyLimits)), { code: 'FREE_DEMO_BUDGET_UNAVAILABLE' }); assertions++;
const store = createFreeDemoBudgetStore(redis, prefix, config(tinyLimits));
await store.reserve({ profile: 'public', newOperation: false });
await store.reserve({ profile: 'public', newOperation: false });
const afterPublic = commits, beforeRejected = JSON.stringify([...rows]);
await rejects(() => store.reserve({ profile: 'public', newOperation: false }), { code: 'FREE_DEMO_REQUEST_LIMIT', status: 429, retryAfter: 60 });
eq(commits, afterPublic, 'Denied requests cannot increment counters'); eq(JSON.stringify([...rows]), beforeRejected);
await store.reserve({ profile: 'authenticated', newOperation: true });
await store.reserve({ profile: 'recovery', newOperation: false });
eq(JSON.parse([...rows.values()][0]).used, { public: 488, authenticated: 448, recovery: 428 });
const restarted = createFreeDemoBudgetStore(redis, prefix, config(tinyLimits));
serverNow += 86400000;
await rejects(() => restarted.reserve({ profile: 'public', newOperation: false }), { code: 'FREE_DEMO_REQUEST_LIMIT' });
eq(JSON.parse([...rows.values()][0]).used.public, 488, 'Midnight, process restart and expired admission cannot replenish the window');
// Use an independently valid namespace; never expose workspace account IDs.
const isolated = createFreeDemoBudgetStore(redis, 'bazaar-workspace:pilot-' + 'b'.repeat(32), config(tinyLimits));
await isolated.reserve({ profile: 'public', newOperation: false }); eq(rows.size, 2);
const concurrencyStore = createFreeDemoBudgetStore(redis, 'bazaar-workspace:pilot-' + 'c'.repeat(32), config({ public: 244, authenticated: 448, recovery: 428 }));
const concurrent = await Promise.allSettled(Array.from({ length: 20 }, () => concurrencyStore.reserve({ profile: 'public', newOperation: false })));
eq(concurrent.filter(r => r.status === 'fulfilled').length, 1); eq(concurrent.filter(r => r.status === 'rejected' && r.reason.code === 'FREE_DEMO_REQUEST_LIMIT').length, 19);
const lostStore = createFreeDemoBudgetStore(redis, 'bazaar-workspace:pilot-' + 'd'.repeat(32), config(tinyLimits));
lose = true; const beforeLost = calls;
await rejects(() => lostStore.reserve({ profile: 'recovery', newOperation: false }), { code: 'FREE_DEMO_BUDGET_UNAVAILABLE' });
eq(calls - beforeLost, 1); await lostStore.reserve({ profile: 'recovery', newOperation: false });
await rejects(() => lostStore.reserve({ profile: 'recovery', newOperation: false }), { code: 'FREE_DEMO_REQUEST_LIMIT' });
fail = true; const beforeFail = calls; await rejects(() => lostStore.reserve({ profile: 'authenticated', newOperation: true }), { code: 'FREE_DEMO_BUDGET_UNAVAILABLE' }); eq(calls - beforeFail, 1); fail = false;
serverNow -= 200000000;
await rejects(() => lostStore.reserve({ profile: 'authenticated', newOperation: true }), { code: 'FREE_DEMO_BUDGET_UNAVAILABLE' }); serverNow += 200000000;
const invalid = await classifyFreeDemoRequest(request('deliver_market_order', 'x'.repeat(43)), async () => { throw new WorkspaceError('UNAUTHORIZED', 401); });
eq(invalid, { profile: 'public', newOperation: false, credentialRead:true });
eq(await classifyFreeDemoRequest(request('get_market_order', 'a'.repeat(43)), async () => ({ role: 'agent' })), { profile: 'recovery', newOperation: false });
eq(await classifyFreeDemoRequest(request('create_market_order', 'a'.repeat(43)), async () => ({ role: 'agent' })), { profile: 'authenticated', newOperation: true });
await rejects(()=>classifyFreeDemoRequest(request('get_market_order','a'.repeat(43)),async()=>{throw new WorkspaceError('WORKSPACE_UNAVAILABLE',503);}),{code:'FREE_DEMO_BUDGET_UNAVAILABLE',status:503});
let verifiedDiscovery = 0;
await classifyFreeDemoRequest(request('search_services', 'a'.repeat(43)), async () => { verifiedDiscovery++; }); eq(verifiedDiscovery, 0, 'Public discovery never spends the private recovery partition');

const control = (method, token) => new Request('https://free.example/api/mcp', { method: method==='GET'?'GET':'POST', headers: { ...(token?{authorization:'Bearer '+token}:{}), ...(method==='GET'?{}:{'content-type':'application/json'}) }, ...(method==='GET'?{}:{body:JSON.stringify({jsonrpc:'2.0',id:1,method})}) });
await rejects(()=>classifyFreeDemoRequest(control('initialize','a'.repeat(43)),async()=>{throw new WorkspaceError('WORKSPACE_UNAVAILABLE',503);}),{code:'FREE_DEMO_BUDGET_UNAVAILABLE',status:503});
const transportStore = createFreeDemoBudgetStore(redis, 'bazaar-workspace:pilot-' + 'e'.repeat(32), config({public:100,authenticated:500,recovery:500}));
await transportStore.reserve({profile:'public',newOperation:false,workload:'metadata',credentialRead:true});
for(const method of ['GET','initialize','notifications/initialized','tools/list']){
  const verified=await classifyFreeDemoRequest(control(method,'a'.repeat(43)),async()=>({role:'agent'}));
  eq(verified.recoveryTransport,true);const before=calls;
  const receipt=await transportStore.reserve(verified);eq(receipt.profile,'recovery');eq(receipt.reservedCommands,100);eq(calls-before,1,'Authenticated control fallback must happen in the same EVAL');
}
const invalidTransport=await classifyFreeDemoRequest(control('initialize','x'.repeat(43)),async()=>{throw new WorkspaceError('UNAUTHORIZED',401);});
eq(invalidTransport.recoveryTransport,undefined);
const beforeInvalidControl=calls,beforeInvalidWrite=commits;
await rejects(()=>transportStore.reserve(invalidTransport),{code:'FREE_DEMO_REQUEST_LIMIT'});eq(calls-beforeInvalidControl,1);eq(commits,beforeInvalidWrite);
const anonymousTransport=await classifyFreeDemoRequest(control('GET'),async()=>{throw Error('Anonymous transport cannot authenticate');});
eq(anonymousTransport.recoveryTransport,undefined);await rejects(()=>transportStore.reserve(anonymousTransport),{code:'FREE_DEMO_REQUEST_LIMIT'});
for(const name of ['get_bazaar_capabilities','get_bazaar_skills','get_service','search_services']){
  const discovery=await classifyFreeDemoRequest(request(name,'a'.repeat(43)),async()=>{throw Error('Public tools must never claim a recovery transport');});
  eq(discovery.recoveryTransport,undefined);await rejects(()=>transportStore.reserve(discovery),{code:'FREE_DEMO_REQUEST_LIMIT'});
}

const names = ['BAZAAR_FREE_DEMO_ADMISSION_UNTIL', 'BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON', 'BAZAAR_PUBLIC_DEMO', 'BAZAAR_ENABLE_OPEN_WORKSPACES', 'BAZAAR_WORKSPACE_ADMISSION', 'BAZAAR_WORKSPACE_BACKEND', 'BAZAAR_WORKSPACE_PREFIX', 'BAZAAR_WORKSPACE_PUBLIC_ORIGIN', 'BAZAAR_OPERATIONAL_METER', 'BAZAAR_OPERATIONAL_BUDGET'];
const old = Object.fromEntries(names.map(name => [name, process.env[name]]));
try {
  Object.assign(process.env, { BAZAAR_FREE_DEMO_ADMISSION_UNTIL: until, BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON: JSON.stringify({ public: 10000, authenticated: 10000, recovery: 10000 }), BAZAAR_PUBLIC_DEMO: 'true', BAZAAR_ENABLE_OPEN_WORKSPACES: 'true', BAZAAR_WORKSPACE_ADMISSION: 'open', BAZAAR_WORKSPACE_BACKEND: 'redis', BAZAAR_WORKSPACE_PREFIX: prefix, BAZAAR_WORKSPACE_PUBLIC_ORIGIN: 'https://free.example', BAZAAR_OPERATIONAL_METER: 'false', BAZAAR_OPERATIONAL_BUDGET: 'false' });
  const tokens = ['a'.repeat(43), 'b'.repeat(43)], hashes = tokens.map(token => createHash('sha256').update(token).digest('hex'));
  const accepted = [], ingress = [];
  setWorkspaceStoreForTests({ async resolveHash(hash) { const index = hashes.indexOf(hash); if (index < 0) throw new WorkspaceError('UNAUTHORIZED', 401); return { ownerId: 'ow_' + (index ? 'b' : 'a').repeat(32), agentId: 'agent_' + (index ? 'b' : 'a').repeat(32), role: 'agent', generation: 1 }; }, async consumeIngress(ip) { ingress.push(ip); } });
  setFreeDemoBudgetStoreForTests({ async reserve(kind) { accepted.push(kind); return {}; } });
  const original = request('get_market_order', tokens[0]); await Promise.all(Array.from({length:10},()=>demoIngress(original))); await demoIngress(original);
  const nested = inheritDemoIngress(original, new Request('https://free.example/api/market/orders/example', { headers: { authorization: 'Bearer ' + tokens[0] } })); await demoIngress(nested);
  eq(accepted.length, 1, 'MCP and nested native handler reserve once'); eq(ingress.length, 1);
  await demoIngress(request('get_market_order', tokens[1])); eq(accepted.length, 2); eq(accepted[1].profile, 'recovery');
  await demoIngress(request('deliver_market_order', 'x'.repeat(43))); eq(accepted.at(-1).profile, 'public', 'A forged token cannot consume recovery');
  await demoIngress(request('search_services')); eq(accepted.at(-1).profile, 'public');
  setFreeDemoBudgetStoreForTests({ async reserve() { throw new WorkspaceError('FREE_DEMO_REQUEST_LIMIT', 429, 60); } });
  const beforeIngress = ingress.length;
  await rejects(() => demoIngress(request('search_services')), { code: 'FREE_DEMO_REQUEST_LIMIT', status: 429 }); eq(ingress.length, beforeIngress, 'Denied reservation stops before the existing quota CAS');
  delete process.env.BAZAAR_FREE_DEMO_ADMISSION_UNTIL;
  await demoIngress(request('search_services'));eq(ingress.length,beforeIngress+1,'Unset feature retains the existing ingress without the new store');
} finally {
  setFreeDemoBudgetStoreForTests(); setWorkspaceStoreForTests(undefined);
  for (const [name, value] of Object.entries(old)) value === undefined ? delete process.env[name] : process.env[name] = value;
}

assert.ok([...rows.values()].every(raw => !raw.includes('ownerId') && !raw.includes('authorization') && !raw.includes('arguments'))); assertions++;
const idle = {
  public: 3 * freeDemoCommandReservation({profile:'public',newOperation:false,workload:'metadata'}),
  authenticated: freeDemoCommandReservation({profile:'authenticated',newOperation:true,workload:'capacity'}),
  recovery: freeDemoCommandReservation({profile:'recovery',newOperation:false,workload:'identity'}) + freeDemoCommandReservation({profile:'recovery',newOperation:false,workload:'orders'}),
};
const verifiedTransportExtra=3*4*360;
console.log(JSON.stringify({ status: 'PASS_OFFLINE_ONLY', assertions, atomicConcurrency: true, denialWithoutWrite: true, lostReplyNoRetry: true, midnightAndRestartDoNotReset: true, authenticatedRecovery: true, nativeMcpDeduplicated: true, verifiedTransportFallbackSingleEval:true, publicToolsCannotSpendRecovery:true, budgetEvidence: 'conservative-command-reservations-not-billing', idleCommandsPerTick: idle, idleFourMinuteDayReservationUncached: Object.fromEntries(Object.entries(idle).map(([p, n]) => [p, n * 360+(p==='public'?verifiedTransportExtra:0)])), idleFourMinuteDayReservationWith32MinuteIdentityCache:{public:idle.public*360+verifiedTransportExtra,authenticated:idle.authenticated*360,recovery:204*(360+45)}, network: 0, payment: 0 }));
