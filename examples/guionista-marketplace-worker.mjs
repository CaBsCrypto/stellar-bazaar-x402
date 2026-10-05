import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,open,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Asset,Networks,StrKey} from '@stellar/stellar-sdk';
import {originOnly,toolBody} from './private-mcp-client.mjs';
import {createProtectedPreviewFetch,withProtectedPrivateMcp} from './protected-preview-client.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const usdcIdentity={kind:'stellar-classic-credit',network:'stellar:testnet',code:'USDC',issuer:'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'};
usdcIdentity.sacContract=new Asset(usdcIdentity.code,usdcIdentity.issuer).contractId(Networks.TESTNET);
function validateIntent(intent){
 if(intent?.version!==2||!uuid.test(intent.operationId??'')||!uuid.test(intent.attemptId??'')||!/^[a-f0-9]{64}$/.test(intent.cardHash??'')||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(intent.serviceId??'')||originOnly(intent.providerOrigin)!==intent.providerOrigin||!intent.providerOrigin.startsWith('https://'))throw Error('INVALID_INTENT');
}
export function createGuionistaIntent({operationId,attemptId=randomUUID(),cardHash,serviceId,providerOrigin}){
 const intent={version:2,operationId,attemptId,cardHash,serviceId,providerOrigin:originOnly(providerOrigin),phase:'prepared',createdAt:new Date().toISOString()};validateIntent(intent);return intent;
}
async function tool(options,name,args){
 const result=await options.callTool(name,args);
 if(result.isError)throw Error('MCP_ACTION_REJECTED');
 return toolBody(result);
}
async function persist(intent,options){validateIntent(intent);await options.persistIntent(structuredClone(intent));}
function boundOrder(intent,order,phases){
 const protocol=order?.paymentProtocol;
 if(protocol!==undefined&&protocol!=='stellar-classic-direct-v1'&&protocol!=='x402-stellar-exact-v2')throw Error('UNSUPPORTED_PAYMENT_PROTOCOL');
 if(protocol==='x402-stellar-exact-v2'&&(order.inputHash!==sha(canonical(order.input))||order.card?.payment.marketplace?.protocol!==protocol||order.card.payment.marketplace.resourceTemplate!=='/api/market/orders/{operationId}/x402'))throw Error('UNBOUND_X402_ORDER');
 if(!order||order.operationId!==intent.operationId||order.cardHash!==intent.cardHash||sha(canonical(order.card))!==intent.cardHash||order.serviceId!==intent.serviceId||order.card?.id!==intent.serviceId||order.card?.routeTemplate!=='/v1/marketplace-text'||new URL(order.card.url).origin!==intent.providerOrigin||order.card.network!=='stellar:testnet'||order.card.payment?.asset!=='USDC'||canonical(order.card.payment.identity)!==canonical(usdcIdentity)||canonical(order.settlement)!==canonical(usdcIdentity)||order.amount!==order.card.payment.amount||order.destination!==order.card.payment.destination||!StrKey.isValidEd25519PublicKey(order.destination??'')||!order.paymentVerifiedAt||!Number.isFinite(Date.parse(order.paymentVerifiedAt))||!/^[a-f0-9]{64}$/.test(order.transactionHash??'')||!phases.includes(order.phase)||!order.input||typeof order.input!=='object'||Array.isArray(order.input))throw Error('UNBOUND_OR_UNPAID_ORDER');
 if(order.phase!=='paid'&&order.attemptId!==intent.attemptId)throw Error('CLAIM_CONFLICT');
 if(intent.binding&&(intent.binding.transactionHash!==order.transactionHash||intent.binding.inputHash!==sha(canonical(order.input))||intent.binding.amount!==order.amount||intent.binding.destination!==order.destination||canonical(intent.binding.identity)!==canonical(order.settlement)||(intent.binding.paymentProtocol??undefined)!==(protocol??undefined)))throw Error('ORDER_CHANGED');
 return order;
}
function freezeClaim(intent,order){
 intent.binding={transactionHash:order.transactionHash,inputHash:sha(canonical(order.input)),input:structuredClone(order.input),amount:order.amount,destination:order.destination,identity:structuredClone(order.settlement),...(order.paymentProtocol?{paymentProtocol:order.paymentProtocol}:{})};
 intent.phase='claimed';
}
export async function inspectGuionistaIntent(intent,options){validateIntent(intent);const body=await tool(options,'list_market_orders',{});return body.orders?.find(order=>order.operationId===intent.operationId);}
async function claim(intent,options){
 if(intent.phase==='claimed'){boundOrder(intent,await inspectGuionistaIntent(intent,options),['executing']);return;}
 if(intent.phase!=='prepared')throw Error('EXISTING_INTENT_REQUIRES_EXPLICIT_RECOVERY');
 boundOrder(intent,await inspectGuionistaIntent(intent,options),['paid']);
 intent.phase='claim-started';await persist(intent,options);
 const {order}=await tool(options,'claim_market_order',{operationId:intent.operationId,attemptId:intent.attemptId});
 freezeClaim(intent,boundOrder(intent,order,['executing']));await persist(intent,options);
}
/** Read recovery only: provider execution is never resumed from a started attempt. */
export async function recoverGuionistaClaim(intent,options){
 validateIntent(intent);if(intent.phase!=='claim-started')throw Error('NOT_A_LOST_CLAIM');
 const order=boundOrder(intent,await inspectGuionistaIntent(intent,options),['paid','executing']);
 if(order.phase==='paid')intent.phase='prepared';else freezeClaim(intent,order);
 await persist(intent,options);return structuredClone(intent);
}
export async function markGuionistaUncertain(intent,options,reason='Provider response lost; preserve the original attempt.'){
 validateIntent(intent);
 if(!['provider-started','execution-uncertain','uncertain-report-started'].includes(intent.phase))throw Error('NO_UNCERTAIN_EXECUTION');
 intent.phase='uncertain-report-started';await persist(intent,options);
 const {order}=await tool(options,'uncertain_market_order',{operationId:intent.operationId,attemptId:intent.attemptId,reason});
 boundOrder(intent,order,['execution-uncertain']);intent.phase='execution-uncertain';await persist(intent,options);return order;
}
/** One provider request, only after a durable claim of a verified paid order. */
async function executeOnce(intent,options){
 validateIntent(intent);await claim(intent,options);
 if(!/^[A-Za-z0-9_-]{43}$/.test(options.providerToken??''))throw Error('PROVIDER_ACCESS_REQUIRED');
 intent.phase='provider-started';await persist(intent,options);
 let output;
 try{
  const response=await options.providerFetch(new URL('/v1/marketplace-text',intent.providerOrigin),{method:'POST',headers:{authorization:'Bearer '+options.providerToken,'content-type':'application/json'},body:JSON.stringify({operationId:intent.operationId,attemptId:intent.attemptId,input:intent.binding.input}),redirect:'error'});
  if(!response.ok)throw Error('PROVIDER_RESULT_UNCONFIRMED');
  const parts=[];let bytes=0;if(response.body){for await(const part of response.body){bytes+=part.length;if(bytes>16384)throw Error('PROVIDER_RESULT_TOO_LARGE');parts.push(part);}}output=JSON.parse(Buffer.concat(parts).toString('utf8'));
  if(output.ok!==true||output.operationId!==intent.operationId||output.attemptId!==intent.attemptId||output.engine!=='algorithmic'||output.contentType!=='text/plain'||typeof output.text!=='string'||!output.text.length||output.text.length>2000||output.textHash!==sha(output.text))throw Error('PROVIDER_RESULT_CHANGED');
  intent.text=output.text;intent.textHash=output.textHash;intent.phase='generated';await persist(intent,options);
 }catch{
  // This is evidence preservation, not another provider or payment attempt.
  try{await markGuionistaUncertain(intent,options);}catch{}
  throw Error('EXECUTION_UNCERTAIN_DO_NOT_REEXECUTE');
 }
 return deliverGuionistaIntent(intent,options);
}
const activeExecutions=new Set();
export async function executeGuionistaIntent(intent,options){
 validateIntent(intent);const key=intent.providerOrigin+':'+intent.operationId;
 if(activeExecutions.has(key))throw Error('CONCURRENT_EXECUTION_DENIED');
 activeExecutions.add(key);try{return await executeOnce(intent,options);}finally{activeExecutions.delete(key);}
}
/** Explicit re-send of the frozen delivery is safe; it never invokes the provider. */
export async function deliverGuionistaIntent(intent,options){
 validateIntent(intent);
 if(!['generated','delivery-started','delivery-uncertain','delivered'].includes(intent.phase)||typeof intent.text!=='string'||!intent.text.length||intent.text.length>2000||intent.textHash!==sha(intent.text))throw Error('DELIVERY_NOT_FROZEN');
 intent.phase='delivery-started';await persist(intent,options);
 try{
  const {order}=await tool(options,'deliver_market_order',{operationId:intent.operationId,attemptId:intent.attemptId,text:intent.text});
  boundOrder(intent,order,['delivered']);if(order.delivery?.text!==intent.text||order.delivery?.sha256!==intent.textHash)throw Error('DELIVERY_CHANGED');
  intent.phase='delivered';intent.deliveryReference=order.delivery.reference;await persist(intent,options);return order;
 }catch(error){intent.phase='delivery-uncertain';await persist(intent,options);throw error;}
}
/** A second acceptance order may explicitly record failure, without generation. */
export async function failGuionistaIntent(intent,options,reason){
 validateIntent(intent);if(typeof reason!=='string'||!reason.length||reason.length>500)throw Error('FAILURE_REASON_REQUIRED');
 if(['prepared','claimed'].includes(intent.phase))await claim(intent,options);
 if(!['claimed','execution-uncertain','fail-started'].includes(intent.phase))throw Error('INVALID_FAILURE_TRANSITION');
 if(intent.failureReason!==undefined&&intent.failureReason!==reason)throw Error('FAILURE_CHANGED');
 intent.failureReason=reason;intent.phase='fail-started';await persist(intent,options);
 const {order}=await tool(options,'fail_market_order',{operationId:intent.operationId,attemptId:intent.attemptId,reason});
 boundOrder(intent,order,['delivery-failed']);if(order.failure!==reason)throw Error('FAILURE_CHANGED');
 intent.phase='delivery-failed';await persist(intent,options);return order;
}

