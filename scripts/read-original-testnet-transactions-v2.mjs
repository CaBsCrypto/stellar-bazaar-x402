// Root-only historical observation. No app credential, signer or submission.
import {readFile,lstat,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ORIGINAL_RPC_RECOVERY_POLICY as ORIGINAL,inspectOriginalRpcEnvelope,inspectOriginalRpcTransaction,inspectOriginalRpcHealth} from './read-original-testnet-rpc-transfer.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex'),hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),ledger=v=>Number.isSafeInteger(v)&&v>0&&v<=0xffffffff;
const fail=code=>{const e=Error(code);e.scanCode=code;throw e;};
export const ORIGINAL_TRANSACTION_SCAN_POLICY=Object.freeze({...ORIGINAL,startLedger:ORIGINAL.expirationLedger-Math.ceil(300/5),lowerBoundDerivation:Object.freeze({maximumChallengeTimeoutSeconds:300,timeoutDivisor:5,expirationLedger:ORIGINAL.expirationLedger,buyerCoreSha256:'a266765ef86d29794e1c94bd1acb414f9da0c2da52e13383c75d6b4be3e0ac9d'}),maximumPages:40,pageLimit:25,maximumTransactions:1000,maximumCalls:43,maximumTransactionReads:2,maximumResponseBytes:4*1024*1024,maximumTotalBytes:32*1024*1024,maximumDurationMs:120000,evidence:'docs/evidence/original-testnet-transaction-scan-v2-observations-2026-10-12.json',intent:'.vercel/original-testnet-transaction-scan-v2-read-intent.json'});
const C=ORIGINAL_TRANSACTION_SCAN_POLICY,zero={applicationRequests:0,newOrders:0,newSignatures:0,newPaymentSubmissions:0,settlements:0,simulations:0,cloudWrites:0,dpapiReads:0,secretValuesInOutput:0,ownerIdsInOutput:0,envelopesInOutput:0,rawNoncesInOutput:0};
const safeCodes=new Set(['EXACT_ORIGINAL_TRANSACTION_SCAN_PAGE_REQUIRED','MONOTONIC_ORIGINAL_TRANSACTION_SCAN_REQUIRED','UNIQUE_OPAQUE_SCAN_CURSOR_REQUIRED','ORIGINAL_TRANSACTION_SCAN_BOUND','ORIGINAL_TRANSACTION_SCAN_RESPONSE_BOUND','ORIGINAL_TRANSACTION_SCAN_JSON_REQUIRED','ORIGINAL_TRANSACTION_SCAN_RESULT_REQUIRED','EXACT_ORIGINAL_TRANSACTION_SCAN_TRANSPORT_REQUIRED','ORIGINAL_TRANSACTION_SCAN_RETENTION_CHANGED','ORIGINAL_TRANSACTION_CANDIDATE_BINDING_UNCONFIRMED','ORIGINAL_TRANSACTION_SCAN_DEPENDENCY_CHANGED','EXISTING_ORIGINAL_TRANSACTION_SCAN_READ_RECOVERY_ONLY','EXACT_REVIEWED_ORIGINAL_TRANSACTION_SCAN_REQUIRED']);
const safeCode=e=>safeCodes.has(e?.scanCode)?e.scanCode:'ORIGINAL_TRANSACTION_SCAN_UNCONFIRMED';
const cursor=v=>typeof v==='string'&&v.length>0&&v.length<=2048&&/^[\x21-\x7e]+$/.test(v);
const later=(a,b)=>!b||a.ledger>b.ledger||a.ledger===b.ledger&&a.applicationOrder>b.applicationOrder;

