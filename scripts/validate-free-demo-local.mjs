// Local test aggregation only. No deployment, scheduling, secrets or real payment.
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const tests=[
 'test-free-demo-window.mjs','test-free-demo-budget.mjs','test-seller-free-demo-window.mjs',
 'test-market-purchase-admission.mjs','test-workspace-admission.mjs','test-workspace-global-quota.mjs',
 'test-demo-configuration.mjs','test-open-market-mcp.mjs','test-marketplace-x402.mjs',
 'test-market-seller-capacity.mjs','test-market-review.mjs','test-marketplace-workspace-lifecycle.mjs',
 'test-marketplace.mjs','test-market-recovery.mjs','test-workspace-retention.mjs',
 'test-seller-hosted-tick.mjs','test-seller-hosted-handler.mjs','test-seller-redis-secret-store.mjs',
 'test-demo-qr-boundary.mjs','test-service-share.mjs','test-service-selection.mjs',
 'test-market-catalog-search-ui.mjs','test-market-guardian-cron.mjs','test-market-guardian.mjs',
 'test-no-hosted-payment-fixtures.mjs','test-operational-profile-budget.mjs',
];
const startedAt=new Date().toISOString(),results=[];
async function run(file){
 const at=Date.now(),result=await new Promise(resolve=>{
  const child=spawn(process.execPath,['--experimental-strip-types','scripts/'+file],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='',bytes=0;const timer=setTimeout(()=>child.kill(),90000);
  const collect=chunk=>{bytes+=chunk.length;if(bytes>1048576)child.kill();else output+=chunk.toString();};
  child.stdout.on('data',collect);child.stderr.on('data',collect);
  child.on('error',()=>{clearTimeout(timer);resolve({exitCode:null,diagnostic:'LOCAL_PROCESS_UNAVAILABLE'});});
  child.on('close',exitCode=>{clearTimeout(timer);resolve({exitCode,...(exitCode===0?{evidence:output.trim()}:{diagnostic:output.slice(-4000)})});});
 });
 results.push({file,...result,elapsedMs:Date.now()-at});
 console.log(JSON.stringify({file,status:result.exitCode===0?'PASS':'FAIL'}));
}
for(let index=0;index<tests.length;index+=4)await Promise.all(tests.slice(index,index+4).map(run));
const evidence={version:1,status:results.every(r=>r.exitCode===0)?'PASS_LOCAL_ONLY':'FAIL',environment:'local-synthetic',startedAt,completedAt:new Date().toISOString(),results,realPayments:0,productionPublished:false,cronActivated:false,limitations:['Local fixtures do not validate hosted deployment, current invoice, scheduled execution or a real Testnet payment.']};
await writeFile('docs/evidence/free-demo-local-2026-10-11.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({status:evidence.status,tests:results.length,failed:results.filter(r=>r.exitCode!==0).map(r=>r.file)}));
if(evidence.status==='FAIL')process.exitCode=1;
