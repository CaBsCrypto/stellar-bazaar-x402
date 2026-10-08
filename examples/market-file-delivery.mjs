import {createHash,randomUUID} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {sellerTool} from './seller-marketplace-worker.mjs';
import {sellerCanonical} from './seller-service-card.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const metadata=file=>({id:file.id,name:file.name,mediaType:file.mediaType,size:file.size,sha256:file.sha256,...(file.url?{url:file.url}:{})});
const manifest=intent=>({mode:intent.mode,attemptId:intent.attemptId,versionId:intent.versionId,files:intent.files.map(metadata)});
function validate(intent){
 if(intent?.version!==1||!uuid.test(intent.operationId??'')||!uuid.test(intent.attemptId??'')||!uuid.test(intent.versionId??'')||!['bazaar','external'].includes(intent.mode)||!Array.isArray(intent.files)||!intent.files.length||intent.files.length>10||new Set(intent.files.map(f=>f.id)).size!==intent.files.length||intent.manifestHash!==sha(sellerCanonical(manifest(intent))))throw Error('FILE_INTENT_CHANGED');
 for(const file of intent.files)if(!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(file.id??'')||typeof file.name!=='string'||!file.name.length||file.name.length>120||/[\\/\r\n\u0000]/.test(file.name)||!Number.isInteger(file.size)||file.size<1||file.size>50000000||!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(file.mediaType??'')||!/^[a-f0-9]{64}$/.test(file.sha256??'')||intent.mode==='bazaar'&&(!file.path||file.url)||intent.mode==='external'&&!file.url)throw Error('INVALID_FROZEN_FILE');
 if(intent.files.reduce((sum,file)=>sum+file.size,0)>100000000)throw Error('FILE_SIZE_LIMIT');
 return intent;
}
async function persist(intent,options){validate(intent);if(typeof options.persistIntent!=='function')throw Error('DURABLE_JOURNAL_REQUIRED');await options.persistIntent(structuredClone(intent));}
function boundDelivery(intent,result){
 const delivery=result?.delivery;
 if(!delivery||delivery.mode!==intent.mode||delivery.versionId!==intent.versionId||delivery.attemptId!==intent.attemptId||delivery.manifestHash!==intent.manifestHash||sellerCanonical(delivery.files.map(metadata))!==sellerCanonical(intent.files.map(metadata)))throw Error('FILE_DELIVERY_CHANGED');
 return delivery;
}

/** Files have already been produced. This helper never invokes a provider or wallet. */
export async function freezeSellerFileDelivery({operationId,attemptId,mode='bazaar',versionId=randomUUID(),files},options={}){
 if(!Array.isArray(files)||files.length<1||files.length>10)throw Error('FILE_COUNT_LIMIT');
 const frozen=[];
 for(const file of files){
  if(mode==='bazaar'){
   if(!options.readFile){const info=await stat(resolve(file.path));if(!info.isFile()||info.size<1||info.size>50000000)throw Error('FILE_SIZE_LIMIT');}
   const bytes=await (options.readFile??readFile)(resolve(file.path));
   if(bytes.byteLength<1||bytes.byteLength>50000000)throw Error('FILE_SIZE_LIMIT');
   frozen.push({id:file.id??randomUUID(),name:file.name,mediaType:file.mediaType,path:resolve(file.path),size:bytes.byteLength,sha256:sha(bytes)});
  }else{
   const url=new URL(file.url);if(url.protocol!=='https:'||url.username||url.password||url.hash||url.href!==file.url)throw Error('INVALID_EXTERNAL_URL');
   frozen.push({...metadata(file),id:file.id??randomUUID()});
  }
 }
 const intent={version:1,operationId,attemptId,versionId,mode,files:frozen,phase:'frozen'};
 intent.manifestHash=sha(sellerCanonical(manifest(intent)));return validate(intent);
}

/** Initial preparation and explicit recovery preserve the exact same immutable manifest. */
export async function prepareSellerFileDelivery(intent,options){
 validate(intent);intent.phase='prepare-started';await persist(intent,options);
 const result=await sellerTool(options,'prepare_market_delivery',{operationId:intent.operationId,attemptId:intent.attemptId,versionId:intent.versionId,files:intent.files.map(metadata)});
 boundDelivery(intent,result);intent.phase='prepared';await persist(intent,options);return result;
}

