// Two exact GETs only; no native records, secrets or operation IDs are output.
import {readFile,writeFile} from 'node:fs/promises';
import {continuousFreeBudgetKey,continuousFreeBudgetConfiguration} from '../lib/continuous-free-budget.ts';
import {continuousStorageKey,CONTINUOUS_FREE_STORAGE_TECHNICAL_RESERVE} from '../lib/continuous-free-storage.ts';
const fail=()=>{throw Error('PREVIEW_STATE_READ_UNCONFIRMED');};
try{
 if(process.argv.slice(2).join(' ')!=='--execute')fail();
 const receipt=JSON.parse(await readFile('docs/evidence/continuous-on-demand-v2-final-v2-preview-deployment-2026-10-11.json','utf8'));
 if(receipt.sourceDigest!=='54235252ccb9022247cfa579ca99c82af5bf84ce8444d334c006bc50ce2e9e76'||receipt.purchasesEnabled!==false||receipt.payments!==0||receipt.productionPublished!==false||receipt.crons.length)fail();
 let input='';for await(const b of process.stdin){input+=b;if(input.length>8192)fail();}const credentials=JSON.parse(input);input='';
 if(credentials.url!=='https://smooth-dory-323957.upstash.io'||typeof credentials.token!=='string'||!/^[\x21-\x7e]{20,4096}$/.test(credentials.token))fail();
 const prefix='bazaar-workspace:pilot-14eed63c2c93c8d109322394f4e96a50',limits={public:155000,authenticated:90000,recovery:105000,background:50000};
 const config=continuousFreeBudgetConfiguration({BAZAAR_FREE_DEMO_MODE:'continuous',BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON:JSON.stringify(limits)});
 const r=await fetch(credentials.url+'/pipeline',{method:'POST',headers:{authorization:'Bearer '+credentials.token,'content-type':'application/json'},body:JSON.stringify([['GET',continuousFreeBudgetKey(prefix)],['GET',continuousStorageKey(prefix)]]),redirect:'error',signal:AbortSignal.timeout(20000)});
 credentials.token='';const raw=await r.text();if(!r.ok||Buffer.byteLength(raw)>3_000_000)fail();const values=JSON.parse(raw);if(!Array.isArray(values)||values.length!==2||values.some(v=>v.error||typeof v.result!=='string'))fail();
 const budget=JSON.parse(values[0].result),storage=JSON.parse(values[1].result);
 if(budget.version!==2||budget.configuration!==config.configurationId||!Array.isArray(budget.buckets)||!Array.isArray(budget.held)||storage.version!==1||storage.initialized!==true||storage.scope!=='pilot-14eed63c2c93c8d109322394f4e96a50')fail();
 const used=Object.fromEntries(Object.keys(limits).map(p=>[p,budget.buckets.reduce((n,b)=>n+b.used[p],0)]));const transferBytes=budget.buckets.reduce((n,b)=>n+b.bytes,0);
 const nativeBytes=Object.values(storage.entries).reduce((n,e)=>n+e.bytes,0),reservedBytes=Object.values(storage.entries).reduce((n,e)=>n+e.reserved,0);
 if(Object.entries(used).some(([p,n])=>!Number.isSafeInteger(n)||n<0||n>limits[p])||!Number.isSafeInteger(transferBytes)||transferBytes<0||transferBytes>8_000_000_000||nativeBytes+reservedBytes+CONTINUOUS_FREE_STORAGE_TECHNICAL_RESERVE>200_000_000)fail();
 const proof={status:'PASS_READ_ONLY_PREVIEW_BUDGET',observedAt:new Date().toISOString(),sourceDigest:receipt.sourceDigest,deploymentId:receipt.deploymentId,ledgerPresent:true,usedReservations:used,limits,transferReservedBytes:transferBytes,transferLimitBytes:8_000_000_000,pendingHeldOperations:budget.held.length,storageNativeBytes:nativeBytes,storageReservedBytes:reservedBytes,storageTechnicalBytes:CONTINUOUS_FREE_STORAGE_TECHNICAL_RESERVE,storageLimitBytes:200_000_000,evidenceType:'conservative-reservation-not-provider-invoice',restRequests:1,redisCommands:2,redisWrites:0,realPayments:0,providerExecutions:0,productionPublished:false,cronActivated:false};
 await writeFile('docs/evidence/on-demand-v2-preview-budget-read-2026-10-12.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(proof));
}catch{console.log(JSON.stringify({status:'UNCONFIRMED',code:'PREVIEW_STATE_READ_UNCONFIRMED',realPayments:0,productionPublished:false,cronActivated:false}));process.exitCode=1;}
