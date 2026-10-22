/** Server-only preparation ports. Importing this module performs no IO. */
import {createHash} from 'node:crypto';
import {Address,Networks,StrKey,TransactionBuilder,xdr} from '@stellar/stellar-sdk';
import {assertPolicy,hashPolicy,canonicalJson} from '../policy-router/fee-split-policy-v1.mjs';
import {expectedFunc} from '../channels-adapter/adapter.mjs';
import {TESTNET_RPC,routerLedgerKeys,decodePinnedRouterEntries} from '../rpc-reader/reader.mjs';

export const PREPARATION_RPC_BOUNDS=Object.freeze({maximumAttempts:1,maximumRequestBytes:32768,maximumResponseBytes:524288,maximumHeaderBytes:16384,timeoutMs:5000});
const proofs=new WeakMap();
const need=(ok,code)=>{if(!ok)throw Error(code);};
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uint=v=>Number.isSafeInteger(v)&&v>0&&v<=0xffffffff;
const sha=v=>createHash('sha256').update(v).digest('hex');
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);

export function pinPreparationServerBinding(value){
 need(value&&Object.keys(value).sort().join('|')==='network|router|routerCodeHash|sourceDigest'&&value.network==='stellar:testnet'&&hex(value.sourceDigest)&&hex(value.routerCodeHash)&&typeof value.router==='string'&&StrKey.isValidContract(value.router),'NATIVE_PREPARATION_SERVER_BINDING_REQUIRED');
 return Object.freeze(structuredClone(value));
}
function policyBinding(server,policy,purpose){
 assertPolicy(policy);need(policy.router===server.router&&policy.routerCodeHash===server.routerCodeHash,'NATIVE_PREPARATION_ROUTER_MISMATCH');
 need(!['31c97193-be74-4b9d-b0a3-f3890b0a41e8','ed6c4530-e76f-49e0-8f39-5ec8578820e2'].includes(policy.operationId),'NATIVE_PREPARATION_OPERATION_EXCLUDED');
 return Object.freeze({...server,operationId:policy.operationId,policyHash:hashPolicy(policy),purpose});
}
function raceAbort(promise,signal){
 return new Promise((resolve,reject)=>{
  const fail=()=>reject(Error('NATIVE_PREPARATION_RPC_TIMEOUT'));
  if(signal.aborted){fail();return;}signal.addEventListener('abort',fail,{once:true});
  Promise.resolve(promise).then(v=>{signal.removeEventListener('abort',fail);if(signal.aborted){try{void v?.body?.cancel().catch(()=>{});}catch{/* response may already be locked */}fail();return;}resolve(v);},()=>{signal.removeEventListener('abort',fail);reject(Error('NATIVE_PREPARATION_RPC_TRANSPORT'));});
 });
}
async function boundedJson(response,signal){
 need(response?.ok===true&&response.redirected!==true&&(!response.url||response.url===TESTNET_RPC)&&response.body,'NATIVE_PREPARATION_RPC_HTTP');
 let headerBytes=0;for(const [k,v]of response.headers)headerBytes+=Buffer.byteLength(k+': '+v+'\r\n');
 need(headerBytes<=PREPARATION_RPC_BOUNDS.maximumHeaderBytes,'NATIVE_PREPARATION_RPC_HEADERS');
 need(response.headers.get('content-type')?.split(';')[0].trim()==='application/json','NATIVE_PREPARATION_RPC_CONTENT_TYPE');
 const declared=response.headers.get('content-length');need(declared===null||(/^\d+$/.test(declared)&&Number(declared)<=PREPARATION_RPC_BOUNDS.maximumResponseBytes),'NATIVE_PREPARATION_RPC_BOUND');
 const reader=response.body.getReader(),parts=[];let bytes=headerBytes;
 try{for(;;){const item=await raceAbort(reader.read(),signal);if(item.done)break;need(item.value instanceof Uint8Array,'NATIVE_PREPARATION_RPC_BODY');bytes+=item.value.byteLength;need(bytes<=PREPARATION_RPC_BOUNDS.maximumResponseBytes,'NATIVE_PREPARATION_RPC_BOUND');parts.push(Buffer.from(item.value));}}
 catch(e){void reader.cancel().catch(()=>{});throw e;}finally{try{reader.releaseLock();}catch{/* cancellation may still be pending */}}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw Error('NATIVE_PREPARATION_RPC_JSON');}
}

