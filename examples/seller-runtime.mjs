import {timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sellerCanonical,sellerHash,sellerRoute} from './seller-service-card.mjs';
import {sellerUuid,readSellerJournal} from './seller-marketplace-worker.mjs';

const response=(status,body)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
function authorized(request,token){const candidate=/^Bearer ([a-zA-Z0-9_-]{43})$/.exec(request.headers.get('authorization')??'')?.[1];return candidate&&timingSafeEqual(Buffer.from(candidate),Buffer.from(token));}
async function inputBody(request){const reader=request.body?.getReader();if(!reader)throw Error('INVALID_REQUEST');let bytes=0;const parts=[];try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>16384){await reader.cancel();throw Error('REQUEST_TOO_LARGE');}parts.push(value);}}finally{reader.releaseLock();}return JSON.parse(Buffer.concat(parts).toString('utf8'));}
/** Wrap your existing trusted adapter execute({operationId,attemptId,input}) => {text}. */
export function createSellerRuntime({adapter,store,providerAccess,route='/v1/marketplace-text',maxRequests=100}){
 if(typeof adapter?.execute!=='function'||!store?.journal||!store?.acquireLock||!/^[a-zA-Z0-9_-]{43}$/.test(providerAccess??'')||!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>1000)throw Error('RUNTIME_CONFIGURATION_REQUIRED');sellerRoute(route);let requests=0;
 return async request=>{
  if(new URL(request.url).pathname!==route||request.method!=='POST')return response(404,{error:'NOT_FOUND'});
  if(!authorized(request,providerAccess))return response(401,{error:'UNAUTHORIZED'});
  if(++requests>maxRequests)return response(429,{error:'RUNTIME_QUOTA',retryAfter:60});
  let packet;try{packet=await inputBody(request);}catch{return response(400,{error:'INVALID_REQUEST'});}
  if(!sellerUuid.test(packet?.operationId??'')||!sellerUuid.test(packet?.attemptId??'')||!packet.input||typeof packet.input!=='object'||Array.isArray(packet.input)||Object.keys(packet).sort().join(',')!=='attemptId,input,operationId'||Object.values(packet.input).some(v=>!['string','number','boolean'].includes(typeof v)||typeof v==='string'&&v.length>2000||typeof v==='number'&&!Number.isFinite(v)))return response(400,{error:'INVALID_REQUEST'});
  const name='runtime.'+packet.operationId;let release;
  try{
   release=await store.acquireLock(name);const journal=store.journal(name);let record=await readSellerJournal(journal);const inputHash=sellerHash(sellerCanonical(packet.input));
   if(record){
    if(record.attemptId!==packet.attemptId||record.inputHash!==inputHash)return response(409,{error:'OPERATION_CONFLICT'});
    if(record.phase!=='generated')return response(409,{error:'EXECUTION_UNCERTAIN_DO_NOT_REEXECUTE'});
    if(record.textHash!==sellerHash(record.text))throw Error('CORRUPT_RESULT');
   }else{
    record={version:1,operationId:packet.operationId,attemptId:packet.attemptId,inputHash,phase:'provider-started'};
    await journal.initialize(record); // fsync before the adapter can create an effect.
    let result;try{result=await adapter.execute(structuredClone(packet));if(typeof result?.text!=='string'||!result.text.length||result.text.length>2000)throw Error('TEXT_LIMIT_2000');}catch{return response(409,{error:'EXECUTION_UNCERTAIN_DO_NOT_REEXECUTE'});}
    record={...record,phase:'generated',text:result.text,textHash:sellerHash(result.text)};await journal.append(record);
   }
   return response(200,{ok:true,operationId:record.operationId,attemptId:record.attemptId,contentType:'text/plain',text:record.text,textHash:record.textHash});
  }catch{return response(409,{error:'RUNTIME_STATE_UNCONFIRMED'});}finally{if(release)await release();}
 };
}

async function main(){
 const [directory,adapterPath,portText='8787']=process.argv.slice(2);const port=Number(portText);if(!directory||!adapterPath||!Number.isInteger(port)||port<1024||port>65535)throw Error('Use: seller-runtime.mjs <encrypted-store> <trusted-adapter.mjs> [port]');
 const {openPortableSecretStore}=await import('./buyer-portable-secret-store.mjs');const {readPrivateInput}=await import('./buyer-private-input.mjs');
 const password=await readPrivateInput({prompt:'Store password: '});const store=await openPortableSecretStore({directory,password});password.fill(0);
 const config=await store.read('seller-config');if(!config?.providerAccess)throw Error('SELLER_SETUP_REQUIRED');
 const adapter=await import(pathToFileURL(resolve(adapterPath)).href);const handler=createSellerRuntime({adapter,store,providerAccess:config.providerAccess,route:config.card.routeTemplate});
 const server=createServer(async(req,res)=>{try{const body=req.method==='POST'?req:undefined;const incoming=new Request('http://127.0.0.1:'+port+req.url,{method:req.method,headers:req.headers,...(body?{body,duplex:'half'}:{})});const output=await handler(incoming);res.writeHead(output.status,Object.fromEntries(output.headers));res.end(Buffer.from(await output.arrayBuffer()));}catch{res.writeHead(500);res.end();}});
 server.listen(port,'127.0.0.1',()=>console.log('Seller runtime listening on loopback. Participant supplies HTTPS reverse proxy and scheduler.'));
 const close=()=>server.close(()=>{store.dispose();process.exit(0);});process.once('SIGINT',close);process.once('SIGTERM',close);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Runtime not started. Preserve encrypted state and configuration.');process.exitCode=1;});