/** Cursor is opaque: uniqueness and transaction ordering prove progress. */
export function inspectOriginalTransactionPage(result,{previousPair,requestedCursor,seenCursors=new Set()}={}){
 if(!result||!ledger(result.oldestLedger)||!ledger(result.latestLedger)||result.oldestLedger>result.latestLedger||!Object.hasOwn(result,'transactions')||result.transactions!==null&&!Array.isArray(result.transactions))fail('EXACT_ORIGINAL_TRANSACTION_SCAN_PAGE_REQUIRED');
 const rows=result.transactions??[];if(rows.length>C.pageLimit)fail('EXACT_ORIGINAL_TRANSACTION_SCAN_PAGE_REQUIRED');
 if(!cursor(result.cursor)&&!(rows.length===0&&result.cursor===''))fail('EXACT_ORIGINAL_TRANSACTION_SCAN_PAGE_REQUIRED');
 if(result.oldestLedger>C.startLedger||result.latestLedger<C.endLedger-1)fail('ORIGINAL_TRANSACTION_SCAN_RETENTION_CHANGED');
 if(rows.length&&(result.cursor===requestedCursor||seenCursors.has(result.cursor)))fail('UNIQUE_OPAQUE_SCAN_CURSOR_REQUIRED');
 let pair=previousPair;
 for(const row of rows){
  if(!row||!ledger(row.ledger)||row.ledger<C.startLedger||row.ledger>result.latestLedger||!Number.isSafeInteger(row.applicationOrder)||row.applicationOrder<1||row.applicationOrder>0x7fffffff||!hex(row.txHash)||!['SUCCESS','FAILED'].includes(row.status)||typeof row.feeBump!=='boolean'||typeof row.envelopeXdr!=='string'||!row.envelopeXdr||Buffer.byteLength(row.envelopeXdr)>131072)fail('EXACT_ORIGINAL_TRANSACTION_SCAN_PAGE_REQUIRED');
  if(!later(row,pair))fail('MONOTONIC_ORIGINAL_TRANSACTION_SCAN_REQUIRED');pair={ledger:row.ledger,applicationOrder:row.applicationOrder};
 }
 return {rows,cursor:result.cursor,lastPair:pair,empty:rows.length===0,reachedBoundary:rows.some(row=>row.ledger>=C.endLedger)};
}