/** The callbacks must be closures over native request admission. No JSON field,
 * environment flag, boolean receipt or remote response can create that authority. */
export function createBoundPreparationRpc({serverBinding,capability,policy,purpose,fetcher,authorizeRpcRequest,assertBinding,now=Date.now}={}){
 const server=pinPreparationServerBinding(serverBinding),p=Object.freeze(structuredClone(policy)),binding=policyBinding(server,p,purpose);
 need(['contract-context','unsigned-challenge'].includes(purpose)&&capability&&typeof capability==='object'&&typeof fetcher==='function'&&typeof authorizeRpcRequest==='function'&&typeof assertBinding==='function'&&typeof now==='function','NATIVE_PREPARATION_DEPENDENCIES_REQUIRED');
 const used=new Set();const maximum=purpose==='contract-context'?3:2;
 async function current(){assertPolicy(p,{nowSeconds:Math.floor(now()/1000)});await assertBinding(capability,binding);}
 return Object.freeze({binding,async assertCurrent(){await current();},async request(method,params){
  const allowed=purpose==='contract-context'?['getNetwork','getLatestLedger','getLedgerEntries']:['getLedgerEntries','simulateTransaction'];
  need(allowed.includes(method)&&!used.has(method)&&used.size<maximum,'NATIVE_PREPARATION_RPC_METHOD_OR_REPLAY');
  need(params&&Object.getPrototypeOf(params)===Object.prototype,'NATIVE_PREPARATION_RPC_PARAMS');
  if(method==='getNetwork'||method==='getLatestLedger')need(Object.keys(params).length===0,'NATIVE_PREPARATION_RPC_PARAMS');
  if(method==='getLedgerEntries'){
   need(Object.keys(params).sort().join('|')==='keys|xdrFormat'&&params.xdrFormat==='base64'&&Array.isArray(params.keys)&&params.keys.length===(purpose==='contract-context'?2:1)&&params.keys.every(k=>typeof k==='string'&&k.length<=1024),'NATIVE_PREPARATION_RPC_PARAMS');
   const expected=purpose==='contract-context'?routerLedgerKeys(server.router,server.routerCodeHash):[xdr.LedgerKey.account(new xdr.LedgerKeyAccount({accountId:new Address(p.payer).toScAddress().accountId()})).toXDR('base64')];
   need(same(params.keys,expected),'NATIVE_PREPARATION_RPC_KEYS_OUTSIDE_BINDING');
  }
  if(method==='simulateTransaction'){
   need(Object.keys(params).sort().join('|')==='authMode|transaction|xdrFormat'&&params.authMode==='record'&&params.xdrFormat==='base64'&&typeof params.transaction==='string'&&params.transaction.length<=24000,'NATIVE_PREPARATION_RPC_PARAMS');
   let tx;try{tx=TransactionBuilder.fromXDR(params.transaction,Networks.TESTNET);}catch{throw Error('NATIVE_PREPARATION_SIMULATION_TRANSACTION');}
   need(tx.toXDR()===params.transaction&&tx.source===p.payer&&tx.signatures.length===0&&tx.fee==='100'&&tx.operations.length===1&&tx.operations[0].type==='invokeHostFunction'&&tx.operations[0].func.toXDR('base64')===expectedFunc(p)&&tx.operations[0].auth?.length===0&&tx.timeBounds?.minTime==='0'&&tx.timeBounds?.maxTime===String(p.expiresAt),'NATIVE_PREPARATION_SIMULATION_TRANSACTION');
  }
  const body=JSON.stringify({jsonrpc:'2.0',id:1,method,params:structuredClone(params)}),outboundBytes=Buffer.byteLength(body)+256;
  need(outboundBytes<=PREPARATION_RPC_BOUNDS.maximumRequestBytes,'NATIVE_PREPARATION_RPC_REQUEST_BOUND');
  used.add(method); // A denied or uncertain attempt is never retried by this port.
  await current();
  const descriptor=Object.freeze({...binding,endpoint:TESTNET_RPC,method:'POST',rpcMethod:method,maximumAttempts:1,outboundBytes,maximumInboundBytes:PREPARATION_RPC_BOUNDS.maximumResponseBytes,maximumHeaderBytes:PREPARATION_RPC_BOUNDS.maximumHeaderBytes,timeoutMs:PREPARATION_RPC_BOUNDS.timeoutMs});
  await authorizeRpcRequest(capability,descriptor);await current();
  const signal=AbortSignal.timeout(PREPARATION_RPC_BOUNDS.timeoutMs);
  const response=await raceAbort(fetcher(TESTNET_RPC,{method:'POST',body,headers:{'content-type':'application/json',accept:'application/json'},redirect:'error',credentials:'omit',cache:'no-store',signal}),signal);
  const result=await boundedJson(response,signal);await current();
  need(result&&Object.getPrototypeOf(result)===Object.prototype&&result.jsonrpc==='2.0'&&result.id===1&&!Object.hasOwn(result,'error')&&result.result&&Object.getPrototypeOf(result.result)===Object.prototype,'NATIVE_PREPARATION_RPC_RESULT');
  return result.result;
 }});
}

