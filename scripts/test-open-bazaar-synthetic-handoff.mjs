import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Executes the documentation's literal private scripts and existing MCP helper.
// Local file backend only. No dotenv, historical access, external service or model.
const root = fileURLToPath(new URL('..', import.meta.url));
assert.ok(process.argv.length === 2 || (process.argv.length === 4 && process.argv[2] === '--checkout'));
const serverRoot = process.argv[3] ? resolve(process.argv[3]) : root;
assert.ok(Number(process.versions.node.split('.')[0]) === 22, 'Use Node 22');
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) assert.equal(existsSync(join(serverRoot, name)), false, 'Refuse environment-file loading');
assert.ok(existsSync(join(serverRoot, '.next/BUILD_ID')), 'Build the identified checkout first');
const guide = readFileSync(join(root, 'docs/OPEN_BAZAAR_SYNTHETIC_HANDOFF.md'), 'utf8');
function block(name) {
  const marker = `<!-- handoff-script:${name} -->\n\x60\x60\x60js\n`;
  const start = guide.indexOf(marker); assert.ok(start >= 0);
  return guide.slice(start + marker.length, guide.indexOf('\n\x60\x60\x60', start + marker.length));
}
const evidenceDirectory = mkdtempSync(join(tmpdir(), 'bazaar-synthetic-handoff-'));
const state = join(evidenceDirectory, 'workspaces'); mkdirSync(state);
const owner = join(evidenceDirectory, 'owner'), agent = join(evidenceDirectory, 'agent');
const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PATHEXT|SYSTEMDRIVE)$/i.test(key)));
const guard = pathToFileURL(join(serverRoot, 'scripts/test-open-bazaar-independent.mjs')).href;
const env = {...clean, BAZAAR_INDEPENDENT_NETWORK_GUARD: '1'};
const secrets = [], commands = [];
const counterModule = join(evidenceDirectory, 'count-fetch.mjs');
writeFileSync(counterModule, "import {writeFileSync} from 'node:fs'; const original=globalThis.fetch; let requests=0; globalThis.fetch=(...args)=>{requests++;return original(...args);}; process.on('exit',()=>writeFileSync(process.env.BAZAAR_HANDOFF_COUNTER_FILE,JSON.stringify({requests}),{flag:'wx',mode:0o600}));", {flag: 'wx', mode: 0o600});
let readinessRequests = 0;
async function run(script, args, expected = 0) {
  const counter = join(evidenceDirectory, `command-${commands.length}.json`);
  const child = spawn(process.execPath, ['--import', guard, '--import', pathToFileURL(counterModule).href, script, ...args], {cwd: root, env: {...env, BAZAAR_HANDOFF_COUNTER_FILE: counter}, stdio: ['ignore', 'pipe', 'pipe']});
  let output = ''; child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
  const timeout = setTimeout(() => child.kill(), 20000);
  const code = await new Promise((ok, fail) => {child.once('exit', ok); child.once('error', fail);}); clearTimeout(timeout);
  for (const secret of secrets) assert.ok(!output.includes(secret), 'No raw access in helper output');
  commands.push({script: script.startsWith(evidenceDirectory) ? script.slice(evidenceDirectory.length + 1) : script, mode: args[0], ok: code === expected, requests: JSON.parse(readFileSync(counter, 'utf8')).requests});
  assert.equal(code, expected, `Documented command failed: ${script} (${args[0]}): ${output.slice(-500)}`);
  return output;
}
const helper = join(root, 'examples/agent-workspace-mcp.mjs');
const helperCall = (mode, args, code) => run(helper, [mode, ...args], code);
async function freePort() {
  const listener = createServer(); await new Promise(ok => listener.listen(0, '127.0.0.1', ok));
  const port = listener.address().port; await new Promise(ok => listener.close(ok)); return port;
}
const port = await freePort(), origin = `http://127.0.0.1:${port}`;
let server;
async function start() {
  server = spawn(process.execPath, ['--import', guard, 'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '-p', String(port)], {
    cwd: serverRoot, stdio: ['ignore', 'pipe', 'pipe'], env: {...env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_APP_URL: origin,
      BAZAAR_ENABLE_OPEN_WORKSPACES: 'true', BAZAAR_WORKSPACE_BACKEND: 'file', BAZAAR_WORKSPACE_PREFIX: 'bazaar-workspace:local-test', BAZAAR_WORKSPACE_FILE_DIRECTORY: state, BAZAAR_WORKSPACE_LOCAL_ORIGIN: origin,
      BAZAAR_ENABLE_SELF_LISTING_INTAKE: 'false', BAZAAR_ENABLE_PROVIDER_ACTIVATION: 'false', BAZAAR_ENABLE_REGISTRY_MUTATIONS: 'false',
      X402_PILOT_PAYMENTS_ENABLED: 'false', X402_LEGACY_PAYMENTS_ENABLED: 'false', X402_ENABLE_LOCAL_PAYER: 'false', NEXT_PUBLIC_X402_XLM_PILOT: 'false'},
  });
  let log = ''; server.stdout.on('data', data => log = (log + data).slice(-1000)); server.stderr.on('data', data => log = (log + data).slice(-1000));
  for (let index = 0; index < 40; index++) {
    assert.equal(server.exitCode, null, `Server exited: ${log}`);
    try { readinessRequests++; if ((await fetch(`${origin}/api/mcp`, {signal: AbortSignal.timeout(1000)})).ok) return; } catch {}
    await new Promise(ok => setTimeout(ok, 250));
  }
  throw Error('Bounded server startup failed');
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const ended = new Promise(ok => server.once('exit', ok)); server.kill(); await ended;
}
try {
  await start();
  await helperCall('prepare', [owner, origin]);
  const packet = JSON.parse(readFileSync(join(owner, 'workspace-root.json'), 'utf8'));
  secrets.push(packet.bootstrapAccess, packet.humanAccess, packet.agentAccess);
  assert.equal(new Set(secrets).size, 3);
  assert.equal(packet.state, 'prepared'); assert.ok(!existsSync(join(owner, 'creation-receipt.json')));
  writeFileSync(join(owner, 'human-demo.mjs'), block('human-demo.mjs'), {flag: 'wx', mode: 0o600});
  const human = (mode) => run(join(owner, 'human-demo.mjs'), [mode, root, owner, agent]);
  await human('prepare');
  const intentBytes = readFileSync(join(owner, 'human-intent.json'), 'utf8'), intent = JSON.parse(intentBytes);
  await helperCall('create', [owner]);
  const receipt = readFileSync(join(owner, 'creation-receipt.json'), 'utf8');
  await helperCall('create', [owner]); assert.equal(readFileSync(join(owner, 'creation-receipt.json'), 'utf8'), receipt);
  await human('delegate'); assert.deepEqual(readdirSync(agent), ['agent.json']);
  const delegated = JSON.parse(readFileSync(join(agent, 'agent.json'), 'utf8'));
  assert.equal(delegated.agentAccess, packet.agentAccess); assert.ok(!JSON.stringify(delegated).includes(packet.humanAccess)); assert.ok(!JSON.stringify(delegated).includes(packet.bootstrapAccess));
  await human('send'); await human('send'); assert.equal(readFileSync(join(owner, 'human-intent.json'), 'utf8'), intentBytes);
  await helperCall('tasks', [agent]); await helperCall('claim', [agent, intent.taskId]);
  const attemptPath = join(agent, 'attempts', `${intent.taskId}.json`), claim = readFileSync(attemptPath, 'utf8');
  await helperCall('claim', [agent, intent.taskId]); assert.equal(readFileSync(attemptPath, 'utf8'), claim);
  writeFileSync(join(agent, 'fixture-demo.mjs'), block('fixture-demo.mjs'), {flag: 'wx', mode: 0o600});
  const freeze = () => run(join(agent, 'fixture-demo.mjs'), [root, agent, intent.taskId]);
  await freeze();
  const frozen = Object.fromEntries(['fixture-manifest.json', 'operation.json', 'activity.json', 'response.json'].map(name => [name, readFileSync(join(agent, name), 'utf8')]));
  // Only our synthetic local file lock is injected. No shared/external store touched.
  const lockPath = join(state, 'local-test/lock');
  writeFileSync(lockPath, 'Synthetic handoff definite-before-write failure', {flag: 'wx'});
  try {
    await helperCall('record', [agent, join(agent, 'operation.json')], 1);
    assert.equal(readFileSync(lockPath, 'utf8'), 'Synthetic handoff definite-before-write failure');
  } finally { unlinkSync(lockPath); }
  for (const [name, bytes] of Object.entries(frozen)) assert.equal(readFileSync(join(agent, name), 'utf8'), bytes);
  await helperCall('recover', [agent]);
  const deniedBeforeWrite = await fetch(`${origin}/api/operations`, {headers: {Authorization: `Bearer ${packet.humanAccess}`}, signal: AbortSignal.timeout(10000)});
  assert.equal(deniedBeforeWrite.status, 200); assert.equal((await deniedBeforeWrite.json()).records.length, 0);
  // Explicit same-record retry; the fixture generator is not run after the failure.
  await helperCall('record', [agent, join(agent, 'operation.json')]);
  await helperCall('record', [agent, join(agent, 'operation.json')]);
  await helperCall('activity', [agent, join(agent, 'activity.json')]);
  await helperCall('activity', [agent, join(agent, 'activity.json')]);
  await helperCall('respond', [agent, intent.taskId, join(agent, 'response.json')]);
  const responseAttempt = readFileSync(attemptPath, 'utf8');
  await helperCall('respond', [agent, intent.taskId, join(agent, 'response.json')]);
  assert.equal(readFileSync(attemptPath, 'utf8'), responseAttempt);
  await human('verify');
  await stop(); await start();
  await helperCall('recover', [agent]); await human('verify'); await freeze();
  for (const [name, bytes] of Object.entries(frozen)) assert.equal(readFileSync(join(agent, name), 'utf8'), bytes);
  for (const name of readdirSync(join(state, 'local-test')).filter(name => name.endsWith('.json'))) {
    const value = readFileSync(join(state, 'local-test', name), 'utf8');
    for (const secret of secrets) assert.ok(!value.includes(secret), 'File state stores hashes, never access');
  }
  const result = {ok: true, category: 'local-file-real-http-mcp', literalGuideScripts: true, existingWorkspaceHelper: true, credentialsBeforeCreate: true, delegatedAgentOnly: true, definiteRecordFailure: true, sameRecordRetryWithoutGeneration: true, oneHumanMessage: true, oneAgentResponse: true, oneOperation: true, sameRecoveryAfterRestart: true, commands: commands.length, commandHttpRequests: commands.reduce((total, item) => total + item.requests, 0), readinessRequests, verificationHttpRequests: 1, externalRequests: 0, hostedModels: 0, realPayments: 0, evidenceDirectory};
  writeFileSync(join(evidenceDirectory, 'redacted-result.json'), JSON.stringify({...result, commands}, null, 2), {flag: 'wx', mode: 0o600});
  console.log(JSON.stringify(result));
} finally { await stop(); }
