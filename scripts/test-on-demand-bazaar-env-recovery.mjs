import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,relative,sep,isAbsolute} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {onDemandProductionV3Plan} from '../.vercel/on-demand-production-v3-control.mjs';
import {pendingOriginalBazaarEnvironment,recoverOriginalBazaarEnvironment,safeEnvironmentCliDiagnostic} from '../.vercel/on-demand-production-v3-bazaar-env-recovery.mjs';
import {sellerCanonical} from '../examples/seller-service-card.mjs';
import {v2ProjectWafProtections,v2WafHash} from './prepare-on-demand-production-v3-waf.mjs';
const root=process.cwd(),current=await onDemandProductionV3Plan(root),plan=current.plan,now=Date.now(),sha=b=>createHash('sha256').update(b).digest('hex'),canon=sellerCanonical;
const ctx={binding:'d'.repeat(64),bazaar:{BAZAAR_MARKET_BUYER_ALLOWLIST_JSON:'["offline-private-owner"]',CRON_SECRET:'c'.repeat(43),BAZAAR_TEXT_SELLER_WAKE_TOKEN:'w'.repeat(43)},derived:{BAZAAR_TEXT_SELLER_OWNER_FINGERPRINT:'f'.repeat(64)}};
const desired={...plan.environment.bazaar,...ctx.bazaar,...ctx.derived},keys=Object.keys(desired),approval={approvedPlanHash:plan.planHash,approvedReviewHash:plan.proposalHash};
let checks=0,net=0;const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{net++;throw Error('REAL_NETWORK_FORBIDDEN');};const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const controller=await readFile('.vercel/on-demand-production-v3-control.mjs');
const waf={ownerId:'offline-team',crs:{active:false},firewallEnabled:true,changes:[],ips:[],projectKey:plan.projects.bazaar+'#active',version:1,id:'offline-config',updatedAt:now,rules:[{id:'rule_offline',name:'Offline maintenance',description:'Offline full block',active:true,conditionGroup:[{conditions:[{type:'path',op:'re',value:'^'}]}],action:{mitigate:{action:'deny'}}}]};
async function fixture({complete=false,lostAfter,unrelated=false}={}){
 const dir=resolve(root,'.vercel/on-demand-env-recovery-test-'+randomUUID());await mkdir(resolve(dir,'.vercel'),{recursive:true});await mkdir(resolve(dir,'docs/evidence'),{recursive:true});await writeFile(resolve(dir,'.vercel/on-demand-production-v3-control.mjs'),controller);
 let rows=['BAZAAR_WORKSPACE_REDIS_REST_TOKEN','BAZAAR_REVIEW_REDIS_REST_TOKEN','BAZAAR_MARKET_OPERATOR_HASH'].map((key,i)=>({key,id:'unrelated_'+i,type:'sensitive',target:['production'],updatedAt:now-20000}));
 const preserved=rows.map(r=>({...r,gitBranch:null,customEnvironmentIds:[]})).sort((a,b)=>a.key.localeCompare(b.key));
 for(const[key,value]of Object.entries(desired)){const sensitive=Object.hasOwn(ctx.bazaar,key),index=keys.indexOf(key);if(complete||index<37||sensitive&&key!=='BAZAAR_TEXT_SELLER_WAKE_TOKEN')rows.push({key,id:'own_'+index,type:sensitive?'sensitive':'plain',...(sensitive?{}:{value}),target:['production'],updatedAt:sensitive&&!complete?now-20000:now-9000});}
 if(unrelated)rows[0].updatedAt++;
 const intent={version:1,planHash:plan.planHash,reviewHash:plan.proposalHash,privateEnvironmentHash:sha(canon(desired)),keys,deadlineEnvIdRemoved:null,preservedReferences:preserved,at:new Date(now-10000).toISOString()};
 const files={
 '.vercel/on-demand-v3-production-bazaar-environment-intent.json':intent,
 'docs/evidence/on-demand-production-v3-seller-storage-2026-10-12.json':{status:'PASS_EXISTING_SCOPED_PRODUCTION_SELLER_STORAGE',durableBindingFingerprint:ctx.binding},
 'docs/evidence/on-demand-production-v3-storage-inventory-2026-10-12.json':{status:'PASS_PRODUCTION_STORAGE_INITIALIZED',maximumBytes:200000000,technicalReserveBytes:20000000,legacyWritersDrained:true,payments:0},
 'docs/evidence/on-demand-preview-v2-acceptance-2026-10-11.json':{status:'PASS_PROTECTED_ON_DEMAND_PREVIEW',bazaarSourceDigest:'54235252ccb9022247cfa579ca99c82af5bf84ce8444d334c006bc50ce2e9e76',providerSourceDigest:plan.sourcePins.provider.sourceDigest,payments:0,privateIsolationVerified:true},
 'docs/evidence/on-demand-upstash-free-current-v3-2026-10-12.json':{status:'FREE_CONFIRMED_READ_ONLY',plan:'Free Tier',subscriptionChanged:false,paymentMethodSubmitted:false,newPayments:0,observedAt:new Date().toISOString(),commandsUsed:80000,commandsUsedObserved:32000,commandsRemainingConservative:420000,priorConsumptionEvidence:{historicalHighest:47000,previewCommandReservations:27808,conservativeFloor:74808}},
 '.vercel/on-demand-v3-production-waf-drain-bazaar-activation-receipt.json':{phase:'drain',kind:'bazaar',productionPlanHash:plan.planHash,productionReviewHash:plan.proposalHash,expectedProtectionsHash:v2WafHash(v2ProjectWafProtections(waf,'bazaar'))}
 };for(const[path,value]of Object.entries(files))await writeFile(resolve(dir,path),JSON.stringify(value));
 const calls=[],writes=[];let privateReads=0;const command=async(args,input)=>{calls.push(args);const path=args[1],method=args[args.indexOf('--method')+1];
  if(method==='POST'){const packet=JSON.parse(input);eq(packet.target,['production']);eq(packet.value,desired[packet.key]);eq(packet.type,Object.hasOwn(ctx.bazaar,packet.key)?'sensitive':'plain');eq(keys.includes(packet.key),true);writes.push(packet.key);let row=rows.find(r=>r.key===packet.key);if(!row){row={id:'new_'+packet.key,key:packet.key};rows.push(row);}Object.assign(row,{target:['production'],type:packet.type,updatedAt:now+1,...(packet.type==='plain'?{value:packet.value}:{})});if(writes.length===lostAfter)throw Error('LOST_ACK_OFFLINE');return {};}
  eq(method,'GET');if(path.includes('/v13/deployments/'))return {id:plan.oldDeploymentIds.bazaar,projectId:plan.projects.bazaar,target:'production',readyState:'READY',alias:[new URL(plan.origins.bazaar).hostname]};
  if(path.includes('/firewall/config/active'))return waf;if(path.includes('/env?'))return {envs:structuredClone(rows)};
  return {id:plan.projects.bazaar,accountId:plan.teamId,crons:{deploymentId:plan.oldDeploymentIds.bazaar,definitions:[]}};
 };
 return {dir,rows,intent,calls,writes,deps:{planResolver:async()=>current,command,privateContext:async()=>{privateReads++;return ctx;}},privateReads:()=>privateReads,cleanup:async()=>{const r=relative(root,dir);if(!r.startsWith('.vercel'+sep+'on-demand-env-recovery-test-')||isAbsolute(r)||r.includes('..'))throw Error('OWN_FIXTURE_CLEANUP_ONLY');await rm(dir,{recursive:true});}};
}
try{
 const f=await fixture();try{
  const before=pendingOriginalBazaarEnvironment(plan,f.intent,ctx,{envs:f.rows});eq(before.pending.length,10);eq(before.pending.includes('BAZAAR_TEXT_SELLER_MODE'),true);eq(before.pending.includes('BAZAAR_ENABLE_MARKET_PURCHASES'),false);
  const inspect=await recoverOriginalBazaarEnvironment('inspect',approval,f.dir,f.deps);eq(inspect.pendingKeys.length,10);eq(f.writes.length,0);eq(f.calls.length,4);
  const resume=await recoverOriginalBazaarEnvironment('resume',approval,f.dir,f.deps);eq(resume.environmentWrites,10);eq(f.writes,before.pending);eq(resume.productionPublished,false);const receipt=JSON.parse(await readFile(resolve(f.dir,'.vercel/on-demand-v3-production-bazaar-environment-receipt.json'),'utf8'));eq(receipt.privateEnvironmentHash,f.intent.privateEnvironmentHash);eq(receipt.environmentReferences.some(r=>'value'in r),false);
  await assert.rejects(()=>recoverOriginalBazaarEnvironment('resume',approval,f.dir,f.deps),/ENVIRONMENT_ONLY_BEFORE_ORIGINAL_BAZAAR_UPLOAD/);checks++;
 }finally{await f.cleanup();}
 for(const lostAfter of [1,10]){const f=await fixture({lostAfter});try{await assert.rejects(()=>recoverOriginalBazaarEnvironment('resume',approval,f.dir,f.deps),/LOST_ACK_OFFLINE/);checks++;const count=f.writes.length;if(lostAfter===10){const recovered=await recoverOriginalBazaarEnvironment('confirm',approval,f.dir,f.deps);eq(recovered.environmentWrites,0);eq(recovered.recoveredOriginalReceipt,true);}else{await assert.rejects(()=>recoverOriginalBazaarEnvironment('confirm',approval,f.dir,f.deps),/ENVIRONMENT_CONTINUATION_PARTIAL_CONFIRM_ONLY/);checks++;await assert.rejects(()=>recoverOriginalBazaarEnvironment('resume',approval,f.dir,f.deps),/EXISTING_CONTINUATION_CONFIRM_READ_ONLY/);checks++;}eq(f.writes.length,count);}finally{await f.cleanup();}}
 const all=await fixture({complete:true});try{const recovered=await recoverOriginalBazaarEnvironment('confirm',approval,all.dir,all.deps);eq(recovered.environmentWrites,0);eq(all.writes.length,0);}finally{await all.cleanup();}
 const wrong=await fixture({unrelated:true});try{await assert.rejects(()=>recoverOriginalBazaarEnvironment('resume',approval,wrong.dir,wrong.deps),/UNRELATED_PRODUCTION_ENVIRONMENT_CHANGED/);checks++;eq(wrong.writes.length,0);}finally{await wrong.cleanup();}
 const diag=safeEnvironmentCliDiagnostic(['api','/own/env','--method','POST'],1,Buffer.from(JSON.stringify({error:{code:'too_many_requests',statusCode:429,retryAfter:60,message:ctx.bazaar.CRON_SECRET}})),JSON.stringify({key:'CRON_SECRET',value:ctx.bazaar.CRON_SECRET}));eq(diag,{category:'environment-upsert',method:'POST',cliExitCode:1,apiErrorCode:'too_many_requests',environmentKey:'CRON_SECRET',httpStatus:429,retryAfterSeconds:60});eq(JSON.stringify(diag).includes(ctx.bazaar.CRON_SECRET),false);
 eq(safeEnvironmentCliDiagnostic(['api','/own','--method','GET'],1,Buffer.from(JSON.stringify({error:{code:ctx.bazaar.CRON_SECRET,message:'secret'}}))).apiErrorCode,'UNCONFIRMED');
 eq(net,0);console.log(JSON.stringify({status:'PASS_OFFLINE_ORIGINAL_ENVIRONMENT_RECOVERY',checks,networkRequests:0,privateProfileFilesRead:0,simulatedPendingWrites:10,confirmNeverWrites:true,unknownPartialNeverAutomaticallyRetried:true,privateValuesInOutput:0,productionPublished:false,payments:0}));
}finally{globalThis.fetch=oldFetch;}
