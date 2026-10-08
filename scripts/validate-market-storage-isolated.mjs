import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Redis} from '@upstash/redis';
import {Keypair} from '@stellar/stellar-sdk';
import {createRedisWorkspaceStore,setWorkspaceStoreForTests} from '../lib/workspace-store.ts';
import {createMarketStore,setMarketStoreForTests} from '../lib/marketplace-store.ts';
import {createMarketFileHandlers,configuredMarketFileStorage,reserveMarketFilesInState,marketFileStorageVersion,marketFileCleanupKeys} from '../lib/market-file-delivery.ts';
import {sellerOrderAction} from '../lib/marketplace.ts';
import {pruneExpiredMarketContent} from '../lib/market-maintenance.ts';
import {MARKET_CONTENT_RETENTION_MS,MARKET_FILE_CLEANUP_GRACE_MS,marketContentExpiresAt} from '../lib/market-file-delivery-schema.ts';
import {syncDeliveryContract} from '../lib/delivery-contract.ts';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {sha,canonical,orderMemo} from '../lib/marketplace-identity.ts';
import {capacityReservationKey} from '../lib/marketplace-capacity.ts';

const secretPath=resolve('.vercel/r2-validation-secrets.json'),redisPath=resolve('.vercel/redis-validation-secrets.json'),reportPath=resolve('.vercel/market-storage-validation.json');
if(!process.argv.includes('--execute')){console.log(JSON.stringify({execute:false,r2SecretFilePresent:existsSync(secretPath),redisSecretFilePresent:existsSync(redisPath),scope:'fresh local namespaces and synthetic assets only',payment:'local fixture, no transaction',hosted:false}));process.exit(0);}
const runId=randomBytes(16).toString('hex'),workspacePrefix='bazaar-workspace:pilot-'+runId,marketPrefix='bazaar-market:pilot-'+runId,filePrefix='market-deliveries/v1/local/'+runId;
const report={version:1,date:new Date().toISOString(),runId,scope:'local handlers with isolated actual backends',processMode:'test',hosted:false,payment:'local paid-order fixture; no facilitator/RPC or transaction',providerExecutions:0,r2:'not-run',redis:'not-run',checks:[],cleanup:{r2:false,redis:false},notRun:[],ok:false};
try{report.candidate=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
let phase='configuration',redis,storage,market,workspace;const ownedObjectKeys=new Set(),ownedRedisKeys=new Set(),assets=[];
function check(name,value){assert.ok(value);report.checks.push(name);}
function credentials(path){return JSON.parse(readFileSync(path,'utf8'));}
async function fetchPrivate(url,init){return fetch(url,{...init,redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000)});}
async function expiredGrant(owner,version,file){const grant=await storage.access(owner,version,file,false,Date.now()+2500);await new Promise(resolve=>setTimeout(resolve,4000));const response=await fetchPrivate(grant.url);check('actual short signed GET expires',response.status===403||response.status===400);}
async function alteredUploads(upload,asset){
 const corrupt=Buffer.from(asset.bytes);corrupt[0]^=1;
 const corrupted=await fetchPrivate(upload.url,{method:'PUT',headers:upload.headers,body:corrupt});check('R2 rejects corrupt checksum',!corrupted.ok);
 const mime=await fetchPrivate(upload.url,{method:'PUT',headers:{...upload.headers,'content-type':'application/octet-stream'},body:asset.bytes});check('R2 rejects altered signed MIME',!mime.ok);
 const oversized=Buffer.concat([asset.bytes,Buffer.from([0])]),tampered=await fetchPrivate(upload.url,{method:'PUT',headers:{...upload.headers,'content-length':String(oversized.length)},body:oversized});check('R2 rejects altered signed length',!tampered.ok);
}
function redisOwned(key){if(!key.startsWith(workspacePrefix+':')&&!key.startsWith(marketPrefix+':'))throw Error('SCOPE_VIOLATION');ownedRedisKeys.add(key);return key;}
function scopeAccount(owner){const tag=workspacePrefix.split(':')[1];for(const key of ['registry','initialized','owner:'+owner,'market-permissions:'+owner])redisOwned(workspacePrefix+':{'+tag+'}:'+key);}
function newAssets(){
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=','base64');
 assets.push({id:'image',name:'synthetic-validation.png',mediaType:'image/png',bytes:png});
 const videoPath=resolve('work/private-deliverables-fixtures/test-sample.mp4');
 if(existsSync(videoPath)){const video=readFileSync(videoPath);if(video.length>500000)throw Error('FIXTURE_TOO_LARGE');assets.push({id:'video',name:'synthetic-validation.mp4',mediaType:'video/mp4',bytes:video});}
 else assets.push({id:'captions',name:'synthetic-validation.vtt',mediaType:'text/vtt',bytes:Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.000\nSynthetic validation only.\n')});
}
try{
 if(!existsSync(secretPath))throw Error('R2_CREDENTIALS_UNAVAILABLE');
 const r2=credentials(secretPath),endpoint=new URL(r2.endpoint);
 if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.r2.cloudflarestorage.com')||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/'||r2.bucket!=='bazaar-deliverables'||r2.region!=='auto'||typeof r2.accessKeyId!=='string'||typeof r2.secretAccessKey!=='string')throw Error('INVALID_R2_SCOPE');
 Object.assign(process.env,{NODE_ENV:'test',BAZAAR_S3_BUCKET:r2.bucket,BAZAAR_S3_REGION:r2.region,BAZAAR_S3_ENDPOINT:r2.endpoint,BAZAAR_S3_ACCESS_KEY_ID:r2.accessKeyId,BAZAAR_S3_SECRET_ACCESS_KEY:r2.secretAccessKey,BAZAAR_MARKET_FILE_PREFIX:filePrefix,BAZAAR_MARKET_FILES_ENABLED:'true',BAZAAR_ENABLE_MARKETPLACE:'true',BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_WORKSPACE_BACKEND:'redis',BAZAAR_WORKSPACE_ADMISSION:'open',BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'https://isolated-storage-validation.invalid',BAZAAR_PUBLIC_DEMO:'true',BAZAAR_DEMO_NAMESPACE_ENV:'local'});
 delete process.env.VERCEL;delete process.env.VERCEL_ENV;delete process.env.BAZAAR_ACCEPTANCE_METER;delete process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE;delete process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY;
 storage=configuredMarketFileStorage();newAssets();
 const files=assets.map(({bytes,...asset})=>({...asset,size:bytes.length,sha256:sha(bytes)})),versionId=randomUUID(),operationId=randomUUID(),attemptId=randomUUID();
 let buyerOwnerId='ow_'+randomBytes(16).toString('hex'),sellerOwnerId='ow_'+randomBytes(16).toString('hex'),buyer,seller,handlers,order;
 const base='https://isolated-storage-validation.invalid',request=(token,body)=>new Request(base+'/api/market/orders/'+operationId+'/deliveries',{method:body?'POST':'GET',headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(existsSync(redisPath)){
  const configured=credentials(redisPath),url=configured.url??configured.restUrl,token=configured.token??configured.restToken;
  const endpoint=new URL(url);if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.upstash.io')||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||typeof token!=='string')throw Error('INVALID_REDIS_SCOPE');
  Object.assign(process.env,{BAZAAR_WORKSPACE_REDIS_REST_URL:url,BAZAAR_WORKSPACE_REDIS_REST_TOKEN:token,BAZAAR_WORKSPACE_PREFIX:workspacePrefix,BAZAAR_MARKET_PREFIX:marketPrefix});
  redis=new Redis({url,token,automaticDeserialization:false,retry:false,enableAutoPipelining:false});
  for(const key of [marketPrefix+':state',marketPrefix+':x402-settlements:state',capacityReservationKey(marketPrefix)])redisOwned(key);
  const plannedOwners=new Map();
  const freshWorkspace=()=>createRedisWorkspaceStore(redis,workspacePrefix,()=>({ownerIds:[],hashes:[]}),(creationId)=>{const id=plannedOwners.get(creationId);if(!id)throw Error('OWNER_OUTSIDE_VALIDATION_PLAN');return id;});workspace=freshWorkspace();setWorkspaceStoreForTests(workspace);market=createMarketStore(redis,marketPrefix);setMarketStoreForTests(market);
  async function account(ip){const tokens=Object.fromEntries(['human','agent','bootstrap'].map(role=>[role,randomBytes(32).toString('base64url')])),creationId=randomUUID();const intent={creationId,humanAccessHash:sha(tokens.human),agentAccessHash:sha(tokens.agent)};
   const ownerUuid=randomUUID();plannedOwners.set(creationId,ownerUuid);scopeAccount('ow_'+ownerUuid.replaceAll('-',''));
   // Explicit replay recovers an acknowledged-late creation before cleanup keys
   // are recorded. Never create a second account after an uncertain response.
   let value;try{value=await workspace.createWorkspace(intent,sha(tokens.bootstrap),ip);}catch{value=await workspace.createWorkspace(intent,sha(tokens.bootstrap),ip);}
   scopeAccount(value.record.ownerId);return {tokens,agent:await workspace.resolveHash(sha(tokens.agent)),human:await workspace.resolveHash(sha(tokens.human))};}
  phase='two public workspace accounts';buyer=await account('validation-one');seller=await account('validation-two');buyerOwnerId=buyer.agent.ownerId;sellerOwnerId=seller.agent.ownerId;check('two real persisted public workspace accounts',buyerOwnerId!==sellerOwnerId);
  const destination=Keypair.random().publicKey(),payer=Keypair.random().publicKey(),input={topic:'Synthetic storage validation only'},now=new Date().toISOString();
  const card={version:'bazaar.service-card/v0',id:'isolated-storage-fixture',name:'Isolated storage fixture',description:'Locally injected paid fixture; no blockchain payment',kind:'http',url:'https://provider-validation.invalid',routeTemplate:'/synthetic',input:[{name:'topic',type:'string',required:true}],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',identity:USDC_TESTNET_PAYMENT_IDENTITY,amount:'0.01',destination,marketplace:{protocol:'x402-stellar-exact-v2',resourceTemplate:'/api/market/orders/{operationId}/x402'}},provider:{name:'Local fixture'},tags:['synthetic'],delivery:{...syncDeliveryContract(),storage:{mode:'bazaar',maxFiles:2,maxTotalBytes:1000000,maxFileBytes:500000},result:{...syncDeliveryContract().result,contentType:assets[1].mediaType}}};
  const cardHash=computeCanonicalServiceCardHash(card);order={operationId,buyerOwnerId,sellerOwnerId,serviceId:card.id,cardHash,card,input,payer,destination,amount:'0.01',settlement:USDC_TESTNET_PAYMENT_IDENTITY,paymentProtocol:'x402-stellar-exact-v2',inputHash:sha(canonical(input)),memoHash:orderMemo(buyerOwnerId,operationId,cardHash,input),phase:'awaiting-payment',createdAt:now,updatedAt:now};
  await market.transact(s=>{reserveMarketFilesInState(order,s);s.orders.push(order);});
  handlers=createMarketFileHandlers({store:()=>market,objects:()=>storage});const manifest={attemptId,versionId,files};
  phase='unpaid upload denied';check('unpaid order cannot upload',(await handlers.prepare(request(seller.tokens.agent,manifest),operationId)).status===409);
  // This injection runs inside this local test process only. No deployed bypass,
  // facilitator, RPC call, signature submission, service activation or payment.
  await market.transact(s=>Object.assign(s.orders[0],{phase:'executing',settlementAttemptId:randomUUID(),transactionHash:sha('local-fixture-no-chain'),paymentVerifiedAt:now,attemptId,agentId:seller.agent.agentId}));
  check('buyer cannot prepare seller files',(await handlers.prepare(request(buyer.tokens.agent,manifest),operationId)).status===404);
  phase='persisted manifest and response loss';const prepared=await handlers.prepare(request(seller.tokens.agent,manifest),operationId);check('real Redis reserves manifest',prepared.status===200);await prepared.json();
  workspace=freshWorkspace();setWorkspaceStoreForTests(workspace);market=createMarketStore(redis,marketPrefix);setMarketStoreForTests(market);
  const replay=await handlers.prepare(request(seller.tokens.agent,manifest),operationId);check('manifest recovered after reconstructed stores',replay.status===200);const body=await replay.json();order=await market.transact(s=>s.orders[0]);
  for(const key of marketFileCleanupKeys(order))ownedObjectKeys.add(key);
  const absent=await handlers.confirm(request(seller.tokens.agent,{attemptId,versionId,fileId:files[0].id}),operationId),absentBody=await absent.json();check('interrupted upload remains explicitly absent',absent.status===409&&absentBody.error?.code==='FILE_NOT_UPLOADED');
  phase='R2 signed upload integrity';
 await alteredUploads(body.uploads.find(upload=>upload.fileId===files[0].id),assets[0]);
  for(const asset of assets){const upload=body.uploads.find(u=>u.fileId===asset.id),put=await fetchPrivate(upload.url,{method:'PUT',headers:upload.headers,body:asset.bytes});check('R2 private upload '+asset.id,put.ok);}
  // Upload responses are deliberately discarded; HEAD reconciliation follows.
  market=createMarketStore(redis,marketPrefix);setMarketStoreForTests(market);
  for(const file of files){const confirmed=await handlers.confirm(request(seller.tokens.agent,{attemptId,versionId,fileId:file.id}),operationId);check('actual HEAD confirms '+file.id,confirmed.status===200);}
  order=await market.transact(s=>s.orders[0]);await sellerOrderAction(seller.agent,operationId,{action:'deliver',attemptId,text:'Synthetic stored delivery; payment locally simulated',manifestHash:order.fileDelivery.manifestHash});
  market=createMarketStore(redis,marketPrefix);setMarketStoreForTests(market);const delivered=await sellerOrderAction(seller.agent,operationId,{action:'deliver',attemptId,text:'Synthetic stored delivery; payment locally simulated',manifestHash:order.fileDelivery.manifestHash});check('delivery response loss recovers same order',delivered.phase==='delivered');
  phase='buyer private access';check('seller cannot obtain buyer file URLs',(await handlers.read(request(seller.tokens.human),operationId)).status===404);check('anonymous file access rejected',(await handlers.read(request(undefined),operationId)).status===401);
  const access=await handlers.read(request(buyer.tokens.human),operationId);check('buyer human receives private access',access.status===200);const saved=(await access.json()).delivery.files;
  for(const file of saved){const get=await fetchPrivate(file.url),bytes=Buffer.from(await get.arrayBuffer()),source=assets.find(a=>a.id===file.id);check('actual GET bytes '+file.id,get.ok&&bytes.equals(source.bytes));const partial=await fetchPrivate(file.url,{headers:{Range:'bytes=0-7'}});check('actual Range 206 '+file.id,partial.status===206&&Buffer.from(await partial.arrayBuffer()).equals(source.bytes.subarray(0,8)));const unsigned=new URL(file.url);unsigned.search='';const publicRead=await fetchPrivate(unsigned.href);check('unsigned object denied '+file.id,!publicRead.ok);}
  phase='actual signed URL expiration';await expiredGrant(buyerOwnerId,marketFileStorageVersion(order),files[0]);
  report.redis='pass';report.r2='pass';report.publicAccountIsolation='pass-local-handler';
  phase='controlled fixture expiry';
  // Explicit fixture timestamps avoid waiting seven days or altering the host
  // clock/signing time. This mutation is not available through public routes.
  await market.transact(s=>{const o=s.orders[0];o.createdAt=new Date(Date.now()-MARKET_CONTENT_RETENTION_MS-1000).toISOString();o.fileReservation.expiresAt=marketContentExpiresAt(o);o.fileDelivery.expiresAt=marketContentExpiresAt(o);});
  check('expired buyer access denied',(await handlers.read(request(buyer.tokens.human),operationId)).status===410);
  const firstCleanup=await pruneExpiredMarketContent({redis,prefix:marketPrefix,objects:storage});check('real backends archive and delete first pass',firstCleanup.removed.length===1&&firstCleanup.cleanupPending===1&&firstCleanup.incidents.length===0);
  const archived=await market.transact(s=>s);check('archived control has no file names/results',!JSON.stringify(archived.archived).includes('synthetic-validation')&&!JSON.stringify(archived.archived).includes('Synthetic stored delivery'));
  await market.transact(s=>{const q=s.fileCleanup[0];q.firstDeletedAt=new Date(Date.now()-MARKET_FILE_CLEANUP_GRACE_MS-1000).toISOString();q.notBefore=q.firstDeletedAt;});
  const finalCleanup=await pruneExpiredMarketContent({redis,prefix:marketPrefix,objects:storage});check('actual repeated deletion releases reservation',finalCleanup.cleanupReleased===1&&finalCleanup.cleanupPending===0&&finalCleanup.incidents.length===0);
  report.retention='real Redis/R2 cleanup with controlled fixture timestamps; no seven-day wall-clock wait';
 }else{
  report.notRun.push('actual public workspace routes and Redis persistence: Redis credentials unavailable');
  const version=operationId+':'+versionId;
  phase='R2 direct signing and integrity';
  for(const asset of assets){
   const file=files.find(f=>f.id===asset.id);ownedObjectKeys.add(storage.cleanupKey(buyerOwnerId,version,file.id));const upload=await storage.upload(buyerOwnerId,version,file);
   if(asset===assets[0]){
    await assert.rejects(()=>storage.verify(buyerOwnerId,version,file),error=>error.code==='FILE_NOT_UPLOADED'&&error.status===409);report.checks.push('R2 direct interrupted upload explicitly absent');
    await alteredUploads(upload,asset);
   }
   const put=await fetchPrivate(upload.url,{method:'PUT',headers:upload.headers,body:asset.bytes});check('R2 direct upload '+asset.id,put.ok);
   const overwrite=await fetchPrivate(upload.url,{method:'PUT',headers:upload.headers,body:asset.bytes});check('R2 conditional overwrite denied '+asset.id,!overwrite.ok);
   await storage.verify(buyerOwnerId,version,file);check('R2 direct actual HEAD '+asset.id,true);
   const access=await storage.access(buyerOwnerId,version,file,false),get=await fetchPrivate(access.url);check('R2 direct GET bytes '+asset.id,get.ok&&Buffer.from(await get.arrayBuffer()).equals(asset.bytes));
   const partial=await fetchPrivate(access.url,{headers:{Range:'bytes=0-7'}});check('R2 direct Range 206 '+asset.id,partial.status===206&&Buffer.from(await partial.arrayBuffer()).equals(asset.bytes.subarray(0,8)));
   const unsigned=new URL(access.url);unsigned.search='';check('R2 direct unsigned object denied '+asset.id,!(await fetchPrivate(unsigned.href)).ok);
  }
  phase='actual signed URL expiration';
  await expiredGrant(buyerOwnerId,version,files[0]);
  report.r2='pass-direct-only';
 }
 report.notRun.push('hosted preview HTTP/browser acceptance','real x402 payment and provider execution','actual seven-day wall-clock/lifecycle verification');report.ok=report.redis==='pass'&&report.r2==='pass';
}catch(error){report.failedPhase=phase;report.failureCode=['WORKSPACE_UNAVAILABLE','MARKET_CAPACITY','PAYMENT_RECOVERY_CAPACITY','CAPACITY_WRITE_UNCONFIRMED','FILE_NOT_UPLOADED','FILE_INTEGRITY_MISMATCH'].includes(error?.code)?error.code:error?.name==='AssertionError'?'ASSERTION_FAILED':'VALIDATION_FAILED';if(Number.isInteger(error?.$metadata?.httpStatusCode))report.httpStatus=error.$metadata.httpStatusCode;}
finally{
 phase='owned synthetic cleanup';
 if(storage){let ok=true;for(const key of ownedObjectKeys)try{await storage.removeKey(key);}catch{ok=false;}report.cleanup.r2=ok;}
 if(redis){try{if(ownedRedisKeys.size)await redis.del(...ownedRedisKeys);report.cleanup.redis=true;}catch{report.cleanup.redis=false;}}
 report.ok=report.ok&&report.cleanup.r2&&report.cleanup.redis;report.syntheticObjects=ownedObjectKeys.size;report.syntheticRedisKeys=ownedRedisKeys.size;
 writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(report));
 for(const variable of ['BAZAAR_S3_ACCESS_KEY_ID','BAZAAR_S3_SECRET_ACCESS_KEY','BAZAAR_WORKSPACE_REDIS_REST_TOKEN'])delete process.env[variable];
 if(!report.ok)process.exitCode=1;
}
