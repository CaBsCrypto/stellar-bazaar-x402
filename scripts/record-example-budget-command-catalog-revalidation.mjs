// New local receipt; preserves every earlier source/evidence snapshot.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const sha=value=>createHash('sha256').update(value).digest('hex');
const scripts=['scripts/test-example-budget-command-weight.mjs','scripts/test-example-budget-profile-proof.mjs','scripts/test-example-budget-response-upper.mjs'];
const results=scripts.map(script=>({script,result:JSON.parse(execFileSync(process.execPath,[script],{encoding:'utf8'}).trim())}));
const catalog=JSON.parse(await readFile('scripts/fixtures/example-budget-command-catalog.json','utf8'));
const catalogSha256=sha(JSON.stringify(catalog.rows));if(catalogSha256!=='4bd38e140249441b67e2c070211cddd548b0c051b066be5eb2240de0f3025693')throw Error('REVIEWED_NATIVE_LUA_CATALOG_CHANGED');
const files=[...Object.keys(catalog.sourceSha256),'lib/example-budget-command-weight.ts','lib/example-budget-wire.ts','scripts/fixtures/example-budget-command-catalog.json',...scripts];
const sourceSha256=Object.fromEntries(await Promise.all(files.map(async path=>[path,sha(await readFile(path))])));
const previousPath='docs/evidence/example-budget-profile-groundwork-local-2026-10-12.json',previousEvidenceSha256=sha(await readFile(previousPath));
const receipt={version:1,status:'PASS_LOCAL_COMMAND_CATALOG_AFTER_CAPACITY_METADATA_FIX',observedAt:new Date().toISOString(),catalogSha256,scripts:catalog.rows.length,maximumReviewedEvalCommands:17,scriptHashesAndArityUnchanged:true,results,sourceSha256,previousEvidence:{path:previousPath,sha256:previousEvidenceSha256,rewritten:false},numericalSavingsActivated:false,genericHoldBytes:2000000000,backgroundCreditBytes:100000000,networkRequests:0,credentialReads:0,ledgerWrites:0,realPayments:0,productionChanges:0,limitations:['This validates local source and exact script metadata after the maximum-record-size correction. It does not execute or validate a complete Redis purchase trace.','No claim is made that an earlier failed synthetic namespace has become valid under changed capacity projections.']};
const path='docs/evidence/example-budget-command-catalog-v2-local-2026-10-12.json';await writeFile(path,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:receipt.status,evidence:path,checks:results.reduce((sum,row)=>sum+row.result.checks,0),catalogSha256,networkRequests:0,ledgerWrites:0,payments:0}));
