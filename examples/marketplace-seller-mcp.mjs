import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createSellerCard,sellerHash,sellerCanonical} from './seller-service-card.mjs';
import {withSellerMcp,validateSellerConfiguration,sellerSetupConfiguration,sellerBazaarOrigin} from './seller-mcp-transport.mjs';
export {withSellerMcp,validateSellerConfiguration,sellerSetupConfiguration,sellerBazaarOrigin,SELLER_BAZAAR_ORIGIN,SELLER_BAZAAR_ENDPOINT} from './seller-mcp-transport.mjs';
import {createSellerHttpAdapter} from './seller-http-adapter.mjs';
import {createSellerIntent,validateSellerIntent,sellerUuid,sellerTool,listSellerOrders,listSellerServices,inspectSellerIntent,claimSellerIntent,executeSellerIntent,deliverSellerIntent,failSellerIntent,recoverSellerIntent,uncertainSellerIntent,watchSellerOrders,readSellerJournal} from './seller-marketplace-worker.mjs';

async function publicJson(path){const raw=await readFile(path);if(raw.length>65536)throw Error('CONFIG_TOO_LARGE');return JSON.parse(raw.toString('utf8'));}
export function parseSellerCliArguments(argv){
 const args=[...argv];if(args.filter(value=>value==='--secret-stdin').length>1||args.filter(value=>value==='--origin').length>1)throw Error('INVALID_OPTION');
 const pipe=args.includes('--secret-stdin');if(pipe)args.splice(args.indexOf('--secret-stdin'),1);
 let origin;const at=args.indexOf('--origin');
 if(at>=0){origin=sellerBazaarOrigin(args[at+1]);args.splice(at,2);if(args[0]!=='setup')throw Error('ORIGIN_SETUP_ONLY');}
 if(args.some(value=>value.startsWith('--')))throw Error('INVALID_OPTION');
 return {args,pipe,origin};
}
function publicSummary(value){return {operationId:value.operationId,phase:value.phase,localPhase:value.localPhase,submissionId:value.submissionId,status:value.status};}
async function main(){
 const {args,pipe,origin}=parseSellerCliArguments(process.argv.slice(2));const [command,directory,argument,reason]=args;
 if(command==='card'){
  if(!directory||!argument)throw Error('Use: card <public-definition.json> <new-card.json>');const result=createSellerCard(await publicJson(directory));await writeFile(argument,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({cardHash:result.cardHash,serviceId:result.card.id}));return;
 }
 if(!['setup','list','services','submit','submission','prepare','inspect','claim','execute','deliver','fail','recover','uncertain','watch'].includes(command)||!directory)throw Error('INVALID_COMMAND');
 const {readPrivateInput}=await import('./buyer-private-input.mjs');const {openPortableSecretStore}=await import('./buyer-portable-secret-store.mjs');
 let secret,password;
 if(pipe){const raw=await readPrivateInput({allowPipe:true});try{secret=JSON.parse(raw.toString('utf8'));password=Buffer.from(secret.password??'');delete secret.password;}finally{raw.fill(0);}}
 else{password=await readPrivateInput({prompt:'Store password: '});}
 const store=await openPortableSecretStore({directory,password,create:command==='setup'});password.fill(0);
 try{
  if(command==='setup'){
   const publicConfig=sellerSetupConfiguration(await publicJson(argument),origin);if(['agentAccess','providerAccess','password'].some(k=>k in publicConfig))throw Error('PUBLIC_CONFIGURATION_CONTAINS_SECRET');
   if(!secret){const access=await readPrivateInput({prompt:'Own agent Bearer: '});const provider=await readPrivateInput({prompt:'Own runtime Bearer: '});secret={agentAccess:access.toString('utf8'),providerAccess:provider.toString('utf8')};access.fill(0);provider.fill(0);}
   if(!/^[a-zA-Z0-9_-]{43}$/.test(secret.agentAccess??'')||!/^[a-zA-Z0-9_-]{43}$/.test(secret.providerAccess??''))throw Error('SECRET_CONFIGURATION_REQUIRED');
   await store.write('seller-config',{...publicConfig,agentAccess:secret.agentAccess,providerAccess:secret.providerAccess},{createOnly:true});console.log('Saved encrypted seller configuration. No remote requests.');return;
  }
  const config=validateSellerConfiguration(await store.read('seller-config'));
  const prepare=async operationId=>{
   const intent=createSellerIntent({operationId,cardHash:config.cardHash,serviceId:config.card.id,providerOrigin:config.card.url,providerRoute:config.card.routeTemplate,ownerId:config.ownerId,agentId:config.agentId});const release=await store.acquireLock('seller.'+operationId);try{await store.journal('seller.'+operationId).initialize(intent);return intent;}finally{await release();}
  };
  if(command==='prepare'){await prepare(argument);console.log(JSON.stringify({operationId:argument,phase:'prepared'}));return;}
  await withSellerMcp({agentAccess:config.agentAccess,origin:config.bazaarOrigin,maxRequests:command==='watch'?100:30},async transport=>{
   if(command==='list'){const {orders,nextCursor}=await listSellerOrders(transport,{cursor:argument});console.log(JSON.stringify({orders:orders.map(v=>({operationId:v.operationId,serviceId:v.serviceId,phase:v.phase,paymentVerified:Boolean(v.paymentVerifiedAt)})),nextCursor}));return;}
   if(command==='services'){const {services,nextCursor}=await listSellerServices(transport,{cursor:argument});console.log(JSON.stringify({services:services.map(v=>({serviceId:v.card.id,cardHash:v.cardHash,status:v.status,purchase:v.purchase})),nextCursor}));return;}
   if(command==='inspect'){
    if(!sellerUuid.test(argument??''))throw Error('OPERATION_ID_REQUIRED');const intent=validateSellerIntent(await store.journal('seller.'+argument).read());const order=await inspectSellerIntent(intent,transport);console.log(JSON.stringify({operationId:intent.operationId,localPhase:intent.phase,phase:order?.phase,textFrozen:Boolean(intent.textHash),paymentVerified:Boolean(order?.paymentVerifiedAt)}));return;
   }
   if(['submit','submission'].includes(command)){
    const release=await store.acquireLock('seller.submission');try{
     const journal=store.journal('seller.submission');let packet=await readSellerJournal(journal);
     if(!packet){if(command!=='submit')throw Error('NO_PREPARED_SUBMISSION');packet={version:1,submissionId:randomUUID(),card:config.card,cardHash:config.cardHash,controlProof:config.controlProof,phase:'prepared'};await journal.initialize(packet);}
     if(packet.cardHash!==config.cardHash||sellerHash(sellerCanonical(packet.card))!==packet.cardHash)throw Error('SUBMISSION_CHANGED');
     if(command==='submit'){
      if(!['prepared','submit-started','submission-unconfirmed'].includes(packet.phase))throw Error('SUBMISSION_ALREADY_SENT');packet.phase='submit-started';await journal.append(packet);
      const {submission}=await sellerTool(transport,'submit_market_service',{submissionId:packet.submissionId,card:packet.card,controlProof:packet.controlProof});packet={...packet,phase:'submitted',submission};await journal.append(packet);console.log(JSON.stringify({submissionId:packet.submissionId,status:submission?.status??'submitted',control:submission?.control}));
     }else{const {submission}=await sellerTool(transport,'get_market_submission',{submissionId:packet.submissionId});await journal.append({...packet,phase:submission.status==='submission-unconfirmed'?'submission-unconfirmed':'submitted',submission});console.log(JSON.stringify({submissionId:packet.submissionId,status:submission.status,control:submission.control}));}
    }finally{await release();}return;
   }
   let fetcher=fetch;
   // Optional protection belongs to the participant, through an explicitly trusted module.
   if(config.providerFetchModule){const own=await import(pathToFileURL(resolve(config.providerFetchModule)).href);fetcher=await own.createFetch({configuration:config.providerProtection});}
   const adapter=createSellerHttpAdapter({providerOrigin:config.card.url,route:config.card.routeTemplate,allowedOrigins:config.allowedOrigins,providerAccess:config.providerAccess,fetcher});
   const action=async(operationId,selected)=>{
    if(!sellerUuid.test(operationId??''))throw Error('OPERATION_ID_REQUIRED');const name='seller.'+operationId;const release=await store.acquireLock(name);
    try{const journal=store.journal(name);const intent=validateSellerIntent(await journal.read());const options={...transport,adapter,persistIntent:value=>journal.append(value)};
     if(intent.ownerId!==config.ownerId||intent.agentId!==config.agentId||intent.cardHash!==config.cardHash)throw Error('INTENT_CONFIGURATION_CHANGED');
     const result=selected==='claim'?await claimSellerIntent(intent,options):selected==='execute'?await executeSellerIntent(intent,options):selected==='deliver'?await deliverSellerIntent(intent,options):selected==='fail'?await failSellerIntent(intent,options,reason):selected==='recover'?await recoverSellerIntent(intent,options):await uncertainSellerIntent(intent,options,reason);
     return publicSummary({...result,localPhase:intent.phase});
    }finally{await release();}
   };
   if(command==='watch'){
    const watchRelease=await store.acquireLock('seller.watch');try{
     const scanJournal=store.journal('seller.scan');let scan=await readSellerJournal(scanJournal),nextCursor;
     if(scan&&(scan.version!==1||scan.cursor!==null&&typeof scan.cursor!=='string'))throw Error('INVALID_SCAN_STATE');
     if(!scan){scan={version:1,cursor:null};await scanJournal.initialize(scan);}
     const result=await watchSellerOrders({polls:Number(argument??10),poll:async()=>{const page=await listSellerOrders(transport,{cursor:scan.cursor??undefined});nextCursor=page.nextCursor;return page.orders.filter(v=>v.serviceId===config.card.id);},afterPage:async()=>{scan={version:1,cursor:nextCursor};await scanJournal.append(scan);},processOrder:async order=>{const name='seller.'+order.operationId;if(await readSellerJournal(store.journal(name)))throw Error('EXISTING_INTENT_REQUIRES_RECOVERY');await prepare(order.operationId);await action(order.operationId,'execute');},sleep:ms=>new Promise(r=>setTimeout(r,ms))});console.log(JSON.stringify({...result,nextCursor:scan.cursor,mcpRequests:transport.requestCount()}));
    }finally{await watchRelease();}return;
   }
   console.log(JSON.stringify(await action(argument,command)));
  });
 }finally{store.dispose();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(JSON.stringify({error:error.httpStatus===429?'QUOTA_STOP_RESPECT_RETRY_AFTER':'ACTION_UNCONFIRMED',retryAfter:error.retryAfter,message:'Preserve encrypted state. Recover the same operation; do not execute or pay again.'}));process.exitCode=1;});
