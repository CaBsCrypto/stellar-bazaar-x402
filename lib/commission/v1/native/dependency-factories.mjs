// Server-only ports. Importing constructs no clients, scopes, credentials or IO.
import {assertPolicy,hashPolicy,PROFILE} from '../policy-router/fee-split-policy-v1.mjs';
import {expectedFunc,digest} from '../channels-adapter/adapter.mjs';
import {createRedisSplitJournal} from '../channels-adapter/redis-journal.mjs';
import {createChannelsTransport} from '../channels-adapter/channels-transport.mjs';
import {createTestnetRpcReader} from '../rpc-reader/reader.mjs';
import {createBoundContractContext} from './contract-context.mjs';
import {createUnsignedChallengePreparer} from './unsigned-challenge.mjs';
const need=(ok,code)=>{if(!ok)throw Error(code);};
/** Wiring ports cannot turn hosted func/auth into a fee-bounded authority. */
export function createManagedChannelsFinancialAuthority(){return Object.freeze({async readiness(){return {ready:false,evidenceMode:'production-disabled',enforcedBeforeDispatch:false,maximumFeeStroops:'100000',blockers:['PROVIDER_FEE_BOUND_NOT_ENFORCED']};},async authorize(){throw Error('PROVIDER_FEE_BOUND_NOT_ENFORCED');}});}
export function createNativeSplitDependencyFactories({redis,namespace,adapterAuthorization,fetcher,now=Date.now}={}){
 need(/^bazaar:split:v1:pilot:[a-f0-9]{32}$/.test(namespace??'')&&redis&&typeof redis.get==='function'&&typeof redis.eval==='function','NATIVE_SPLIT_DEPENDENCY_NAMESPACE_REQUIRED');
 const financialAuthority=createManagedChannelsFinancialAuthority();
 const publicKeys=['sourceDigest','network','router','routerCodeHash','operationId','policyHash','purpose'];
 const publicPart=d=>Object.fromEntries(publicKeys.map(k=>[k,d[k]]));
 function bound(capability,purpose){need(capability&&adapterAuthorization,'NATIVE_SPLIT_PREORDER_CONTEXT_NOT_FUNDED');return adapterAuthorization.describe(capability,purpose);}
 function ports(capability){const d=bound(capability,'contract-context'),serverBinding=Object.freeze({sourceDigest:d.sourceDigest,network:d.network,router:d.router,routerCodeHash:d.routerCodeHash}),callbacks={serverBinding,fetcher,now,authorizeRpcRequest:adapterAuthorization.authorizeRpcRequest,assertBinding:adapterAuthorization.assertBinding};return {context:createBoundContractContext(callbacks),challenge:createUnsignedChallengePreparer({...callbacks,sourceAccountForBinding:adapterAuthorization.sourceAccountForBinding})};}
 const journal=({capability}={})=>{bound(capability,'journal');return createRedisSplitJournal({enabled:true,redis,namespace,nativeStoragePrefix:'bazaar-market:pilot-'+namespace.slice('bazaar:split:v1:pilot:'.length)+':split:v1:journal:',authorizeWrite:input=>adapterAuthorization.journalWriteGuard(capability,input),readRecord:input=>adapterAuthorization.journalRead(capability,input.key,input.action)});};
 async function context({capability,policy,order}={}){const d=bound(capability,'contract-context');assertPolicy(policy??order?.policy);need(hashPolicy(policy??order.policy)===d.policyHash,'NATIVE_SPLIT_POLICY_CHANGED');return ports(capability).context({capability,policy:policy??order.policy});}
 async function prepareChallenge(policy,{capability}={}){const p=ports(capability),c=await p.context({capability,policy});assertPolicy(policy,{nowSeconds:c.nowSeconds});const packet=await p.challenge({capability,policy,context:c});need(packet&&Object.keys(packet).sort().join(',')==='auth,func'&&packet.func===expectedFunc(policy)&&Array.isArray(packet.auth)&&packet.auth.length===1&&typeof packet.auth[0]==='string'&&packet.auth[0].length<=32000,'SPLIT_CHALLENGE_INVALID');return packet;}
 async function rpcForOrder({capability,order,packet,transactionHash=null}={}){
  const d=bound(capability,'transaction');assertPolicy(order?.policy);need(order.operationId===d.operationId&&order.revision===d.revision&&hashPolicy(order.policy)===d.policyHash&&digest(packet)===d.packetHash,'NATIVE_SPLIT_RPC_BINDING_REQUIRED');
  await adapterAuthorization.assertBinding(capability,publicPart(d));
  const scope={version:'bazaar.rpc-read-authorization/v1',profile:PROFILE,operationId:d.operationId,policyHash:d.policyHash,packetHash:d.packetHash,transactionHash,router:d.router,routerCodeHash:d.routerCodeHash,expiresAtMs:d.expiresAtMs,scopes:['rpc:transaction','rpc:recovery']};
  const reader=createTestnetRpcReader({enabled:true,fetcher,scope,now,timeoutMs:5000,admit:async request=>{need(request.rpcMethod==='getTransaction','NATIVE_SPLIT_RPC_METHOD');await adapterAuthorization.authorizeRpcRequest(capability,{...publicPart(d),endpoint:request.endpoint,method:request.method,rpcMethod:request.rpcMethod,maximumAttempts:1,outboundBytes:request.outboundBytes,maximumInboundBytes:request.maximumInboundBytes,maximumHeaderBytes:16384,timeoutMs:5000});return true;}});
  return Object.freeze({async transaction(hash){const result=await reader.transaction(hash);await adapterAuthorization.assertBinding(capability,publicPart(d));return result;}});
 }
 return Object.freeze({financialAuthority,journal,rpcForOrder,context,prepareChallenge,transport:()=>createChannelsTransport({enabled:false}),readiness:()=>({productionFinancialReady:false,writeReady:false,journalReadAvailable:Boolean(adapterAuthorization),rpcBudgetAdapterConfigured:Boolean(adapterAuthorization),routerContextAdapterConfigured:Boolean(adapterAuthorization),challengeAdapterConfigured:Boolean(adapterAuthorization),providerFeeBoundEnforced:false})});
}