async function readIntent(path){const raw=await readFile(path,'utf8');if(Buffer.byteLength(raw)>262144)throw Error('JOURNAL_TOO_LARGE');return JSON.parse(raw.trim().split('\n').at(-1));}
async function appendIntent(path,intent){const file=await open(path,'a',0o600);try{await file.writeFile(JSON.stringify(intent)+'\n');await file.sync();}finally{await file.close();}}
async function main(){
 const [command,path,operationId,cardHash,serviceId,providerOrigin]=process.argv.slice(2);
 if(command==='prepare'){
  const intent=createGuionistaIntent({operationId,cardHash,serviceId,providerOrigin});await writeFile(path,JSON.stringify(intent)+'\n',{flag:'wx',mode:0o600});console.log('Saved intent; no payment or provider request.');return;
 }
 if(!['inspect','execute','deliver','fail','recover-claim','report-uncertain'].includes(command)||!path)throw Error('INVALID_COMMAND');
 const intent=await readIntent(path);validateIntent(intent);
 const marketplace=originOnly(process.env.BAZAAR_ORIGIN??'');
 const common={cliPath:process.env.BAZAAR_VERCEL_CLI,authFile:process.env.BAZAAR_VERCEL_AUTH_FILE};
 if(!common.cliPath||!common.authFile)throw Error('PROTECTED_TRANSPORT_CONFIGURATION_REQUIRED');
 const lock=command==='inspect'?undefined:await open(path+'.lock','wx',0o600);
 try{
 if(lock){await lock.writeFile(JSON.stringify({operationId:intent.operationId,attemptId:intent.attemptId,command})+'\n');await lock.sync();}
 const mcpFetch=await createProtectedPreviewFetch({...common,origin:marketplace}),providerFetch=await createProtectedPreviewFetch({...common,origin:intent.providerOrigin});
 await withProtectedPrivateMcp(marketplace,process.env.BAZAAR_AGENT_ACCESS,mcpFetch,async client=>{
  const options={persistIntent:value=>appendIntent(path,value),callTool:(name,args)=>client.callTool({name,arguments:args},undefined,{timeout:12000}),providerFetch,providerToken:process.env.BAZAAR_PROVIDER_WORKER_ACCESS};
  if(command==='inspect'){const order=await inspectGuionistaIntent(intent,options);console.log(JSON.stringify({operationId:intent.operationId,phase:order?.phase??'not-found',paymentVerified:Boolean(order?.paymentVerifiedAt),localPhase:intent.phase}));return;}
  const result=command==='execute'?await executeGuionistaIntent(intent,options):command==='deliver'?await deliverGuionistaIntent(intent,options):command==='fail'?await failGuionistaIntent(intent,options,operationId):command==='recover-claim'?await recoverGuionistaClaim(intent,options):await markGuionistaUncertain(intent,options);
  console.log(JSON.stringify({operationId:intent.operationId,phase:result.phase,localPhase:intent.phase}));
 });
 }finally{if(lock){await lock.close();await unlink(path+'.lock');}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Outcome unconfirmed. Preserve this intent and use explicit read recovery; do not pay or run the provider again.');process.exitCode=1;});
