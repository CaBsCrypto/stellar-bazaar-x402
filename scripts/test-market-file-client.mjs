import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {freezeSellerFileDelivery,prepareSellerFileDelivery,uploadSellerFileOnce,confirmSellerFileDelivery,retryMissingSellerFileDelivery,deliverSellerFileReceipt} from '../examples/market-file-delivery.mjs';

const bytes=Buffer.from('synthetic private media bytes'),operationId=randomUUID(),attemptId=randomUUID(),origin='https://synthetic.r2.cloudflarestorage.com';
const sha=value=>createHash('sha256').update(value).digest('hex'),saved=[],calls=[];
let object=false,lost=false,puts=0,receipt,confirmed=false,outage=false;
const intent=await freezeSellerFileDelivery({operationId,attemptId,files:[{path:'synthetic.png',name:'synthetic.png',mediaType:'image/png'}]},{readFile:async()=>bytes});
const fileId=intent.files[0].id;
let delivery={mode:'bazaar',versionId:intent.versionId,attemptId,manifestHash:intent.manifestHash,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),files:intent.files.map(({path,...metadata})=>({...metadata,status:'pending'}))};
const options={readFile:async()=>bytes,persistIntent:async value=>saved.push(structuredClone(value)),allowedUploadOrigins:[origin],callTool:async(name,args)=>{
 calls.push({name,args});let body;
 assert.equal(args.operationId,operationId);assert.ok(!JSON.stringify(args).includes('synthetic.png\\'));
 if(name==='prepare_market_delivery'){
  assert.equal(args.versionId,intent.versionId);assert.equal(args.attemptId,attemptId);assert.equal(args.files[0].sha256,sha(bytes));assert.equal('path' in args.files[0],false);
  body={delivery,uploads:confirmed?[]:[{fileId,url:origin+'/private?synthetic-signature=1',expiresAt:new Date(Date.now()+600000).toISOString(),headers:{'content-type':'image/png','content-length':String(bytes.length),'x-amz-checksum-sha256':Buffer.from(sha(bytes),'hex').toString('base64'),'if-none-match':'*'}}]};
 }else if(name==='confirm_market_delivery'){
  assert.equal(args.fileId,fileId);if(outage)return {isError:true,content:[{type:'text',text:JSON.stringify({error:{code:'WORKSPACE_UNAVAILABLE'},httpStatus:503})}]};
  if(!object)return {isError:true,content:[{type:'text',text:JSON.stringify({error:{code:'FILE_NOT_UPLOADED'},httpStatus:409})}]};
  confirmed=true;delivery={...delivery,files:delivery.files.map(file=>({...file,status:'available'}))};body={delivery,integrity:'stored-bytes-verified'};
 }else{
  assert.equal(name,'deliver_market_order');assert.equal(args.manifestHash,intent.manifestHash);assert.equal(saved.at(-1).phase,'delivery-started');receipt=args.text;body={order:{phase:'delivered',fileDelivery:delivery,delivery:{text:receipt,sha256:sha(receipt)}}};
 }
 return {content:[{type:'text',text:JSON.stringify(body)}]};
},fetch:async(url,init)=>{
 puts++;assert.equal(new URL(url).origin,origin);assert.equal(init.method,'PUT');assert.equal(init.redirect,'error');assert.equal(new Headers(init.headers).has('authorization'),false);assert.equal(saved.at(-1).phase,'upload-started');assert.deepEqual(Buffer.from(init.body),bytes);assert.equal(new Headers(init.headers).get('if-none-match'),'*');object=true;
 if(lost)throw Error('SYNTHETIC_RESPONSE_LOST');return new Response(null,{status:200});
}};
const prepared=await prepareSellerFileDelivery(intent,options);
const denied={...prepared.uploads[0],url:'https://untrusted.example/upload'};
await assert.rejects(uploadSellerFileOnce(intent,denied,options),/UPLOAD_TARGET_DENIED/);assert.equal(puts,0);
await assert.rejects(uploadSellerFileOnce(intent,prepared.uploads[0],{...options,readFile:async()=>Buffer.from('changed')}),/FROZEN_FILE_CHANGED/);assert.equal(puts,0);
await assert.rejects(uploadSellerFileOnce(intent,{...prepared.uploads[0],headers:{...prepared.uploads[0].headers,authorization:'Bearer forbidden'}},options),/UPLOAD_HEADERS_CHANGED/);assert.equal(puts,0);
lost=true;await assert.rejects(uploadSellerFileOnce(intent,prepared.uploads[0],options),/SYNTHETIC_RESPONSE_LOST/);assert.equal(puts,1);
await assert.rejects(uploadSellerFileOnce(intent,prepared.uploads[0],options),/FILE_UPLOAD_REQUIRES_RECOVERY/);assert.equal(puts,1);
await confirmSellerFileDelivery(intent,fileId,options);assert.equal(intent.phase,'confirmed');assert.equal(puts,1);
await retryMissingSellerFileDelivery(intent,fileId,options);assert.equal(puts,1,'A confirmed lost response never uploads again');
await deliverSellerFileReceipt(intent,'Original frozen file receipt',options);assert.equal(intent.phase,'delivered');assert.equal(puts,1);
await deliverSellerFileReceipt(intent,'Original frozen file receipt',options);assert.equal(receipt,'Original frozen file receipt');
await assert.rejects(deliverSellerFileReceipt(intent,'changed receipt',options),/FILE_RECEIPT_NOT_FROZEN/);
outage=true;await assert.rejects(retryMissingSellerFileDelivery(intent,fileId,options),/WORKSPACE_UNAVAILABLE/);assert.equal(puts,1,'An outage does not authorize an upload retry');outage=false;
// An interrupted upload with verified missing object can explicitly recover its same IDs.
object=false;confirmed=false;lost=false;delivery={...delivery,files:delivery.files.map(file=>({...file,status:'pending'}))};delete intent.files[0].confirmed;
await retryMissingSellerFileDelivery(intent,fileId,options);assert.equal(puts,2);assert.equal(intent.versionId,prepared.delivery.versionId);assert.equal(intent.phase,'confirmed');
assert.ok(calls.every(call=>call.args.attemptId===attemptId));
assert.equal(saved.some(snapshot=>JSON.stringify(snapshot).includes('synthetic-signature')),false,'Temporary upload permissions stay out of the journal');
console.log(JSON.stringify({status:'PASS',externalRequests:0,payments:0,checks:['frozen manifest and private local paths','explicit upload-origin allowlist','checksum and conditional-write headers','no credentials forwarded to storage','lost upload response confirm-only recovery','missing-object explicit recovery','storage outage never triggers retry','immutable receipt and attempt replay']}));
