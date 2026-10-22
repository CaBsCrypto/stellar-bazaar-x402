import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,sep,isAbsolute} from 'node:path';
import {onDemandPreviewControl,previewPlan,matchDeployment,previewOrigin,retainedProviderBinding,parsePreviewCliResponse} from '../.vercel/on-demand-preview-control.mjs';
import {config} from './fixtures/seller-hosted.mjs';
import {sourceDigest} from './prepare-functional-preview-source.mjs';
import {validateFreeProviderProfile} from '../.vercel/free-demo-provider-preview-control.mjs';

const root=resolve(process.cwd()),base=await previewPlan(root),sha=b=>createHash('sha256').update(b).digest('hex');
const fixture=await mkdtemp(resolve(root,'.vercel/on-demand-preview-controller-test-'));
const sellerProfile={purpose:'bazaar-hosted-seller-preview',prefix:'bazaar-seller:preview-2dea99ac5bc7c7b0896f57f97d94adaa',aclValidation:{status:'PASS'},redisUrl:'https://smooth-dory-323957.upstash.io',redisToken:'SYNTHETIC_SCOPED_REDIS_TOKEN_ONLY',key:'k'.repeat(43),cronSecret:'c'.repeat(43),bazaarProtection:'b'.repeat(43),providerProtection:'p'.repeat(43),config};
// Same safe projection as the original existing profile: it is not already
// normalized. An old namespace and true purchase flags are replaced with the
// exact closed synthetic baseline before any environment plan is created.
const bazaarProfile={purpose:'continuous-bazaar-review-preview',overrides:{...base.baseline.overrides,BAZAAR_WORKSPACE_PREFIX:'bazaar-workspace:pilot-synthetic-original',BAZAAR_MARKET_PREFIX:'bazaar-market:pilot-synthetic-original',BAZAAR_REVIEW_PREFIX:'bazaar-review:pilot-synthetic-original',BAZAAR_ENABLE_MARKET_PURCHASES:'true',BAZAAR_MARKET_FILES_ENABLED:'true',X402_ENABLE_LOCAL_PAYER:'true'}};
let checks=0,realNetworkRequests=0;const oldFetch=globalThis.fetch;globalThis.fetch=()=>{realNetworkRequests++;throw Error('OFFLINE_FIXTURE_ONLY');};
try{
 const wrapper=await readFile('.vercel/on-demand-preview-control.ps1','utf8'),oldWrapper=await readFile('.vercel/free-demo-bazaar-preview-control.ps1','utf8');
 const safeProjection=text=>text.match(/\$taskSafeKeys=@\(([^\n]+)\)/)?.[1];assert.equal(safeProjection(wrapper),safeProjection(oldWrapper));assert.ok(!safeProjection(wrapper).includes('X402_PAYER_SECRET'));checks++;
 const deletion=['api','/v9/projects/'+base.plan.projectIds.provider+'/env/old_deadline_p?teamId='+base.plan.teamId,'--raw','--method','DELETE'];assert.equal(parsePreviewCliResponse(deletion,0,Buffer.alloc(0)).emptyDeleteAcknowledged,true);checks++;
 for(const args of [[...deletion.slice(0,-1),'POST'],[...deletion.slice(0,-1),'GET'],['deploy'],['api','/v9/projects/foreign/env/id','--method','DELETE']]){assert.throws(()=>parsePreviewCliResponse(args,0,Buffer.alloc(0)),/PREVIEW_UNCONFIRMED/);checks++;}
 assert.throws(()=>parsePreviewCliResponse(deletion,1,Buffer.alloc(0)),/PREVIEW_UNCONFIRMED/);checks++;
 await mkdir(resolve(fixture,'docs/evidence'),{recursive:true});await mkdir(resolve(fixture,'.vercel'),{recursive:true});
 const sources={};
 for(const kind of ['bazaar','provider']){
  const sourceDirectory='.vercel/continuous-on-demand-'+kind+'-preview-source';await mkdir(resolve(fixture,sourceDirectory),{recursive:true});
  const files=[];for(const [path,value]of [['vercel.json',JSON.stringify({crons:[]})],['package.json',JSON.stringify({name:'synthetic-'+kind})]]){const b=Buffer.from(value);await writeFile(resolve(fixture,sourceDirectory,path),b);files.push({path,bytes:b.length,sha256:sha(b)});}
  const digest=sourceDigest(files);sources[kind]={kind,environment:'preview',sourceDirectory,sourceDigest:digest,manifestSha256:sha(kind),candidate:'synthetic-'+kind,files:2,manifestValue:{files}};
 }
 const plan={...base.plan,sources:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,{sourceDigest:v.sourceDigest}]))},current={plan,sources,baseline:base.baseline};
 let calls=[],rows={bazaar:[{id:'old_deadline_b',key:'BAZAAR_FREE_DEMO_ADMISSION_UNTIL',target:['preview'],type:'plain',value:'2026-10-12T00:00:00.000Z'}],provider:[{id:'old_deadline_p',key:'BAZAAR_FREE_DEMO_ADMISSION_UNTIL',target:['preview'],type:'plain',value:'2026-10-12T00:00:00.000Z'}]},deployments=[],loseDeployAck=false,failProviderEnvOnce=false;
 const command=async(args,input)=>{
  calls.push({args:[...args],input});
  assert.ok(!args.join(' ').includes(sellerProfile.redisToken));assert.ok(!args.join(' ').includes(sellerProfile.cronSecret));
  if(args[0]==='deploy'){
   const arg=name=>args[args.indexOf(name)+1],pid=arg('--project'),kind=pid===plan.projectIds.bazaar?'bazaar':'provider';assert.equal(arg('--target'),'preview');checks++;
   const meta={};for(let i=0;i<args.length;i++)if(args[i]==='--meta'){const pair=args[++i],at=pair.indexOf('=');meta[pair.slice(0,at)]=pair.slice(at+1);}
   const d={id:'dpl_Fake'+(deployments.length+1),projectId:pid,target:null,url:kind==='bazaar'?'stellar-bazaar-x402-fake'+(deployments.length+1)+'-cabscryptocontacto-6028s-projects.vercel.app':'ai-video-scriptwriter-fake'+(deployments.length+1)+'-cabscryptocontacto-6028s-projects.vercel.app',crons:[],readyState:'READY',meta};deployments.push(d);if(loseDeployAck){loseDeployAck=false;throw Error('SYNTHETIC_RESPONSE_LOST');}return {id:d.id};
  }
  assert.equal(args[0],'api');const path=args[1],method=args[args.indexOf('--method')+1];
  if(path.startsWith('/v13/deployments/')){assert.equal(method,'GET');const id=path.split('/')[3].split('?')[0];return deployments.find(d=>d.id===id);}
  if(path.startsWith('/v6/deployments?')){assert.equal(method,'GET');return {deployments};}
  const kind=path.includes(plan.projectIds.provider)?'provider':'bazaar',pid=plan.projectIds[kind];
  if(!path.includes('/env')){assert.equal(method,'GET');return {id:pid,accountId:plan.teamId,ssoProtection:{deploymentType:'all_except_custom_domains'}};}
  if(method==='GET')return {envs:rows[kind].map(r=>({...r}))};
  if(method==='DELETE'){const id=path.split('/env/')[1].split('?')[0];assert.ok(id.startsWith('old_deadline_'));assert.ok(args.includes('--dangerously-skip-permissions'));rows[kind]=rows[kind].filter(r=>r.id!==id);return {};}
  assert.equal(method,'POST');assert.equal(args.at(-1),'-');assert.ok(!args.includes('--dangerously-skip-permissions'));if(kind==='provider'&&failProviderEnvOnce){failProviderEnvOnce=false;throw Error('SYNTHETIC_BEFORE_FIRST_ENV_UPSERT');}const value=JSON.parse(input);assert.deepEqual(value.target,['preview']);assert.ok(!['BAZAAR_WORKSPACE_REDIS_REST_TOKEN','BAZAAR_REVIEW_REDIS_REST_TOKEN','X402_PAYER_SECRET'].includes(value.key));checks++;
  if(kind==='provider'&&value.key==='BAZAAR_HOSTED_SELLER_REDIS_REST_TOKEN')assert.equal(value.value,sellerProfile.redisToken);
  const existing=rows[kind].find(r=>r.key===value.key&&JSON.stringify(r.target)==='["preview"]');if(existing)Object.assign(existing,value);else rows[kind].push({id:'fake_'+rows[kind].length,...value});return {};
 };
 const deps={command,planResolver:async()=>current,bindingValidator:profile=>{validateFreeProviderProfile(profile,'https://stellar-bazaar-x402-gwbzxq0qm-cabscryptocontacto-6028s-projects.vercel.app');return plan.providerBindingHash;}};
 const options={bazaarProfile,sellerProfile,approvedPlanHash:plan.planHash};
 const privateResult=await onDemandPreviewControl('private-check','bootstrap',options,fixture,deps);assert.equal(privateResult.metadataGets,4);assert.equal(privateResult.environmentWrites,0);assert.equal(calls.length,4);assert.ok(calls.every(c=>c.args.includes('GET')));checks++;
 const before=calls.length;await assert.rejects(onDemandPreviewControl('deploy','bootstrap',{...options,approvedPlanHash:'f'.repeat(64)},fixture,deps),/EXPLICIT_NEW_PREVIEW_PLAN/);assert.equal(calls.length,before);checks++;
 const bootstrap=await onDemandPreviewControl('deploy','bootstrap',options,fixture,deps);assert.equal(bootstrap.stage,'bootstrap');assert.equal(bootstrap.purchasesEnabled,false);assert.equal(deployments.length,1);checks++;
 await assert.rejects(onDemandPreviewControl('deploy','bootstrap',options,fixture,deps),/EXISTING_STAGE_REQUIRES_READ_RECOVERY/);checks++;
 let oldCalls=calls.length;const recovered=await onDemandPreviewControl('recover','bootstrap',options,fixture,deps);assert.equal(recovered.recoveredReadOnly,true);assert.ok(calls.slice(oldCalls).every(c=>c.args.includes('GET')));checks++;
 failProviderEnvOnce=true;await assert.rejects(onDemandPreviewControl('deploy','provider',options,fixture,deps),/SYNTHETIC_BEFORE_FIRST_ENV_UPSERT/);assert.equal(deployments.length,1);const savedProviderIntent=await readFile(resolve(fixture,'.vercel/on-demand-preview-provider-intent.json'));checks++;
 const provider=await onDemandPreviewControl('resume-stage','provider',options,fixture,deps);assert.deepEqual(await readFile(resolve(fixture,'.vercel/on-demand-preview-provider-intent.json')),savedProviderIntent);assert.equal(provider.providerBindingHash,plan.providerBindingHash);const configured=JSON.parse(rows.provider.find(r=>r.key==='BAZAAR_HOSTED_SELLER_CONFIG').value);assert.equal(configured.bazaarOrigin,bootstrap.url);assert.equal(configured.cardHash,config.cardHash);assert.equal(rows.provider.find(r=>r.key==='BAZAAR_HOSTED_SELLER_BINDING_HASH').value,plan.providerBindingHash);assert.equal(rows.provider.find(r=>r.key==='BAZAAR_MARKETPLACE_WORKER_TOKEN_SHA256').value,sha(config.providerAccess));checks++;
 loseDeployAck=true;await assert.rejects(onDemandPreviewControl('deploy','final',options,fixture,deps),/SYNTHETIC_RESPONSE_LOST/);assert.equal(deployments.length,3);checks++;
 await assert.rejects(onDemandPreviewControl('resume-stage','final',options,fixture,deps),/UPLOAD_REQUEST_EXISTS_READ_RECOVERY_ONLY/);assert.equal(deployments.length,3);checks++;
 oldCalls=calls.length;const final=await onDemandPreviewControl('recover','final',options,fixture,deps);assert.equal(final.stage,'final');assert.equal(deployments.length,3);assert.ok(calls.slice(oldCalls).every(c=>c.args.includes('GET')));assert.equal(rows.bazaar.find(r=>r.key==='BAZAAR_TEXT_SELLER_WAKE_URL').value,provider.url+'/api/bazaar/seller/tick');assert.equal(rows.bazaar.find(r=>r.key==='BAZAAR_ENABLE_MARKET_PURCHASES').value,'false');checks++;
 assert.ok(!JSON.stringify({privateResult,bootstrap,provider,final}).includes(sellerProfile.redisToken));assert.ok(!JSON.stringify({privateResult,bootstrap,provider,final}).includes(sellerProfile.cronSecret));checks++;
 const intent=JSON.parse(await readFile(resolve(fixture,'.vercel/on-demand-preview-final-intent.json'),'utf8'));for(const patch of [{target:'production'},{projectId:'other'},{crons:[{path:'/tick',schedule:'*/4 * * * *'}]},{meta:{...deployments[2].meta,sourceDigest:'f'.repeat(64)}}]){assert.throws(()=>matchDeployment({...deployments[2],...patch},intent,plan,true));checks++;}
 for(const origin of ['https://bazaar.browns.studio','https://ai-video-scriptwriter.vercel.app','https://stellar-bazaar-x402-fake-cabscryptocontacto-6028s-projects.vercel.app/?secret=x']){assert.throws(()=>previewOrigin(origin,'bazaar'));checks++;}
 assert.throws(()=>retainedProviderBinding(sellerProfile),/EXACT_RETAINED_PROVIDER_BINDING/);checks++;
 assert.equal(realNetworkRequests,0);checks++;
 console.log(JSON.stringify({status:'PASS_OFFLINE_PREVIEW_CONTROLLER',checks,stages:3,simulatedDeployments:3,readOnlyLostResponseRecovery:true,privateCheckMetadataGets:4,privateProfileFilesRead:0,realNetworkRequests,cloudWrites:0,realDeployments:0,productionPublished:false,cronActivated:false,payments:0,privateValuesReturned:0}));
}finally{globalThis.fetch=oldFetch;const rel=relative(root,fixture);if(!rel.startsWith('.vercel'+sep+'on-demand-preview-controller-test-')||rel.includes('..')||isAbsolute(rel))throw Error('OWN_FIXTURE_CLEANUP_ONLY');await rm(fixture,{recursive:true,force:false});}
