// One bounded diagnostic of the original operation. Only Redis GET/GET.
import {createHash} from 'node:crypto';
import {readFile,open,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PAYMENT_DIAGNOSTIC_COMMANDS,summarizeSamePaymentPipeline} from './read-same-production-payment-diagnostic.mjs';
const ROOT='C:/Users/MGC/Documents/ChatGPT/Bazaarx402/beta-open-build';
const ORIGIN='https://smooth-dory-323957.upstash.io';
const EVIDENCE='docs/evidence/current-original-payment-recovery-diagnostic-2026-10-12.json';
const INTENT='.vercel/current-original-payment-recovery-read-intent.json';
const SHA=v=>createHash('sha256').update(v).digest('hex');
const BASE='scripts/read-same-production-payment-diagnostic.mjs';
const BASE_SHA='b6477c8f6e77f3082a183c79f4cb57e13594177ee21940d7607477383ace9d01';
const JOURNAL='.vercel/on-demand-production-purchase-31c97193-be74-4b9d-b0a3-f3890b0a41e8.journal.dpapi';
const JOURNAL_SHA='97efd58199da7499b40f0b0b889ddbd7844f91fab0fedb8351e9b9881c530cfb';
const fail=()=>{throw Error('CURRENT_ORIGINAL_READ_UNCONFIRMED');};
async function absent(path){try{await lstat(resolve(ROOT,path));fail();}catch(e){if(e.code!=='ENOENT')throw e;}}
async function save(path,data){const h=await open(resolve(ROOT,path),'wx',0o600);try{await h.writeFile(JSON.stringify(data,null,2)+'\n');await h.sync();}finally{await h.close();}}
export function summarizeCurrentOriginalPayment(rows){
 const result=summarizeSamePaymentPipeline(rows);
 const envelope=JSON.parse(rows[1].result),r=envelope.state.records.find(v=>v.operationId===result.operationId);
 const failure=r?.lastFailure;
 const stages=['verify','before-settle','settle','outcome-save','chain-confirm'];
 const codes=['FACILITATOR_HTTP_REJECTED','FACILITATOR_REDIRECT_BLOCKED','FACILITATOR_JSON_INVALID','FACILITATOR_RESPONSE_BOUND','FACILITATOR_TIMEOUT','FACILITATOR_NETWORK_UNCONFIRMED','PAYMENT_STATE_WRITE_UNCONFIRMED','PAYMENT_RUNTIME_UNCONFIRMED'];
 const failureValid=failure&&stages.includes(failure.stage)&&codes.includes(failure.code)&&Number.isFinite(Date.parse(failure.at))&&Object.keys(failure).every(k=>['stage','code','at','httpStatus','dispatchStarted'].includes(k))&&(failure.httpStatus===undefined||Number.isInteger(failure.httpStatus)&&failure.httpStatus>=100&&failure.httpStatus<=599)&&(failure.dispatchStarted===undefined||typeof failure.dispatchStarted==='boolean');
 if(failure&&!failureValid)fail();
 return {...result,currentRead:true,lastFailurePresent:Boolean(failure),...(failureValid?{lastFailure:{stage:failure.stage,code:failure.code,at:failure.at,...(failure.httpStatus!==undefined?{httpStatus:failure.httpStatus}:{}),...(failure.dispatchStarted!==undefined?{dispatchStarted:failure.dispatchStarted}:{})}}:{}),historicalSubmissionOutcomeDetermined:false,transactionResubmissionPermitted:false};
}
export async function readCurrentOriginalPayment(access,{fetcher=fetch}={}){
 if(resolve(process.cwd())!==resolve(ROOT)||access?.url!==ORIGIN||typeof access.token!=='string'||!/^[\x21-\x7e]{20,4096}$/.test(access.token))fail();
 await absent(INTENT);await absent(EVIDENCE);
 if(SHA(await readFile(resolve(ROOT,BASE)))!==BASE_SHA)fail();
 if(SHA(await readFile(resolve(ROOT,JOURNAL)))!==JOURNAL_SHA)fail();
 await save(INTENT,{version:1,operationId:'31c97193-be74-4b9d-b0a3-f3890b0a41e8',status:'ONE_READ_ONLY_CURRENT_ORIGINAL_PAYMENT_INTENT',restRequests:1,redisCommands:2,redisWrites:0,signatures:0,newPayments:0,createdAt:new Date().toISOString()});
 let response;
 try{response=await fetcher(ORIGIN+'/pipeline',{method:'POST',headers:{authorization:'Bearer '+access.token,'content-type':'application/json'},body:JSON.stringify(PAYMENT_DIAGNOSTIC_COMMANDS),redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});}finally{access.token='';}
 if(response.status!==200||response.redirected||response.url&&response.url!==ORIGIN+'/pipeline'||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'){await response.body?.cancel();fail();}
 const parts=[],reader=response.body?.getReader();let size=0;if(!reader)fail();
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1048576){await reader.cancel();fail();}parts.push(part.value);}}finally{reader.releaseLock();}
 const raw=Buffer.concat(parts);let report;
 try{report=summarizeCurrentOriginalPayment(JSON.parse(raw.toString('utf8')));}finally{raw.fill(0);parts.forEach(v=>v.fill(0));}
 if(SHA(await readFile(resolve(ROOT,JOURNAL)))!==JOURNAL_SHA)fail();
 report={...report,originalFinancialJournalSha256:JOURNAL_SHA,originalFinancialJournalUnchanged:true,evidence:EVIDENCE};
 await save(EVIDENCE,report);return report;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)try{
 const[action='check',flag,pin]=process.argv.slice(2);
 if(action==='check'&&process.argv.length===3)console.log(JSON.stringify({status:'PREPARED_READ_ONLY_SAME_OPERATION_PAYMENT_DIAGNOSTIC',restRequests:1,redisCommands:2,redisWrites:0,newPayments:0,signatures:0,dpapiReads:0,networkRequests:0,evidence:EVIDENCE}));
 else if(action==='read'&&process.argv.length===5&&flag==='--approved-helper-sha256'&&pin===SHA(await readFile(process.argv[1]))){let raw='';for await(const part of process.stdin){raw+=part;if(Buffer.byteLength(raw)>8192)fail();}const access=JSON.parse(raw);raw='';console.log(JSON.stringify(await readCurrentOriginalPayment(access)));}
 else fail();
}catch{console.log(JSON.stringify({status:'UNCONFIRMED_CURRENT_ORIGINAL_READ',code:'CURRENT_ORIGINAL_READ_UNCONFIRMED',redisWrites:0,newPayments:0,signatures:0,secretValuesReturned:0,retryPolicy:'READ_SAVED_EVIDENCE_ONLY'}));process.exitCode=1;}
