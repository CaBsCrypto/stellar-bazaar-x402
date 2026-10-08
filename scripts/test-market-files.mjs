import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {Keypair} from '@stellar/stellar-sdk';
import {S3Client} from '@aws-sdk/client-s3';
import {createPrivateS3} from '../lib/deliverable-s3.ts';
import {createRedisWorkspaceStore,READ_WORKSPACE_LUA,READ_MARKET_PERMISSION_LUA,COMMIT_WORKSPACE_LUA,setWorkspaceStoreForTests} from '../lib/workspace-store.ts';
import {createMarketStore,validateMarketState,setMarketStoreForTests} from '../lib/marketplace-store.ts';
import {sellerOrderAction,submitMarketService,createMarketOrder} from '../lib/marketplace.ts';
import {marketHandlers} from '../lib/marketplace-http.ts';
import {setMarketStorageProbeForTests} from '../lib/market-storage-probe.ts';
import {resetSelfListingStateForTests,recordManualReview,stageApprovedSubmission} from '../lib/provider-self-listing.ts';
import {verifySubmissionHttp,activateSubmission} from '../lib/provider-review-operator.ts';
import {capacityEval} from './fixtures/market-capacity-redis.mjs';
import {createMarketFileHandlers,reserveMarketFilesInState,assertMarketFileDeliveryComplete,marketFileStorageVersion,removeExpiredMarketFiles,marketFileCapabilities} from '../lib/market-file-delivery.ts';
import {marketContentExpiresAt,MARKET_CONTENT_RETENTION_MS} from '../lib/market-file-delivery-schema.ts';
import {marketRecoveryRecord} from '../lib/market-retention-schema.ts';
import {maximumMarketRecordBytes,capacityReservationKey} from '../lib/marketplace-capacity.ts';
import {DeliverableError} from '../lib/deliverable-store.ts';
import {syncDeliveryContract} from '../lib/delivery-contract.ts';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {sha,canonical,orderMemo} from '../lib/marketplace-identity.ts';

