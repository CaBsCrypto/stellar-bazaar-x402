import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
assert.match(process.version, /^v22\./);
assert.equal((await readdir('.')).some((name) => /^\.env(?:\.(?:local|development|development\.local|production|production\.local|test|test\.local))?$/.test(name)), false);
const keep = ['SystemRoot','SystemDrive','WINDIR','COMSPEC','PATH','PATHEXT','TEMP','TMP','APPDATA','LOCALAPPDATA','USERPROFILE','HOMEDRIVE','HOMEPATH','ProgramFiles','ProgramFiles(x86)','ProgramData','OS','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE'];
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => keep.includes(k)));
Object.assign(env, {
  BAZAAR_ENABLE_OPEN_WORKSPACES: 'true', BAZAAR_WORKSPACE_BACKEND: 'file',
  BAZAAR_WORKSPACE_FILE_DIRECTORY: 'C:/Users/MGC/AppData/Local/Temp/bazaar-sprint-review-file-20261001',
  BAZAAR_WORKSPACE_PREFIX: 'bazaar-workspace:local-test',
  BAZAAR_WORKSPACE_LOCAL_ORIGIN: 'http://127.0.0.1:3347',
  X402_PILOT_PAYMENTS_ENABLED: 'false', X402_LEGACY_PAYMENTS_ENABLED: 'false',
  X402_ENABLE_LOCAL_PAYER: 'false', BAZAAR_ENABLE_PROVIDER_ACTIVATION: 'false',
  BAZAAR_ENABLE_REGISTRY_MUTATIONS: 'false', NEXT_TELEMETRY_DISABLED: '1',
});
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-H', '127.0.0.1', '-p', '3347'], { env, stdio: 'inherit' });
child.once('exit', (code) => { process.exitCode = code ?? 1; });