/** Never repeats a PUT after an uncertain acknowledgement. Confirm first to recover it. */
export async function uploadSellerFileOnce(intent,upload,options){
 validate(intent);const file=intent.files.find(file=>file.id===upload?.fileId);
 if(intent.mode!=='bazaar'||!file||file.uploadStarted||file.confirmed)throw Error('FILE_UPLOAD_REQUIRES_RECOVERY');
 const url=new URL(upload.url),allowed=options.allowedUploadOrigins??[];
 if(url.protocol!=='https:'||url.username||url.password||url.hash||!allowed.includes(url.origin)||!Number.isFinite(Date.parse(upload.expiresAt))||Date.parse(upload.expiresAt)<=Date.now())throw Error('UPLOAD_TARGET_DENIED');
 const headers=new Headers(upload.headers),checksum=Buffer.from(file.sha256,'hex').toString('base64');
 if(headers.get('content-type')!==file.mediaType||headers.get('content-length')!==String(file.size)||headers.get('x-amz-checksum-sha256')!==checksum||headers.get('if-none-match')!=='*'||[...headers.keys()].some(key=>!['content-type','content-length','x-amz-checksum-sha256','if-none-match'].includes(key)))throw Error('UPLOAD_HEADERS_CHANGED');
 if(!options.readFile){const info=await stat(file.path);if(!info.isFile()||info.size!==file.size)throw Error('FROZEN_FILE_CHANGED');}
 const bytes=await (options.readFile??readFile)(file.path);if(bytes.byteLength!==file.size||sha(bytes)!==file.sha256)throw Error('FROZEN_FILE_CHANGED');
 file.uploadStarted=true;intent.phase='upload-started';await persist(intent,options);
 // No Bazaar bearer, wallet seed, provider credentials or R2 key reaches this request.
 const response=await (options.fetch??fetch)(url.href,{method:'PUT',headers,body:bytes,redirect:'error',credentials:'omit',signal:AbortSignal.timeout(60000)});
 if(response.redirected||!response.ok)throw Error('UPLOAD_UNCONFIRMED');
 file.uploadResponded=true;intent.phase='upload-responded';await persist(intent,options);
}

export async function confirmSellerFileDelivery(intent,fileId,options){
 validate(intent);const file=intent.files.find(file=>file.id===fileId);if(!file)throw Error('FILE_NOT_FOUND');
 const result=await sellerTool(options,'confirm_market_delivery',{operationId:intent.operationId,attemptId:intent.attemptId,versionId:intent.versionId,fileId});
 const delivery=boundDelivery(intent,result);if(delivery.files.find(item=>item.id===fileId)?.status!=='available')throw Error('FILE_NOT_CONFIRMED');
 file.confirmed=true;intent.phase=intent.files.every(file=>file.confirmed)?'confirmed':'partly-confirmed';await persist(intent,options);return result;
}

/** An explicit retry is allowed only after a verified missing object, with conditional PUT. */
export async function retryMissingSellerFileDelivery(intent,fileId,options){
 try{return {alreadyConfirmed:true,...await confirmSellerFileDelivery(intent,fileId,options)};}
 catch(error){if(error.message!=='FILE_NOT_UPLOADED')throw error;}
 const result=await prepareSellerFileDelivery(intent,options),file=intent.files.find(file=>file.id===fileId),upload=result.uploads?.find(upload=>upload.fileId===fileId);
 if(!file||!upload)throw Error('FILE_UPLOAD_REQUIRES_RECOVERY');file.uploadStarted=false;delete file.uploadResponded;await persist(intent,options);
 await uploadSellerFileOnce(intent,upload,options);return confirmSellerFileDelivery(intent,fileId,options);
}

export async function deliverSellerFileReceipt(intent,text,options){
 validate(intent);if(!intent.files.every(file=>file.confirmed)||typeof text!=='string'||!text.length||text.length>2000||intent.receiptText&&intent.receiptText!==text)throw Error('FILE_RECEIPT_NOT_FROZEN');
 intent.receiptText=text;intent.phase='delivery-started';await persist(intent,options);
 const result=await sellerTool(options,'deliver_market_order',{operationId:intent.operationId,attemptId:intent.attemptId,text,manifestHash:intent.manifestHash});
 if(result.order?.phase!=='delivered'||result.order.delivery?.text!==text||result.order.delivery.sha256!==sha(text)||result.order.fileDelivery?.manifestHash!==intent.manifestHash)throw Error('FILE_RECEIPT_CHANGED');
 intent.phase='delivered';await persist(intent,options);return result;
}
