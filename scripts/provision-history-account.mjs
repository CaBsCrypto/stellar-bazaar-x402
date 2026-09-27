import { mkdirSync, writeFileSync, realpathSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateHistoryKeypair } from '../lib/operation-history-auth.ts';

// Operator-only, offline provisioning. No public API, remote writes or implicit registration.
if (process.argv.length !== 4 || process.argv[2] !== '--out') throw new Error('Usage: node scripts/provision-history-account.mjs --out <new-private-directory>');
const output = resolve(process.argv[3]);
const repo = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const parent = realpathSync(dirname(output));
const parentRelative = relative(repo, parent);
if (parentRelative === '' || (!parentRelative.startsWith('..') && !isAbsolute(parentRelative))) throw new Error('Output must be outside the repository');
if (existsSync(output)) throw new Error('Output already exists; refusing to overwrite');
mkdirSync(output, { mode: 0o700 });
if (process.platform === 'win32') {
  // Secure the empty directory before writing secrets. Stop on ACL failure.
  const sid = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], { encoding: 'utf8' }).trim();
  if (!/^S-1-[0-9-]+$/.test(sid)) throw new Error('Cannot determine operator SID');
  execFileSync('icacls.exe', [output, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], { stdio: 'ignore' });
}
const credentials = generateHistoryKeypair();
const { ownerId, readTokenHash, writeTokenHash } = credentials;
writeFileSync(resolve(output, 'credentials.json'), JSON.stringify(credentials, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
writeFileSync(resolve(output, 'account.json'), JSON.stringify({ ownerId, readTokenHash, writeTokenHash }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log('Private files created. No server registration performed. Follow docs/HISTORY_IDENTITY.md.');