export function assertVerifiedContractContext(context,{serverBinding,capability,policy,now=Date.now}={}){
 const server=pinPreparationServerBinding(serverBinding),proof=context&&proofs.get(context),at=now();
 need(proof&&proof.capability===capability&&same(proof.server,server)&&proof.policyHash===hashPolicy(policy)&&Number.isSafeInteger(at)&&proof.expiresAtMs>at,'NATIVE_VERIFIED_CONTEXT_REQUIRED');
 assertPolicy(policy,{nowSeconds:Math.floor(at/1000)});return context;
}

export function createBoundContractContext({serverBinding,fetcher,authorizeRpcRequest,assertBinding,now=Date.now}={}){
 const server=pinPreparationServerBinding(serverBinding);
 return async function readVerifiedContext({capability,policy}={}){
  const p=Object.freeze(structuredClone(policy));const start=now();
  const rpc=createBoundPreparationRpc({serverBinding:server,capability,policy:p,purpose:'contract-context',fetcher,authorizeRpcRequest,assertBinding,now});
  const network=await rpc.request('getNetwork',{});need(network.passphrase===Networks.TESTNET&&uint(network.protocolVersion),'NATIVE_PREPARATION_NETWORK_MISMATCH');
  const latest=await rpc.request('getLatestLedger',{});need(hex(latest.id)&&uint(latest.sequence)&&uint(latest.protocolVersion)&&latest.protocolVersion===network.protocolVersion,'NATIVE_PREPARATION_LEDGER_INVALID');
  const entries=await rpc.request('getLedgerEntries',{keys:routerLedgerKeys(server.router,server.routerCodeHash),xdrFormat:'base64'});
  const pin=decodePinnedRouterEntries(entries,server);
  need(pin.ledger>=latest.sequence&&pin.ledger<=latest.sequence+3&&now()-start>=0&&now()-start<=15000,'NATIVE_PREPARATION_CONTEXT_STALE');await rpc.assertCurrent();
  const observedAtMs=now(),context=Object.freeze({router:server.router,routerCodeHash:server.routerCodeHash,currentLedger:pin.ledger,nowSeconds:Math.floor(observedAtMs/1000),network:'stellar:testnet',networkIdHash:sha(Networks.TESTNET),sourceDigest:server.sourceDigest,observedAtMs,expiresAtMs:Math.min(observedAtMs+30000,p.expiresAt*1000),instanceAndCodeRead:true,wasmBytesHashVerified:true,consensusProofVerified:false,financialAuthority:false});
  proofs.set(context,{server,capability,policyHash:hashPolicy(p),expiresAtMs:context.expiresAtMs});return context;
 };
}
