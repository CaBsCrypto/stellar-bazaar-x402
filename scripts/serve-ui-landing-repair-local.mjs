import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '..');
const report = JSON.parse(await readFile(resolve(root, 'docs/evidence/ui-landing-repair-build-v3-2026-10-13.json')));
if (report.status !== 'PASS_UI_LANDING_REPAIR_BUILD' || report.sourceDigest !== '40e9459b6906a085982a869c7633d055360cfa71048512113fa22379db861ca5') throw Error('PASSED_FROZEN_UI_BUILD_REQUIRED');
const source = JSON.parse(await readFile(resolve(root, 'docs/evidence/ui-landing-repair-source-2026-10-13.json')));
for (const row of source.files) if (createHash('sha256').update(await readFile(resolve(root, source.sourceDirectory, row.path))).digest('hex') !== row.sha256) throw Error('FROZEN_UI_SOURCE_CHANGED');
const preload = resolve(root, '.vercel/ui-landing-repair-local-only.cjs');
await writeFile(preload, "const local=new Set(['localhost','127.0.0.1','::1','[::1]']);const check=v=>{const hostname=typeof v==='string'||v instanceof URL?new URL(v).hostname:v?.hostname||v?.host?.split(':')[0]||'localhost';if(!local.has(hostname))throw Error('UI_LOCAL_OUTBOUND_DENIED');};for(const name of ['node:http','node:https']){const m=require(name);for(const key of ['request','get']){const original=m[key];m[key]=function(...args){check(args[0]);return original.apply(this,args);};}}const originalFetch=globalThis.fetch;globalThis.fetch=(input,...args)=>{check(typeof input==='string'||input instanceof URL?input:input.url);return originalFetch(input,...args);};\n", { flag: 'wx' });
const allowed = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ComSpec', 'PATHEXT'];
const env = { ...Object.fromEntries(allowed.filter(k => process.env[k]).map(k => [k, process.env[k]])), NODE_ENV: 'production',
  NODE_OPTIONS: '--require "' + preload.replaceAll('\\', '/') + '"', NEXT_TELEMETRY_DISABLED: '1',
  BAZAAR_ENABLE_MARKETPLACE: 'true', NEXT_PUBLIC_BAZAAR_MARKETPLACE: 'true', BAZAAR_PUBLIC_DEMO: 'true', BAZAAR_ROUTE_BOUNDARY: 'true',
  BAZAAR_ENABLE_MARKET_PURCHASES: 'false', BAZAAR_MARKET_FILES_ENABLED: 'false', BAZAAR_ENABLE_OPEN_WORKSPACES: 'false', BAZAAR_WORKSPACE_CREATION_PAUSED: 'true',
  BAZAAR_WORKSPACE_PREFIX: 'bazaar-workspace:pilot-00000000000000000000000000000000', BAZAAR_WORKSPACE_BACKEND: 'redis',
  BAZAAR_MARKET_PREFIX: 'bazaar-market:pilot-00000000000000000000000000000000', BAZAAR_REVIEW_PREFIX: 'bazaar-review:pilot-00000000000000000000000000000000',
  BAZAAR_DYNAMIC_PREFIX: 'bazaar-market:pilot-00000000000000000000000000000000:catalog', BAZAAR_WORKSPACE_LOCAL_ORIGIN: 'http://127.0.0.1:3008' };
// These inert placeholders satisfy module import validation, never authenticate:
// .invalid is rejected by the outbound guard before any transport can begin.
env.BAZAAR_WORKSPACE_REDIS_REST_URL = 'https://redis.invalid';
env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN = 'synthetic-ui-placeholder-not-a-credential';
env.BAZAAR_PROVIDER_REVIEW_BACKEND = 'redis';
const child = spawn(process.execPath, [resolve(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3008'], { cwd: resolve(root, '.vercel/ui-landing-repair-local-build-v3'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
console.log(JSON.stringify({ status: 'STARTING_LOCAL_UI_ONLY', url: 'http://127.0.0.1:3008', sourceDigest: report.sourceDigest, parentPid: process.pid, childPid: child.pid, credentialsInherited: false, externalRequestsBlocked: true, realRedisConfigured: false, productionChanged: false }));
let logged = 0;
const log = part => { logged += part.length; if (logged <= 262144) process.stdout.write(part); };
child.stdout.on('data', log); child.stderr.on('data', log);
const timeout = setTimeout(() => child.kill(), 30 * 60000);
process.on('SIGINT', () => child.kill()); process.on('SIGTERM', () => child.kill());
child.on('close', code => { clearTimeout(timeout); process.exitCode = code ?? 0; });
child.on('error', () => { clearTimeout(timeout); console.error('LOCAL_UI_SERVER_UNAVAILABLE'); process.exitCode = 1; });
