import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { generateHistoryKeypair, authenticateHistory } from '../lib/operation-history-auth.ts';
import { preparePrivateDirectory, savePrivatePair } from './history-private-files.mjs';
const args=process.argv.slice(2);
if(args.length!==8 || args[0]!=='--account' || args[2]!=='--credentials' || args[4]!=='--role' || args[6]!=='--out' || !['read','write','both'].includes(args[5])) throw new Error('Usage: node scripts/rotate-history-account.mjs --account <trusted-account.json> --credentials <private-credentials.json> --role <read|write|both> --out <new-private-directory>');
let account,credentials;
try {account=JSON.parse(readFileSync(args[1],'utf8'));credentials=JSON.parse(readFileSync(args[3],'utf8'));} catch {throw new Error('Cannot read operator account and credentials');}
try {
  for(const role of ['read','write']) {
    const token=credentials[`${role}Token`];
    if(typeof token!=='string' || !token.startsWith(`bz_${role}_`) || createHash('sha256').update(token).digest('hex')!==credentials[`${role}TokenHash`] || credentials[`${role}TokenHash`]!==account[`${role}TokenHash`]) throw new Error();
    const principal=authenticateHistory(`Bearer ${token}`,role==='write',JSON.stringify([account]));
    if(principal.ownerId!==credentials.ownerId || principal.permission!==role) throw new Error();
  }
} catch {throw new Error('Existing account association cannot be verified; recovery denied');}
const output=preparePrivateDirectory(args[7]);
const fresh=generateHistoryKeypair(account.ownerId);
const next={ownerId:account.ownerId,readToken:credentials.readToken,writeToken:credentials.writeToken,readTokenHash:account.readTokenHash,writeTokenHash:account.writeTokenHash};
for(const role of ['read','write']) if(args[5]==='both'||args[5]===role) {next[`${role}Token`]=fresh[`${role}Token`];next[`${role}TokenHash`]=fresh[`${role}TokenHash`];}
savePrivatePair(output,next);
console.log('Private rotation proposal created. Server configuration is unchanged. Verify and replace only the matching account entry.');