/** Local dependency seams support offline fixtures; CLI has no overrides. */
export async function scanOriginalTestnetTransactions({fetcher=fetch,now=Date.now,inspectEnvelope=inspectOriginalRpcEnvelope}={}){
 const started=now(),summary={version:1,scanVersion:2,status:'UNCONFIRMED_ORIGINAL_TESTNET_TRANSACTION_SCAN',operationId:C.operationId,authorizationFingerprint:C.authorizationFingerprint,network:C.network,startLedger:C.startLedger,endLedgerExclusive:C.endLedger,expirationLedger:C.expirationLedger,lowerBoundDerivation:C.lowerBoundDerivation,networkRequests:0,responseBytes:0,rpcMethods:[],pages:0,transactionsInspected:0,unrelatedOrUnparseable:0,matchedOriginalAuthorizations:0,candidatesTruncated:false,windowComplete:false,paymentConfirmed:false,noMatchProvesNoSubmission:false,transactionResubmissionPermitted:false,transactions:[],...zero};
 const rpc=async(method,params)=>{
  const remaining=C.maximumDurationMs-(now()-started);if(!['getHealth','getTransactions','getTransaction'].includes(method)||summary.networkRequests>=C.maximumCalls||remaining<=0)fail('ORIGINAL_TRANSACTION_SCAN_BOUND');
  const id=++summary.networkRequests;summary.rpcMethods.push(method);
  const r=await fetcher(C.origin,{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,...(params===undefined?{}:{params})}),redirect:'manual',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(Math.min(10000,remaining))});
  if(r.status!==200||r.redirected||r.url&&r.url!==C.origin&&r.url!==C.origin+'/'||r.headers.has('location')||r.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json'){await r.body?.cancel();fail('EXACT_ORIGINAL_TRANSACTION_SCAN_TRANSPORT_REQUIRED');}
  const parts=[],reader=r.body?.getReader();let size=0;
  try{if(!reader)fail('ORIGINAL_TRANSACTION_SCAN_JSON_REQUIRED');for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;summary.responseBytes+=part.value.byteLength;if(size>C.maximumResponseBytes||summary.responseBytes>C.maximumTotalBytes){await reader.cancel();fail('ORIGINAL_TRANSACTION_SCAN_RESPONSE_BOUND');}parts.push(part.value);}}finally{reader?.releaseLock();}
  const raw=Buffer.concat(parts);let body;try{try{body=JSON.parse(raw.toString('utf8'));}catch{fail('ORIGINAL_TRANSACTION_SCAN_JSON_REQUIRED');}}finally{raw.fill(0);parts.forEach(b=>b.fill(0));}
  if(body?.jsonrpc!=='2.0'||body.id!==id||body.error!==undefined||!body.result||typeof body.result!=='object'||Array.isArray(body.result))fail('ORIGINAL_TRANSACTION_SCAN_RESULT_REQUIRED');return body.result;
 };
 try{
  summary.health=inspectOriginalRpcHealth(await rpc('getHealth'));if(!summary.health.requestedRangeRetained){summary.status='ORIGINAL_TESTNET_TRANSACTION_WINDOW_UNAVAILABLE';return {...summary,observedAt:new Date(now()).toISOString()};}
  let previousPair,requestedCursor;const seenCursors=new Set(),candidates=new Map();
  for(let page=0;page<C.maximumPages;page++){
   const params=requestedCursor===undefined?{startLedger:C.startLedger,pagination:{limit:C.pageLimit}}:{pagination:{cursor:requestedCursor,limit:C.pageLimit}};
   const inspected=inspectOriginalTransactionPage(await rpc('getTransactions',params),{previousPair,requestedCursor,seenCursors});summary.pages++;
   for(const row of inspected.rows){
    if(row.ledger>=C.endLedger)break;
    if(now()-started>=C.maximumDurationMs||++summary.transactionsInspected>C.maximumTransactions)fail('ORIGINAL_TRANSACTION_SCAN_BOUND');
    let info;try{info=inspectEnvelope(row.envelopeXdr);}catch{summary.unrelatedOrUnparseable++;continue;}
    if(info?.matchesOriginalAuthorization!==true||info.authorizationFingerprint!==C.authorizationFingerprint){summary.unrelatedOrUnparseable++;continue;}
    if(info.expirationLedger!==C.expirationLedger||!hex(info.transactionHash)||!hex(info.innerTransactionHash)||typeof info.feeBump!=='boolean'||info.feeBump!==row.feeBump||row.txHash!==info.transactionHash&&!(info.feeBump&&row.txHash===info.innerTransactionHash))fail('ORIGINAL_TRANSACTION_CANDIDATE_BINDING_UNCONFIRMED');
    summary.matchedOriginalAuthorizations++;
    if(row.status==='SUCCESS'&&!candidates.has(info.transactionHash)){if(candidates.size<C.maximumTransactionReads)candidates.set(info.transactionHash,{transactionHash:info.transactionHash,ledger:row.ledger});else summary.candidatesTruncated=true;}
   }
   previousPair=inspected.lastPair;
   if(inspected.empty||inspected.reachedBoundary){summary.windowComplete=true;break;}
   if(candidates.size){break;} // Confirmation is more useful than unrelated later pages.
   seenCursors.add(inspected.cursor);requestedCursor=inspected.cursor;
  }
  for(const candidate of candidates.values()){
   try{summary.transactions.push(inspectOriginalRpcTransaction(await rpc('getTransaction',{hash:candidate.transactionHash}),candidate,{inspectEnvelope}));}
   catch{summary.transactions.push({transactionHash:candidate.transactionHash,originalAuthorizationMatched:false,conditionsVerified:false,paymentConfirmed:false,code:'ORIGINAL_TRANSACTION_CONFIRMATION_UNCONFIRMED'});}
  }
  summary.paymentConfirmed=summary.transactions.some(r=>r.paymentConfirmed===true);
  summary.status=summary.paymentConfirmed?'MATCHING_ORIGINAL_TESTNET_TRANSACTION_CONFIRMED':summary.windowComplete?'NO_CONFIRMED_MATCH_IN_ORIGINAL_TRANSACTION_WINDOW':'NO_CONFIRMED_MATCH_IN_BOUNDED_TRANSACTION_SCAN';
 }catch(e){summary.code=safeCode(e);}
 return {...summary,observedAt:new Date(now()).toISOString()};
}
async function absent(path){try{await lstat(resolve(path));fail('EXISTING_ORIGINAL_TRANSACTION_SCAN_READ_RECOVERY_ONLY');}catch(e){if(e.code!=='ENOENT')throw e;}}
async function exclusive(path,value){const h=await open(resolve(path),'wx',0o600);try{await h.writeFile(JSON.stringify(value,null,2)+'\n');await h.sync();}finally{await h.close();}}
export async function validateOriginalTransactionScanSources(){for(const[path,pin]of [['scripts/read-original-testnet-transactions.mjs','79acd2bd5f7b2c7444804c633b5f9c55a1dfa05aefe5cb3e67be9a54d16f7459'],['examples/marketplace-x402-buyer.mjs','a266765ef86d29794e1c94bd1acb414f9da0c2da52e13383c75d6b4be3e0ac9d'],['scripts/read-original-testnet-rpc-transfer.mjs','72f43648b57297b1449681d6fd1ab66ea198d267f90832bc178ea4fc21fb60fc'],['scripts/read-existing-testnet-authorization-chain.mjs','984d6a990a365b368344745cfebaaef13f485ab5db316838801d33b251683c57']])if(sha(await readFile(path))!==pin)fail('ORIGINAL_TRANSACTION_SCAN_DEPENDENCY_CHANGED');return true;}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)try{
 const[action='check',flag,pin]=process.argv.slice(2);await validateOriginalTransactionScanSources();
 if(action==='check'&&process.argv.length===3)console.log(JSON.stringify({status:'PREPARED_BOUNDED_ORIGINAL_TESTNET_TRANSACTION_SCAN',scanVersion:2,operationId:C.operationId,maximumRequests:C.maximumCalls,maximumPages:C.maximumPages,pageLimit:C.pageLimit,startLedger:C.startLedger,endLedgerExclusive:C.endLedger,lowerBoundDerivation:C.lowerBoundDerivation,allowedMethods:['getHealth','getTransactions','getTransaction'],networkRequests:0,windowCompletenessNeverAuthorizesResubmission:true,...zero}));
 else if(action==='read'&&process.argv.length===5&&flag==='--approved-helper-sha256'&&hex(pin)&&pin===sha(await readFile(process.argv[1]))){await absent(C.intent);await absent(C.evidence);await exclusive(C.intent,{version:1,scanVersion:2,status:'ONE_READ_ONLY_ORIGINAL_TRANSACTION_SCAN_INTENT',operationId:C.operationId,authorizationFingerprint:C.authorizationFingerprint,startLedger:C.startLedger,endLedgerExclusive:C.endLedger,lowerBoundDerivation:C.lowerBoundDerivation,maximumRequests:C.maximumCalls,maximumPages:C.maximumPages,maximumTransactions:C.maximumTransactions,helperSha256:pin,at:new Date().toISOString(),...zero});const result=await scanOriginalTestnetTransactions();await exclusive(C.evidence,result);console.log(JSON.stringify(result));if(result.status==='UNCONFIRMED_ORIGINAL_TESTNET_TRANSACTION_SCAN')process.exitCode=1;}
 else fail('EXACT_REVIEWED_ORIGINAL_TRANSACTION_SCAN_REQUIRED');
}catch(e){console.log(JSON.stringify({status:'UNCONFIRMED_ORIGINAL_TESTNET_TRANSACTION_SCAN',code:safeCode(e),transactionResubmissionPermitted:false,noMatchProvesNoSubmission:false,...zero}));process.exitCode=1;}
