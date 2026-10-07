import {Keypair,Networks} from '@stellar/stellar-sdk';
import {basicNodeSigner} from '@stellar/stellar-sdk/contract';
import {buyerAccessValid,createBoundedBuyerFetch,createBuyerSpendBudget} from './marketplace-x402-buyer.mjs';
import {originOnly} from './private-mcp-client.mjs';

export const defaultBuyerOrigin='https://bazaar.browns.studio';
const version=1,rpcOrigin='https://soroban-testnet.stellar.org';
function configValid(config){if(config?.version!==version||originOnly(config.origin)!==config.origin||!config.origin.startsWith('https://')||!buyerAccessValid(config.agentAccess)||!Keypair.fromSecret(config.stellarSecret).publicKey()||!Number.isInteger(config.maxSponsoredFeeStroops)||config.maxSponsoredFeeStroops<1||config.maxSponsoredFeeStroops>1000000)throw Error('INVALID_BUYER_CONFIGURATION');return config;}
function budgetValid(state){if(state?.version!==version||typeof state.maximumAtomic!=='string'||!/^[1-9][0-9]{0,19}$/.test(state.maximumAtomic)||!Array.isArray(state.reservations))throw Error('INVALID_SPEND_BUDGET');createBuyerSpendBudget({...state,persistReservations:async()=>{}});return state;}
export function parseBuyerBudget(amount){if(typeof amount!=='string'||!/^(0|[1-9][0-9]{0,12})(\.[0-9]{1,7})?$/.test(amount))throw Error('INVALID_USDC_BUDGET');const [whole,fraction='']=amount.split('.');const atomic=(BigInt(whole)*10000000n+BigInt(fraction.padEnd(7,'0'))).toString();if(atomic==='0')throw Error('INVALID_USDC_BUDGET');return atomic;}

/** The MCP endpoint is stateless; each bounded POST is an explicit JSON-RPC call. */
export function createBuyerMcpTool({origin,agentToken,marketFetch}){
 const endpoint=new URL('/api/mcp',originOnly(origin));if(!buyerAccessValid(agentToken))throw Error('AGENT_ACCESS_REQUIRED');let id=0;
 return async(name,args={})=>{if(!['get_service','list_market_services','create_market_order','get_market_order','list_market_orders','get_operation_history'].includes(name))throw Error('UNSUPPORTED_BUYER_TOOL');const requestId=++id;
  const response=await marketFetch(endpoint,{method:'POST',redirect:'error',headers:{authorization:'Bearer '+agentToken,'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-03-26'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method:'tools/call',params:{name,arguments:args}})});
  if(!response.ok)throw Error('MCP_REQUEST_UNCONFIRMED');let message;try{message=await response.json();}catch{throw Error('MCP_RESPONSE_UNCONFIRMED');}
  if(message.jsonrpc!=='2.0'||message.id!==requestId||message.error||!message.result)throw Error('MCP_RESPONSE_UNCONFIRMED');const result=message.result;let body;
  try{body=result.structuredContent??JSON.parse(result.content.find(item=>item.type==='text').text);}catch{throw Error('MCP_RESPONSE_UNCONFIRMED');}
  if(result.isError){const error=Error('MCP_TOOL_REJECTED');error.publicCode=/^[A-Z][A-Z0-9_]{1,80}$/.test(body.error?.code??body.code??'')?(body.error?.code??body.code):undefined;throw error;}return body;
 };
}

export async function readBuyerMarketHistory(runtime,{limit=10,cursor}={}){
 if(!Number.isInteger(limit)||limit<1||limit>20||cursor!==undefined&&!/^[a-zA-Z0-9_-]{1,2048}$/.test(cursor))throw Error('HISTORY_PAGE_LIMIT');
 return runtime.marketTool('list_market_orders',{limit,...(cursor?{cursor}:{})});
}

