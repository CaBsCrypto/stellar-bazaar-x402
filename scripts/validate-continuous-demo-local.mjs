import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const tests=[
 'test-market-purchase-admission.mjs','test-market-seller-capacity.mjs','test-marketplace-x402.mjs',
 'test-market-review.mjs','test-market-review-ui.mjs','test-open-market-mcp.mjs',
 'test-seller-hosted-tick.mjs','test-seller-hosted-handler.mjs','test-seller-redis-secret-store.mjs',
 'test-external-seller-kit.mjs','test-seller-supervisor.mjs','test-marketplace-workspace-lifecycle.mjs',
 'test-marketplace.mjs','test-market-recovery.mjs','test-workspace-retention.mjs',
 'test-demo-configuration.mjs','test-demo-routes.mjs','test-demo-qr-boundary.mjs',
 'test-service-share.mjs','test-service-selection.mjs','test-market-catalog-search-ui.mjs',
 'test-no-hosted-payment-fixtures.mjs','test-market-capacity.mjs','test-workspace-admission.mjs',
 'test-workspace-global-quota.mjs',
];
const started=new Date().toISOString(),results=[];
async function run(file){
 const at=Date.now();
 const result=await new Promise(resolve=>{
  const child=spawn(process.execPath,['--experimental-strip-types','scripts/'+file],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='',length=0;const timer=setTimeout(()=>child.kill(),90000);
  const add=b=>{length+=b.length;if(length>1048576)child.kill();else output+=b.toString();};
  child.stdout.on('data',add);child.stderr.on('data',add);
  child.on('error',()=>{clearTimeout(timer);resolve({exitCode:null,error:'LOCAL_PROCESS_UNAVAILABLE'});});
  child.on('close',code=>{clearTimeout(timer);const count=output.match(/"(?:scenarios|checks)":(\d+)/)?.[1];resolve({exitCode:code,scenarioCount:count?Number(count):undefined,...(code===0?{}:{diagnostic:output.slice(-6000)})});});
 });
 results.push({file,...result,elapsedMs:Date.now()-at});
 console.log(JSON.stringify({file,status:result.exitCode===0?'PASS':'FAIL',scenarioCount:result.scenarioCount}));
}
for(let i=0;i<tests.length;i+=4)await Promise.all(tests.slice(i,i+4).map(run));
const evidence={version:1,status:results.every(r=>r.exitCode===0)?'PASS':'FAIL',environment:'local-synthetic',startedAt:started,completedAt:new Date().toISOString(),results,realPayments:0,productionPublished:false,cronActivated:false,limitations:['Local dependency fixtures do not establish hosted payment or scheduled execution acceptance.']};
await writeFile('docs/evidence/continuous-local-2026-10-11.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({status:evidence.status,tests:results.length,failed:results.filter(r=>r.exitCode!==0).map(r=>r.file)}));
if(evidence.status!=='PASS')process.exitCode=1;