Object.assign(process.env,{BAZAAR_PUBLIC_DEMO:'true',BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_ENABLE_MARKETPLACE:'true',BAZAAR_ENABLE_MARKET_PURCHASES:'true',BAZAAR_X402_MARKETPLACE_ENABLED:'true',BAZAAR_ENABLE_SELF_LISTING_INTAKE:'true',BAZAAR_MARKET_REVIEW_SECRET:randomBytes(32).toString('hex'),BAZAAR_WORKSPACE_ADMISSION:'open',BAZAAR_WORKSPACE_BACKEND:'redis',BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'https://files-fixture.example',BAZAAR_MARKET_FILES_ENABLED:'true',BAZAAR_MARKET_FILE_PREFIX:'market-deliveries/v1/local/'+randomBytes(16).toString('hex'),BAZAAR_S3_BUCKET:'offline-fixture',BAZAAR_S3_REGION:'auto',BAZAAR_S3_ENDPOINT:'https://r2-fixture.example',BAZAAR_S3_ACCESS_KEY_ID:'offline-fixture',BAZAAR_S3_SECRET_ACCESS_KEY:'offline-fixture'});
delete process.env.VERCEL;delete process.env.VERCEL_ENV;delete process.env.BAZAAR_ACCEPTANCE_METER;
let tests=0,loseAck=false,revokeOnVerify=false;const check=(v)=>{assert.ok(v);tests++;},data=new Map();
const redis={async get(k){return data.get(k)??null;},async eval(script,keys,args){
 if(script===READ_WORKSPACE_LUA||script===READ_MARKET_PERMISSION_LUA)return keys.map(k=>data.get(k)??'');
 if(script===COMMIT_WORKSPACE_LUA){if(keys.some((k,i)=>(data.get(k)??'')!==args[i]))return 0;data.set(keys[0],args[3]);if(args[4])data.set(keys[1],args[4]);data.set(keys[2],'workspace-v1');return 1;}
 return capacityEval(data,script,keys,args,{afterWrite(){if(loseAck){loseAck=false;throw Error('lost response after commit');}}});
}};
const workspacePrefix='bazaar-workspace:pilot-'+randomBytes(16).toString('hex'),marketPrefix='bazaar-market:pilot-'+randomBytes(16).toString('hex');
const workspace=createRedisWorkspaceStore(redis,workspacePrefix,()=>({ownerIds:[],hashes:[]}));setWorkspaceStoreForTests(workspace);
async function account(){const tokens=Object.fromEntries(['human','agent','bootstrap'].map(k=>[k,randomBytes(32).toString('base64url')]));await workspace.createWorkspace({creationId:randomUUID(),humanAccessHash:sha(tokens.human),agentAccessHash:sha(tokens.agent)},sha(tokens.bootstrap),'test-ip');return {tokens,agent:await workspace.resolveHash(sha(tokens.agent)),human:await workspace.resolveHash(sha(tokens.human)),root:await workspace.resolveHash(sha(tokens.bootstrap))};}
const seller=await account(),buyer=await account(),other=await account(),market=createMarketStore(redis,marketPrefix),objects=new Map();
setMarketStoreForTests(market);
const key=(owner,version,file)=>owner+'/'+version+'/'+file.id;let uploads=0,downloads=0;
const storage={async upload(owner,version,file,deadline){uploads++;return {url:'https://private-fixture.example/'+key(owner,version,file),headers:{'content-type':file.mediaType},expiresAt:new Date(Math.min(deadline,Date.now()+600000)).toISOString()};},async verify(owner,version,file){if(revokeOnVerify){revokeOnVerify=false;await workspace.changeAccess(seller.root.workspaceId,sha(seller.tokens.bootstrap),{action:'revoke',expectedGeneration:1});}const saved=objects.get(key(owner,version,file));if(!saved||saved.size!==file.size||saved.sha256!==file.sha256||saved.mediaType!==file.mediaType)throw new DeliverableError('FILE_INTEGRITY_MISMATCH',409);},async access(owner,version,file,download,deadline){downloads++;return {url:'https://private-fixture.example/'+key(owner,version,file)+'?signed=synthetic',expiresAt:new Date(Math.min(deadline,Date.now()+300000)).toISOString()};},async remove(owner,version,file){objects.delete(key(owner,version,file));}};
const handlers=createMarketFileHandlers({store:()=>market,objects:()=>storage});
const request=(operationId,token,body,suffix='')=>new Request('https://files-fixture.example/api/market/orders/'+operationId+'/deliveries'+suffix,{method:body?'POST':'GET',headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
const baseCard={version:'bazaar.service-card/v0',id:'synthetic-video',name:'Synthetic video',description:'Offline file route test, no transaction.',kind:'http',url:'https://provider.example',routeTemplate:'/video',input:[{name:'topic',type:'string',required:true}],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',identity:USDC_TESTNET_PAYMENT_IDENTITY,amount:'0.01',destination:Keypair.random().publicKey(),marketplace:{protocol:'x402-stellar-exact-v2',resourceTemplate:'/api/market/orders/{operationId}/x402'}},provider:{name:'Offline fixture'},tags:['testnet'],delivery:{...syncDeliveryContract(),storage:{mode:'bazaar',maxFiles:2,maxTotalBytes:60000000,maxFileBytes:50000000},result:{...syncDeliveryContract().result,contentType:'video/mp4'}}};
function order(card=baseCard,owner=buyer.agent.ownerId){const operationId=randomUUID(),input={topic:'Synthetic'},cardHash=computeCanonicalServiceCardHash(card),now=new Date().toISOString();return {operationId,buyerOwnerId:owner,sellerOwnerId:seller.agent.ownerId,serviceId:card.id,cardHash,card,input,payer:Keypair.random().publicKey(),destination:card.payment.destination,amount:card.payment.amount,settlement:USDC_TESTNET_PAYMENT_IDENTITY,paymentProtocol:'x402-stellar-exact-v2',inputHash:sha(canonical(input)),memoHash:orderMemo(owner,operationId,cardHash,input),phase:'awaiting-payment',createdAt:now,updatedAt:now};}
// Exercise the same reviewed-provider path as a real new purchase, with every
// external proof/registry effect confined to explicit dependency doubles.
await resetSelfListingStateForTests();
const submissionId=randomUUID(),submission=await submitMarketService(seller.human,{submissionId,card:baseCard,controlProof:{method:'http-well-known',domain:'provider.example'}});
await verifySubmissionHttp(submissionId,{lookup:async()=>[{address:'8.8.8.8',family:4}],transport:async()=>({status:200,body:submission.control.expectedRecord})});
check((await recordManualReview(submissionId,{decision:'approve',reviewerId:'offline-fixture',reasons:['Synthetic storage contract']})).ok);
check((await stageApprovedSubmission(submissionId)).ok);
await activateSubmission(submissionId,{configured:()=>true,create:async card=>({ok:true,entry:{id:card.id,card,hash:computeCanonicalServiceCardHash(card)}}),read:async()=>undefined});
const newIntent=()=>{const value=order();return {operationId:value.operationId,serviceId:value.serviceId,cardHash:value.cardHash,payer:value.payer,input:value.input,paymentProtocol:value.paymentProtocol};};
let probeCalls=0;setMarketStorageProbeForTests(async()=>{probeCalls++;return {configured:true,reachable:false,code:'STORAGE_UNREACHABLE'};});
const admissionBefore=data.get(marketPrefix+':state'),ledgerBefore=data.get(capacityReservationKey(marketPrefix));
const unavailable=await marketHandlers.create(new Request('https://files-fixture.example/api/market/orders',{method:'POST',headers:{authorization:'Bearer '+buyer.tokens.agent,'content-type':'application/json'},body:JSON.stringify(newIntent())}));
check(unavailable.status===503);check((await unavailable.json()).error.code==='STORAGE_UNREACHABLE');check(probeCalls===1);
check(data.get(marketPrefix+':state')===admissionBefore);check(data.get(capacityReservationKey(marketPrefix))===ledgerBefore);check(uploads===0);
setMarketStorageProbeForTests(async()=>({configured:true,reachable:true,code:'STORAGE_REACHABLE'}));
const o=order();await market.transact(s=>{reserveMarketFilesInState(o,s);s.orders.push(o);});
check((await market.transact(s=>s.orders[0])).fileReservation.maxBytes===60000000);
check(JSON.parse(data.get(capacityReservationKey(marketPrefix))).entries.length===1);
await assert.rejects(()=>market.transact(s=>{const second=order();reserveMarketFilesInState(second,s);s.orders.push(second);}),e=>e.code==='ACCOUNT_FILE_CAPACITY');tests++;
// Old expired bytes remain charged until physically cleaned.
const globalState={version:1,services:[],orders:Array.from({length:50},(_,i)=>({...order(baseCard,'owner'+i),fileReservation:{maxBytes:100000000,expiresAt:'2020-01-01T00:00:00.000Z'}}))};
assert.throws(()=>reserveMarketFilesInState(order(baseCard,'new-owner'),globalState),e=>e.code==='GLOBAL_FILE_CAPACITY');tests++;
const files=[{id:'image',name:'synthetic.png',mediaType:'image/png',size:32,sha256:sha('poster')},{id:'video',name:'synthetic.mp4',mediaType:'video/mp4',size:64,sha256:sha('video')}],versionId=randomUUID(),attemptId=randomUUID(),manifest={attemptId,versionId,files};
check((await handlers.prepare(request(o.operationId,seller.tokens.agent,manifest),o.operationId)).status===409);
await market.transact(s=>Object.assign(s.orders[0],{phase:'paid',settlementAttemptId:randomUUID(),transactionHash:'a'.repeat(64),paymentVerifiedAt:new Date().toISOString()}));
process.env.BAZAAR_MARKET_FILES_ENABLED='false';check(marketFileCapabilities().enabled===false);
const closedBefore=data.get(marketPrefix+':state'),closedLedger=data.get(capacityReservationKey(marketPrefix));
await assert.rejects(()=>createMarketOrder(buyer.agent,newIntent()),e=>e.code==='FILE_STORAGE_DISABLED'&&e.status===503);tests++;
check(data.get(marketPrefix+':state')===closedBefore);check(data.get(capacityReservationKey(marketPrefix))===closedLedger);
// Explicit replay and paid seller recovery survive closure of new admission.
check((await createMarketOrder(buyer.agent,{operationId:o.operationId,serviceId:o.serviceId,cardHash:o.cardHash,payer:o.payer,input:o.input,paymentProtocol:o.paymentProtocol})).phase==='paid');
check((await sellerOrderAction(seller.agent,o.operationId,{action:'claim',attemptId})).phase==='executing');
check((await handlers.prepare(request(o.operationId,undefined,manifest),o.operationId)).status===401);
check((await handlers.prepare(request(o.operationId,seller.tokens.human,manifest),o.operationId)).status===403);
check((await handlers.prepare(request(o.operationId,buyer.tokens.agent,manifest),o.operationId)).status===404);
check((await handlers.prepare(request(o.operationId,seller.tokens.agent,{...manifest,attemptId:randomUUID()}),o.operationId)).status===409);
check((await handlers.prepare(request(o.operationId,seller.tokens.agent,{...manifest,files:[{...files[0],size:50000001}]}),o.operationId)).status===400);
check((await handlers.prepare(request(o.operationId,seller.tokens.agent,{...manifest,files:[{...files[0],url:'https://provider.example/a'}]}),o.operationId)).status===400);
const before=maximumMarketRecordBytes(await market.transact(s=>s.orders[0]));
loseAck=true;check((await handlers.prepare(request(o.operationId,seller.tokens.agent,manifest),o.operationId)).status===503);
const prepared=await handlers.prepare(request(o.operationId,seller.tokens.agent,manifest),o.operationId);check(prepared.status===200);check((await prepared.json()).uploads.length===2);
const saved=await market.transact(s=>s.orders[0]);check(maximumMarketRecordBytes(saved)===before);check(saved.fileDelivery.expiresAt===marketContentExpiresAt(o));assert.throws(()=>assertMarketFileDeliveryComplete(saved),e=>e.code==='FILES_PENDING');tests++;
await assert.rejects(()=>sellerOrderAction(seller.agent,o.operationId,{action:'deliver',attemptId,text:'File receipt'}),e=>e.code==='FILES_PENDING');tests++;
const pending=await handlers.read(request(o.operationId,buyer.tokens.human),o.operationId);check(pending.status===200);check((await pending.json()).delivery.files.every(f=>!f.url));check(downloads===0);
check((await handlers.read(request(o.operationId,other.tokens.agent),o.operationId)).status===404);check((await handlers.read(request(o.operationId,seller.tokens.agent),o.operationId)).status===404);
const confirm=fileId=>handlers.confirm(request(o.operationId,seller.tokens.agent,{attemptId,versionId,fileId},'/confirm'),o.operationId);
check((await confirm('image')).status===409);objects.set(key(saved.buyerOwnerId,marketFileStorageVersion(saved),files[0]),{...files[0],sha256:'f'.repeat(64)});check((await confirm('image')).status===409);
for(const file of files){objects.set(key(saved.buyerOwnerId,marketFileStorageVersion(saved),file),file);check((await confirm(file.id)).status===200);}
check((await confirm('image')).status===200);
const completed=await market.transact(s=>s.orders[0]);assertMarketFileDeliveryComplete(completed);tests++;validateMarketState(await market.transact(s=>s));tests++;
await assert.rejects(()=>sellerOrderAction(seller.agent,o.operationId,{action:'deliver',attemptId,text:'File receipt'}),e=>e.code==='FILE_MANIFEST_REQUIRED');tests++;
await assert.rejects(()=>sellerOrderAction(seller.agent,o.operationId,{action:'deliver',attemptId,text:'File receipt',manifestHash:'e'.repeat(64)}),e=>e.code==='FILE_MANIFEST_CONFLICT');tests++;
check((await sellerOrderAction(seller.agent,o.operationId,{action:'deliver',attemptId,text:'File receipt',manifestHash:completed.fileDelivery.manifestHash})).phase==='delivered');
check((await handlers.prepare(request(o.operationId,seller.tokens.agent,{...manifest,files:[{...files[0],sha256:'e'.repeat(64)}]}),o.operationId)).status===409);
const read=await handlers.read(request(o.operationId,buyer.tokens.agent),o.operationId);check(read.status===200);check((await read.json()).delivery.files.every(f=>f.url&&f.integrity==='stored-bytes-verified'));
check(process.env.BAZAAR_MARKET_FILES_ENABLED==='false');
// Reconstructing the store preserves recovery while new file admission is off.
const recoveredStore=createMarketStore(redis,marketPrefix),recovered=createMarketFileHandlers({store:()=>recoveredStore,objects:()=>storage});
check((await recovered.read(request(o.operationId,buyer.tokens.human),o.operationId)).status===200);
setMarketStorageProbeForTests(undefined);
// Time travel isolates file expiry from the independent monotonic admission clock.
const restoreNow=Date.now;process.env.BAZAAR_PUBLIC_DEMO='false';try{Date.now=()=>Date.parse(o.createdAt)+MARKET_CONTENT_RETENTION_MS;check((await handlers.read(request(o.operationId,buyer.tokens.human),o.operationId)).status===410);check((await confirm('image')).status===410);await removeExpiredMarketFiles(completed,storage);check(objects.size===0);}finally{Date.now=restoreNow;process.env.BAZAAR_PUBLIC_DEMO='true';}
// External delivery is never fetched or labelled byte-verified by Bazaar.
const externalCard={...baseCard,id:'external-video',delivery:{...baseCard.delivery,storage:{mode:'external',maxFiles:2}}},external=order(externalCard),extVersion=randomUUID(),extAttempt=randomUUID();
await market.transact(s=>{Object.assign(external,{phase:'executing',settlementAttemptId:randomUUID(),transactionHash:'b'.repeat(64),paymentVerifiedAt:new Date().toISOString(),attemptId:extAttempt,agentId:seller.agent.agentId});s.orders.push(external);});
const extManifest={attemptId:extAttempt,versionId:extVersion,files:[{...files[0],url:'https://provider.example/synthetic.png'}]};
const invalidExternal=await handlers.prepare(request(external.operationId,seller.tokens.agent,{...extManifest,files:[{...extManifest.files[0],url:'https://evil.example/a'}]}),external.operationId);assert.equal(invalidExternal.status,400,JSON.stringify(await invalidExternal.json()));tests++;
const extResponse=await handlers.prepare(request(external.operationId,seller.tokens.agent,extManifest),external.operationId);check(extResponse.status===200);check((await extResponse.json()).integrity==='provider-declared');
const extRead=await handlers.read(request(external.operationId,buyer.tokens.human),external.operationId);check((await extRead.json()).delivery.files[0].integrity==='provider-declared');
// Credentials revoked during HEAD must not mark the stored file available.
objects.set(key(saved.buyerOwnerId,marketFileStorageVersion(saved),files[0]),files[0]);
revokeOnVerify=true;const revoked=await confirm('image');assert.equal(revoked.status,409,JSON.stringify(await revoked.json()));tests++;check((await confirm('image')).status===401);
// The content-free archived control reveals expiration only to its buyer.
await market.transact(state=>{const expired=state.orders.find(value=>value.operationId===o.operationId);state.archived??=[];state.archived.push(marketRecoveryRecord(expired));state.orders=state.orders.filter(value=>value.operationId!==o.operationId);});
const beforeArchivedRead=downloads,archivedRead=await handlers.read(request(o.operationId,buyer.tokens.human),o.operationId);
check(archivedRead.status===410);check((await archivedRead.json()).error.code==='DELIVERY_EXPIRED');
check((await handlers.read(request(o.operationId,other.tokens.agent),o.operationId)).status===404);check(downloads===beforeArchivedRead);
process.env.BAZAAR_MARKET_FILES_ENABLED='false';check(marketFileCapabilities().enabled===false);
// Actual SDK signing, with synthetic credentials and no network connection.
const sdk=new S3Client({region:'auto',endpoint:'https://r2-fixture.example',credentials:{accessKeyId:'SYNTHETIC',secretAccessKey:'synthetic-offline-only'},forcePathStyle:true,maxAttempts:1}),privateS3=createPrivateS3(sdk,'synthetic-bucket',{keyPrefix:'market-deliveries/v1/local/'+'a'.repeat(32)}),deadline=Date.now()+6000;
const signed=await privateS3.upload(buyer.agent.ownerId,o.operationId+':'+versionId,files[0],deadline),signedUrl=new URL(signed.url);
check(Number(signedUrl.searchParams.get('X-Amz-Expires'))<=6);check(signedUrl.searchParams.get('X-Amz-SignedHeaders').includes('content-length'));check(signed.headers['content-length']==='32');
check(signedUrl.searchParams.get('X-Amz-SignedHeaders').includes('content-type'));check(signedUrl.searchParams.get('X-Amz-SignedHeaders').includes('if-none-match'));check(signedUrl.searchParams.get('X-Amz-SignedHeaders').includes('x-amz-checksum-sha256'));
const signedGet=await privateS3.access(buyer.agent.ownerId,o.operationId+':'+versionId,files[0],false,deadline);check(Date.parse(signedGet.expiresAt)<=deadline);check(!signedGet.url.includes(buyer.agent.ownerId));
await assert.rejects(()=>privateS3.access(buyer.agent.ownerId,versionId,files[0],false,Date.now()),e=>e.code==='DELIVERY_EXPIRED');tests++;
let deletions=0;sdk.send=async command=>{if(command.constructor.name==='HeadObjectCommand'){const missing=Error('Synthetic missing object');missing.name='NotFound';missing.$metadata={httpStatusCode:404};throw missing;}deletions++;return {};};
await assert.rejects(()=>privateS3.verify(buyer.agent.ownerId,versionId,files[0]),e=>e.code==='FILE_NOT_UPLOADED');tests++;
await assert.rejects(()=>privateS3.removeKey('market-deliveries/v1/production/'+'b'.repeat(32)+'/'+'a'.repeat(64)+'/'+'b'.repeat(64)+'/'+'c'.repeat(64)),e=>e.code==='INVALID_CLEANUP_KEY');tests++;check(deletions===0);
await privateS3.removeKey(privateS3.cleanupKey(buyer.agent.ownerId,versionId,files[0].id));check(deletions===1);sdk.destroy();
// Advance the controlled clock while the real SDK asynchronously resolves its
// credentials. The signature and reported expiry must retain their start time.
const clock=Date.now;
async function delayedSigning(method,advance,expiresAfter){
 const start=clock();let resolved=false;
 Date.now=()=>start;
 const delayedSdk=new S3Client({region:'auto',endpoint:'https://r2-fixture.example',credentials:async()=>{await Promise.resolve();resolved=true;Date.now=()=>start+advance;return {accessKeyId:'SYNTHETIC',secretAccessKey:'synthetic-offline-only'};},forcePathStyle:true,maxAttempts:1});
 try{
  const adapter=createPrivateS3(delayedSdk,'synthetic-bucket');
  const result=await(method==='upload'?adapter.upload(buyer.agent.ownerId,versionId,files[0],start+expiresAfter):adapter.access(buyer.agent.ownerId,versionId,files[0],false,start+expiresAfter));
  check(resolved);check(Date.parse(result.expiresAt)<=start+expiresAfter);
  const date=new URL(result.url).searchParams.get('X-Amz-Date');check(date===new Date(start).toISOString().replace(/[-:]|\.\d{3}/g,''));
 }finally{Date.now=clock;delayedSdk.destroy();}
}
await delayedSigning('upload',4000,6000);await delayedSigning('access',4000,6000);
await assert.rejects(()=>delayedSigning('access',6000,5000),e=>e.code==='DELIVERY_EXPIRED'&&e.status===410);tests++;
console.log(JSON.stringify({status:'PASS',tests,realPublicWorkspaceModel:true,realRedis:false,realR2:false,payment:'simulated',networkRequests:0,checks:['atomic account/global admission reservations','unreachable R2 rejects admission before byte/metadata reservation','closed file admission preserves replay/claim/upload/confirm/read and persisted recovery','expired objects retain quota','prepaid upload forbidden','seller claim binding','buyer-only file access','archived expiry 410 for buyer and 404 for another owner without storage grants','HEAD integrity','immutable manifest and lost-response recovery','manifest required for final delivery','fixed seven-day expiry','external delivery declared only','revocation during verification','signed PUT MIME/size/checksum/conditional-write binding','async signing cannot renew or outlive deadline','cleanup scope isolation']}));
