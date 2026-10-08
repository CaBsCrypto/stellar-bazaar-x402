// Run the local release checks in independent processes. No hosted requests,
// keys, wallet funding or payments are part of this command.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,mkdir} from 'node:fs/promises';
const run=promisify(execFile);
const cases=['test-demo-routes','test-demo-configuration','test-demo-wallet','test-mcp-stateless-transport','test-workspace-retention','test-workspace-global-quota','test-open-workspace-core','test-open-market-mcp','test-market-card-contract','test-market-capacity','test-market-files','test-market-file-retention','test-market-guardian-cron','test-market-purchase-admission','test-operational-file-recovery','test-market-recovery','test-marketplace-x402','test-market-file-client','test-buyer-portable-runtime','test-external-seller-kit','test-buyer-execution','test-no-hosted-payment-fixtures','test-deliverables','test-deliverable-viewers'];
const evidence={version:1,environment:'local',startedAt:new Date().toISOString(),checks:[],networkPayments:0,productionValidated:false};
try{evidence.candidate=(await run('git',['rev-parse','HEAD'])).stdout.trim();}catch{}
for(const name of cases){
 try{
  const result=await run(process.execPath,['--experimental-strip-types','scripts/'+name+'.mjs'],{timeout:120000,maxBuffer:1024*1024});
  evidence.checks.push({script:name,status:'PASS'});console.log(name+': PASS');
 }catch(error){evidence.checks.push({script:name,status:'FAIL'});console.error(name+': FAIL');console.error((error.stdout??'')+(error.stderr??''));}
}
evidence.completedAt=new Date().toISOString();evidence.ok=evidence.checks.length===cases.length&&evidence.checks.every(c=>c.status==='PASS');
await mkdir('.vercel',{recursive:true});await writeFile('.vercel/demo-local-release-evidence.json',JSON.stringify(evidence,null,2)+'\n');
if(!evidence.ok)process.exitCode=1;
