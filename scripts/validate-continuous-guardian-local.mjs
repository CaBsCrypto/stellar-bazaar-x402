import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const suites=['scripts/test-continuous-guardian.mjs','scripts/test-continuous-workspace-index.mjs','scripts/test-continuous-maintenance.mjs','scripts/test-continuous-review-storage.mjs','scripts/test-on-demand-x402-integration.mjs','scripts/test-seller-storage-budget.mjs','scripts/test-seller-on-demand.mjs','scripts/test-market-guardian.mjs','scripts/test-market-file-retention.mjs','scripts/test-workspace-retention.mjs'];
const paths=['lib/market-guardian.ts','lib/workspace-store.ts','lib/market-maintenance.ts','lib/provider-review-redis.ts','lib/marketplace-store.ts','lib/marketplace-x402.ts','lib/marketplace-capacity.ts','lib/continuous-free-budget.ts','lib/continuous-free-storage.ts','lib/market-text-seller-runtime.ts','examples/seller-hosted-tick.mjs','examples/seller-hosted-handler.mjs','examples/seller-redis-secret-store.mjs'];
const hash=value=>createHash('sha256').update(value).digest('hex'),pins=async()=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(p))])));
const before=await pins(),results=[];
for(const suite of suites){const child=spawnSync(process.execPath,[suite],{encoding:'utf8',timeout:90000,maxBuffer:262144});if(child.status!==0)throw Error('LOCAL_SUITE_FAILED:'+suite);const output=child.stdout.trim().split('\n').at(-1);results.push({suite,...JSON.parse(output)});}
const after=await pins();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('SOURCE_CHANGED_DURING_LOCAL_VALIDATION');
const report={schema:'bazaar.continuous-guardian-local/v1',observedAt:new Date().toISOString(),status:'PASS_LOCAL_ONLY',suites:results.length,results,sources:after,realRedis:false,realR2:false,realPayments:0,cloudWrites:0,cronActivated:false,productionValidated:false};
if(process.argv[2]==='--write-evidence')await writeFile('docs/evidence/continuous-guardian-local-2026-10-11.json',JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({status:report.status,suites:report.suites,realPayments:0,cloudWrites:0,cronActivated:false,evidence:process.argv[2]==='--write-evidence'?'docs/evidence/continuous-guardian-local-2026-10-11.json':null})+'\n');
