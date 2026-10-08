import {randomUUID} from 'node:crypto';
import {toolBody} from './private-mcp-client.mjs';
import {assertSellerCard,sellerCanonical as canonical,sellerHash as sha,sellerHttpsOrigin,sellerRoute,SELLER_MARKET_PROTOCOL,SELLER_USDC_IDENTITY} from './seller-service-card.mjs';

export const sellerUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function readSellerJournal(journal){try{return await journal.read();}catch(error){if(error.code==='ENOENT')return undefined;throw error;}}
const phases=['prepared','claim-started','claimed','provider-started','generated','delivery-started','delivery-uncertain','delivered','uncertain-report-started','execution-uncertain','fail-started','delivery-failed'];
export function validateSellerIntent(value){
 if(value?.version!==1||!sellerUuid.test(value.operationId??'')||!sellerUuid.test(value.attemptId??'')||!/^[a-f0-9]{64}$/.test(value.cardHash??'')||!value.serviceId||!value.ownerId||!value.agentId||!phases.includes(value.phase)||sellerHttpsOrigin(value.providerOrigin)!==value.providerOrigin||!sellerRoute(value.providerRoute))throw Error('INVALID_SELLER_INTENT');return value;
}
export function createSellerIntent({operationId,attemptId=randomUUID(),cardHash,serviceId,providerOrigin,providerRoute='/v1/marketplace-text',ownerId,agentId}){return validateSellerIntent({version:1,operationId,attemptId,cardHash,serviceId,providerOrigin:sellerHttpsOrigin(providerOrigin),providerRoute:sellerRoute(providerRoute),ownerId,agentId,phase:'prepared',createdAt:new Date().toISOString()});}
export async function sellerTool(options,name,args={}){
 const result=await options.callTool(name,args);const body=toolBody(result);
 if(result.isError||body.ok===false){const error=Error(body.error?.code??body.code??'MCP_ACTION_REJECTED');error.httpStatus=body.httpStatus??body.http?.status;error.retryAfter=body.http?.retryAfter??body.retryAfter;throw error;}return body;
}
async function persist(intent,options){validateSellerIntent(intent);await options.persistIntent(structuredClone(intent));}
export function bindSellerOrder(intent,order,allowed){
 validateSellerIntent(intent);
 if(!order||order.operationId!==intent.operationId||order.perspective!=='sale'||order.sellerOwnerId!==intent.ownerId)throw Error('WRONG_SELLER_OWNER');
 assertSellerCard(order.card);
 if(order.cardHash!==intent.cardHash||sha(canonical(order.card))!==intent.cardHash||order.card.id!==intent.serviceId||order.serviceId!==intent.serviceId||order.card.url!==intent.providerOrigin||order.card.routeTemplate!==intent.providerRoute||order.amount!==order.card.payment.amount||order.destination!==order.card.payment.destination||canonical(order.settlement)!==canonical(SELLER_USDC_IDENTITY)||order.paymentProtocol!==SELLER_MARKET_PROTOCOL||!order.paymentVerifiedAt||!Number.isFinite(Date.parse(order.paymentVerifiedAt))||!/^[a-f0-9]{64}$/.test(order.transactionHash??'')||!allowed.includes(order.phase)||!order.input||typeof order.input!=='object'||Array.isArray(order.input)||order.inputHash!==sha(canonical(order.input)))throw Error('UNBOUND_OR_UNPAID_ORDER');
 if(order.phase!=='paid'&&(order.attemptId!==intent.attemptId||order.agentId!==intent.agentId))throw Error('CLAIM_CONFLICT');
 const input=order.input;const fields=order.card.input;
 if(Object.keys(input).some(k=>!fields.some(v=>v.name===k))||fields.some(v=>v.required&&!(v.name in input)||v.name in input&&typeof input[v.name]!==v.type)||Object.values(input).some(v=>typeof v==='string'&&v.length>2000||typeof v==='number'&&!Number.isFinite(v)||!['string','number','boolean'].includes(typeof v)))throw Error('INVALID_SERVICE_INPUT');
 const binding={transactionHash:order.transactionHash,inputHash:order.inputHash,input:structuredClone(input),amount:order.amount,destination:order.destination,identity:structuredClone(order.settlement),paymentProtocol:order.paymentProtocol};
 if(intent.binding&&canonical(intent.binding)!==canonical(binding))throw Error('ORDER_CHANGED');return binding;
}
function pageInput({limit=20,cursor}={}){
 if(!Number.isInteger(limit)||limit<1||limit>20||cursor!==undefined&&(typeof cursor!=='string'||!cursor.length||cursor.length>2048))throw Error('INVALID_PAGE_INPUT');
 return {limit,...(cursor?{cursor}:{})};
}
function pageCursor(value,prior){if(value===null||value===undefined)return null;if(typeof value!=='string'||!value.length||value.length>2048||value===prior)throw Error('INVALID_PAGE_CURSOR');return value;}
export async function listSellerOrders(options,page){
 const input=pageInput(page),body=await sellerTool(options,'list_market_orders',input);if(!Array.isArray(body.orders))throw Error('INVALID_ORDER_LIST');
 return {orders:body.orders.filter(v=>v.perspective==='sale'),nextCursor:pageCursor(body.nextCursor,input.cursor)};
}
export async function listSellerServices(options,page){
 const input=pageInput(page),body=await sellerTool(options,'list_market_services',input);if(!Array.isArray(body.services))throw Error('INVALID_SERVICE_LIST');
 return {services:body.services,nextCursor:pageCursor(body.nextCursor,input.cursor)};
}
export async function inspectSellerIntent(intent,options){const {order}=await sellerTool(options,'get_market_order',{operationId:intent.operationId});return {...order,perspective:order?.sellerOwnerId===intent.ownerId?'sale':order?.perspective};}
export async function claimSellerIntent(intent,options){
 validateSellerIntent(intent);
 if(intent.phase==='claimed'){bindSellerOrder(intent,await inspectSellerIntent(intent,options),['executing']);return structuredClone(intent);}
 if(intent.phase!=='prepared')throw Error('EXISTING_INTENT_REQUIRES_RECOVERY');
 intent.binding=bindSellerOrder(intent,await inspectSellerIntent(intent,options),['paid']);intent.phase='claim-started';await persist(intent,options);
 const {order}=await sellerTool(options,'claim_market_order',{operationId:intent.operationId,attemptId:intent.attemptId});bindSellerOrder(intent,{...order,perspective:order?.perspective??'sale'},['executing']);intent.phase='claimed';await persist(intent,options);return structuredClone(intent);
}
/** Read server state against the conserved binding; this never invokes execute(). */
export async function recoverSellerIntent(intent,options){
 validateSellerIntent(intent);const order=await inspectSellerIntent(intent,options);
 const allowed=intent.phase==='prepared'?['paid']:intent.phase==='claim-started'?['paid','executing']:['executing','execution-uncertain','delivered','delivery-failed'];
 bindSellerOrder(intent,order,allowed);
 if(intent.phase==='claim-started')intent.phase=order.phase==='paid'?'prepared':'claimed';
 else if(order.phase==='delivered'){
  if(!intent.text||sha(intent.text)!==intent.textHash||order.delivery?.text!==intent.text||order.delivery?.sha256!==intent.textHash)throw Error('DELIVERY_NOT_FROZEN');intent.phase='delivered';intent.deliveryReference=order.delivery.reference;
 }else if(order.phase==='delivery-failed'){
  if(intent.failureReason!==order.failure)throw Error('FAILURE_CHANGED');intent.phase='delivery-failed';
 }else if(['provider-started','uncertain-report-started','execution-uncertain'].includes(intent.phase)&&order.phase==='execution-uncertain')intent.phase='execution-uncertain';
 await persist(intent,options);return {operationId:intent.operationId,phase:order.phase,localPhase:intent.phase};
}
function textFrozen(intent){if(typeof intent.text!=='string'||!intent.text.length||intent.text.length>2000||intent.textHash!==sha(intent.text))throw Error('DELIVERY_NOT_FROZEN');}
export async function deliverSellerIntent(intent,options){
 validateSellerIntent(intent);if(!['generated','delivery-started','delivery-uncertain','delivered'].includes(intent.phase))throw Error('DELIVERY_NOT_FROZEN');textFrozen(intent);
 // Read binding even on explicit replay; only the original frozen text is sent.
 bindSellerOrder(intent,await inspectSellerIntent(intent,options),['executing','execution-uncertain','delivered']);intent.phase='delivery-started';await persist(intent,options);
 try{const {order}=await sellerTool(options,'deliver_market_order',{operationId:intent.operationId,attemptId:intent.attemptId,text:intent.text});bindSellerOrder(intent,{...order,perspective:order?.perspective??'sale'},['delivered']);if(order.delivery?.text!==intent.text||order.delivery?.sha256!==intent.textHash)throw Error('DELIVERY_CHANGED');intent.phase='delivered';intent.deliveryReference=order.delivery.reference;await persist(intent,options);return order;}
 catch(error){intent.phase='delivery-uncertain';await persist(intent,options);throw error;}
}
export async function uncertainSellerIntent(intent,options,reason='Provider outcome unconfirmed. Do not execute this attempt again.'){
 validateSellerIntent(intent);if(!['provider-started','uncertain-report-started','execution-uncertain'].includes(intent.phase))throw Error('NO_UNCERTAIN_EXECUTION');if(typeof reason!=='string'||!reason.length||reason.length>500)throw Error('REASON_REQUIRED');
 if(intent.uncertaintyReason&&intent.uncertaintyReason!==reason)throw Error('REASON_CHANGED');intent.uncertaintyReason=reason;intent.phase='uncertain-report-started';await persist(intent,options);
 const {order}=await sellerTool(options,'uncertain_market_order',{operationId:intent.operationId,attemptId:intent.attemptId,reason});bindSellerOrder(intent,{...order,perspective:order?.perspective??'sale'},['execution-uncertain']);intent.phase='execution-uncertain';await persist(intent,options);return order;
}
const active=new Set();
/** The caller holds a durable per-operation lock for the entire action. */
export async function executeSellerIntent(intent,options){
 validateSellerIntent(intent);const key=intent.ownerId+':'+intent.operationId;if(active.has(key))throw Error('CONCURRENT_EXECUTION_DENIED');active.add(key);
 try{
  if(intent.phase==='prepared')await claimSellerIntent(intent,options);else if(intent.phase!=='claimed')throw Error('EXISTING_INTENT_REQUIRES_RECOVERY');
  bindSellerOrder(intent,await inspectSellerIntent(intent,options),['executing']);
  if(typeof options.adapter?.execute!=='function')throw Error('ADAPTER_REQUIRED');
  intent.phase='provider-started';await persist(intent,options); // fsync must complete before effect.
  let output;
  try{output=await options.adapter.execute({operationId:intent.operationId,attemptId:intent.attemptId,input:structuredClone(intent.binding.input)});if(typeof output?.text!=='string'||!output.text.length||output.text.length>2000)throw Error('TEXT_LIMIT_2000');}
  catch{try{await uncertainSellerIntent(intent,options);}catch{}throw Error('EXECUTION_UNCERTAIN_DO_NOT_REEXECUTE');}
  // Failure to persist leaves provider-started durable. Never compensate by executing again.
  intent.text=output.text;intent.textHash=sha(output.text);intent.phase='generated';await persist(intent,options);
  return await deliverSellerIntent(intent,options);
 }finally{active.delete(key);}
}
export async function failSellerIntent(intent,options,reason){
 validateSellerIntent(intent);if(typeof reason!=='string'||!reason.length||reason.length>500)throw Error('REASON_REQUIRED');
 if(intent.phase==='prepared')await claimSellerIntent(intent,options);
 if(!['claimed','provider-started','execution-uncertain','fail-started','delivery-failed'].includes(intent.phase))throw Error('INVALID_FAILURE_TRANSITION');
 if(intent.failureReason&&intent.failureReason!==reason)throw Error('FAILURE_CHANGED');
 bindSellerOrder(intent,await inspectSellerIntent(intent,options),['executing','execution-uncertain','delivery-failed']);intent.failureReason=reason;intent.phase='fail-started';await persist(intent,options);
 const {order}=await sellerTool(options,'fail_market_order',{operationId:intent.operationId,attemptId:intent.attemptId,reason});bindSellerOrder(intent,{...order,perspective:order?.perspective??'sale'},['delivery-failed']);if(order.failure!==reason)throw Error('FAILURE_CHANGED');intent.phase='delivery-failed';await persist(intent,options);return order;
}
/** Opt-in bounded polling: at most ten polls, one execution at a time, no retries. */
export async function watchSellerOrders({poll,processOrder,afterPage=async()=>{},polls=10,intervalMs=60000,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!Number.isInteger(polls)||polls<1||polls>10||intervalMs<60000)throw Error('INVALID_WATCH_BOUNDS');const seen=new Set();let executed=0;
 for(let i=0;i<polls;i++){
  let orders;try{orders=await poll();}catch(error){if(error.httpStatus===429)return {polls:i+1,executed,stopped:'quota',retryAfter:error.retryAfter};throw error;}
  for(const order of orders){
   if(order.phase==='execution-uncertain')return {polls:i+1,executed,stopped:'uncertainty'};
   if(order.phase!=='paid'||seen.has(order.operationId))continue;seen.add(order.operationId);
   try{await processOrder(order);executed++;}catch(error){if(error.httpStatus===429)return {polls:i+1,executed,stopped:'quota',retryAfter:error.retryAfter};return {polls:i+1,executed,stopped:'unconfirmed'};}
  }
  await afterPage();
  if(i+1<polls)await sleep(intervalMs);
 }return {polls,executed,stopped:'bound'};
}