export async function configureBuyerRuntime({store,agentAccess,stellarSecret,origin=defaultBuyerOrigin,maxSponsoredFeeStroops=1000000}){
 const config=configValid({version,origin:originOnly(origin),agentAccess,stellarSecret,maxSponsoredFeeStroops});const existing=await store.read('buyer-config');
 if(existing){configValid(existing);const state=budgetValid(await store.journal('buyer-budget').read());if(state.reservations.length&&Keypair.fromSecret(existing.stellarSecret).publicKey()!==Keypair.fromSecret(stellarSecret).publicKey())throw Error('RESERVED_BUDGET_PAYER_CHANGED');}
 else await store.journal('buyer-budget').initialize({version,maximumAtomic:'200000',reservations:[]});
 await store.write('buyer-config',config,{createOnly:!existing});return {origin:config.origin,payer:Keypair.fromSecret(config.stellarSecret).publicKey(),maximumAtomic:(await store.journal('buyer-budget').read()).maximumAtomic};
}
export async function increaseBuyerBudget({store,maximumAtomic}){
 const journal=store.journal('buyer-budget'),previous=budgetValid(await journal.read());if(typeof maximumAtomic!=='string'||!/^[1-9][0-9]{0,19}$/.test(maximumAtomic)||BigInt(maximumAtomic)<=BigInt(previous.maximumAtomic))throw Error('BUDGET_INCREASE_REQUIRED');
 const next=budgetValid({...previous,maximumAtomic});await journal.append(next);return {maximumAtomic,reservedAtomic:next.reservations.reduce((sum,item)=>sum+BigInt(item.amount),0n).toString(),reservations:next.reservations.length};
}

/** Call while holding the buyer store lock. Nothing automatically sends or signs. */
export async function createPortableBuyerRuntime({store,operationId,fetchImpl=fetch}){
 const config=configValid(await store.read('buyer-config')),budgetJournal=store.journal('buyer-budget');let state=budgetValid(await budgetJournal.read());const keypair=Keypair.fromSecret(config.stellarSecret);
 const marketFetch=createBoundedBuyerFetch({origin:config.origin,fetchImpl}),rpcFetch=createBoundedBuyerFetch({origin:rpcOrigin,fetchImpl});
 const budget=createBuyerSpendBudget({maximumAtomic:state.maximumAtomic,reservations:state.reservations,persistReservations:async reservations=>{state={...state,reservations};await budgetJournal.append(state);}});
 const journal=operationId?store.journal('buyer.'+operationId):undefined;
 const options={origin:config.origin,payer:keypair.publicKey(),agentToken:config.agentAccess,maxSponsoredFeeStroops:config.maxSponsoredFeeStroops,rpcUrl:rpcOrigin,marketFetch,rpcFetch,marketTool:createBuyerMcpTool({origin:config.origin,agentToken:config.agentAccess,marketFetch}),signer:{address:keypair.publicKey(),...basicNodeSigner(keypair,Networks.TESTNET)},reserveSpend:value=>budget.reserve(value),journal,persistIntent:value=>journal.append(value),budgetSnapshot:()=>({maximumAtomic:state.maximumAtomic,reservations:budget.snapshot()}),dispose(){keypair._secretKey?.fill(0);delete config.stellarSecret;delete config.agentAccess;}};
 if(operationId){const original=journal.read;let initialOperation;
  journal.read=async()=>{const intent=await original();if(intent.operationId!==operationId||intent.payer!==options.payer||intent.origin!==config.origin)throw Error('JOURNAL_CONFIGURATION_CHANGED');initialOperation=intent.operationId;return intent;};
  const append=journal.append;journal.append=async intent=>{if(!initialOperation)await journal.read();if(intent.operationId!==initialOperation)throw Error('JOURNAL_OPERATION_CONFLICT');await append(intent);};
 }
 return options;
}

export function summarizeBuyerIntent(intent){return {operationId:intent.operationId,phase:intent.phase,payer:intent.payer,cardHash:intent.cardHash,inputHash:intent.inputHash,signed:Boolean(intent.signedPayload||intent.signedAuthorizationTransaction),...(intent.lastFailure?{lastFailure:intent.lastFailure}:{}),...(intent.order?{orderPhase:intent.order.phase,paid:Boolean(intent.order.paymentVerifiedAt),delivered:Boolean(intent.order.delivery),transactionHash:intent.order.transactionHash,...(intent.order.delivery?{delivery:intent.order.delivery}:{}),...(intent.order.failure?{failure:intent.order.failure}:{})}:{})};}
