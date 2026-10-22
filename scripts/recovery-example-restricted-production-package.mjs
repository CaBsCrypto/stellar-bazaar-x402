// Pure production preparation. No cloud client, credential reader, signer or deploy executor.
import {createHash} from 'node:crypto';
import {readFile,writeFile,lstat,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRecoveryExampleCard} from '../examples/recovery-example-text-service.mjs';
import {sellerCanonical} from '../examples/seller-service-card.mjs';
import {safeSourcePath,sourceDigest} from './prepare-functional-preview-source.mjs';

const fail=code=>{throw Error(code);};
export const sha=value=>createHash('sha256').update(value).digest('hex');
const hash=value=>sha(sellerCanonical(value));
const hex=value=>/^[a-f0-9]{64}$/.test(value??'');
const exact=(value,keys)=>Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(','));
export const RESTRICTED_EXAMPLE_PRODUCTION=Object.freeze({
  teamId:'team_XjolcoWJ9V9yamVnCdpC7EMY',
  bazaarProject:'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3',
  providerProject:'prj_cHsv0UIK31fRuLBXkW5RXkz4eU9K',
  bazaarOrigin:'https://bazaar.browns.studio',
  guionOrigin:'https://ai-video-scriptwriter.vercel.app',
  exampleOrigin:'https://ai-video-scriptwriter-example.vercel.app',
  productionFamily:'pilot-0cd860b8cfc35fc459b4838fa9092007',
  acceptanceBuyerFingerprint:'0aaf1bf4b2a3f960df6d6438429cb1487f7cf16fb87fa434b134345aa1b89173',
  destination:'GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C',
  serviceId:'bazaar-recovery-example-text-v1',budgetVersion:'example-text-wire/v2',
  providerIoProfile:'example-bounded-provider-v1',
  providerSourceDigest:'f87082dbb24b0f420cfecfc855b9a77c5995332623c5c9692d711eff30bdeee2',
  providerManifest:'docs/evidence/recovery-example-provider-v5-source-2026-10-13.json',
  providerManifestSha256:'9e82e6a44eabaacc5d668f8f037381d1056ba9baabdd1bdccbb32997b1ee0cb3',
  providerBuild:'docs/evidence/recovery-example-provider-v5-build-2026-10-13.json',
  providerBuildSha256:'66345c999c307d5f73d751a35800b0ab3651e06eb0b115da29f0bd7d6f8eb254',
  originalOperationId:'31c97193-be74-4b9d-b0a3-f3890b0a41e8',
  originalJournal:'.vercel/on-demand-production-purchase-31c97193-be74-4b9d-b0a3-f3890b0a41e8.journal.dpapi',
  originalJournalSha256:'97efd58199da7499b40f0b0b889ddbd7844f91fab0fedb8351e9b9881c530cfb',
  guardianDefinition:Object.freeze([{path:'/api/market/guardian/tick',schedule:'0 * * * *'}]),
});
const P=RESTRICTED_EXAMPLE_PRODUCTION;
export const PRODUCTION_PACKAGE_PATHS=Object.freeze({
  descriptor:'.vercel/recovery-example-restricted-production-source-descriptor.json',
  source:'.vercel/recovery-example-restricted-production-bazaar-source',
  manifest:'docs/evidence/recovery-example-restricted-production-bazaar-source-2026-10-13.json',
  template:'docs/release/recovery-example-restricted-production-template-v3-2026-10-13.json',
  card:'docs/release/recovery-example-restricted-production-card-2026-10-13.json',
});
const zero={networkRequests:0,cloudWrites:0,projectEnvironmentWrites:0,dpapiReads:0,newCredentials:0,newAccounts:0,newOrders:0,signatures:0,payments:0,settlements:0,providerExecutions:0,quotaResets:0,limitsChanged:false,productionPublished:false,cronActivated:false,secretValuesReturned:0};

/** Rebuild a production candidate; never promote a cronless Preview directly. */
export function productionHourlyCronOverlay(input){
  const prior=JSON.parse(Buffer.from(input).toString('utf8'));
  if(!prior||Array.isArray(prior)||typeof prior!=='object'||prior.crons!==undefined&&(!Array.isArray(prior.crons)||prior.crons.length))fail('EXAMPLE_CRONLESS_SOURCE_REQUIRED');
  return Buffer.from(JSON.stringify({...prior,crons:P.guardianDefinition.map(row=>({...row}))},null,2)+'\n');
}
export function productionExampleCard(){return createRecoveryExampleCard({providerOrigin:P.exampleOrigin,destination:P.destination});}

export const PRESERVED_BAZAAR_ENVIRONMENT_KEYS=Object.freeze([
  'BAZAAR_WORKSPACE_REDIS_REST_URL','BAZAAR_WORKSPACE_REDIS_REST_TOKEN','BAZAAR_WORKSPACE_PREFIX',
  'BAZAAR_MARKET_PREFIX','BAZAAR_REVIEW_PREFIX','BAZAAR_MARKET_BUYER_ALLOWLIST_JSON',
  'BAZAAR_TEXT_SELLER_MODE','BAZAAR_TEXT_SELLER_SERVICE_ID','BAZAAR_TEXT_SELLER_CARD_HASH',
  'BAZAAR_TEXT_SELLER_OWNER_FINGERPRINT','BAZAAR_TEXT_SELLER_WAKE_URL','BAZAAR_TEXT_SELLER_WAKE_TOKEN',
  'BAZAAR_TEXT_SELLER_RECOVERY_SLOT_OPERATION_ID','BAZAAR_FREE_DEMO_MODE','BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON',
  'BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES','CRON_SECRET','STELLAR_X402_FACILITATOR_API_KEY',
]);
/** Metadata only. Values, hashes of values, secrets and access IDs are not accepted. */
export function productionEnvironmentReferenceFingerprint(rows){
  if(!Array.isArray(rows)||rows.length>300)fail('EXAMPLE_BOUNDED_ENVIRONMENT_REFERENCE_ROWS_REQUIRED');
  const allowed=['id','key','type','target','gitBranch','customEnvironmentIds','updatedAt'];
  const selected=rows.map(row=>{
    if(!row||Array.isArray(row)||Object.keys(row).some(key=>!allowed.includes(key))||typeof row.id!=='string'||!/^[A-Za-z0-9_-]{6,100}$/.test(row.id)||
      typeof row.key!=='string'||!/^[A-Z][A-Z0-9_]{1,100}$/.test(row.key)||!['plain','encrypted','sensitive','secret'].includes(row.type)||
      !Array.isArray(row.target)||!row.target.length||row.target.some(target=>!['production','preview','development'].includes(target)))fail('EXAMPLE_SECRET_FREE_ENVIRONMENT_REFERENCES_REQUIRED');
    return {id:row.id,key:row.key,type:row.type,target:[...row.target].sort(),gitBranch:row.gitBranch??null,customEnvironmentIds:row.customEnvironmentIds??[],updatedAt:row.updatedAt??null};
  }).filter(row=>row.target.includes('production')).sort((a,b)=>a.key.localeCompare(b.key)||a.id.localeCompare(b.id));
  if(new Set(selected.map(row=>row.id)).size!==selected.length)fail('EXAMPLE_UNIQUE_ENVIRONMENT_REFERENCE_REQUIRED');
  return hash(selected);
}
export function assertProductionReferencesPreserved(before,after){
  if(productionEnvironmentReferenceFingerprint(before)!==productionEnvironmentReferenceFingerprint(after))fail('EXAMPLE_PRODUCTION_SECRET_REFERENCES_CHANGED');
  return true;
}
/** A public profile uses fingerprints only, never the native owner/access values. */
export function validateProductionExampleBindings(value){
  const keys=['productionFamily','workerHex','buyerFingerprint','sellerFingerprint','legacySellerFingerprint','cardHash','workerBinding','runtimeBinding','wakeTokenFingerprint','redisTokenFingerprint','storeKeyFingerprint','submissionFingerprint'];
  if(!exact(value,keys)||value.productionFamily!==P.productionFamily||!/^[a-f0-9]{32}$/.test(value.workerHex??'')||value.workerHex===P.productionFamily.slice(6)||
    keys.filter(key=>!['productionFamily','workerHex'].includes(key)).some(key=>!hex(value[key]))||value.buyerFingerprint!==P.acceptanceBuyerFingerprint||
    value.sellerFingerprint===value.legacySellerFingerprint||value.sellerFingerprint===value.buyerFingerprint||value.cardHash!==productionExampleCard().cardHash||
    value.runtimeBinding!==hash({role:'recovery-example-runtime/v1',workerBinding:value.workerBinding}))fail('EXAMPLE_SEPARATE_REVIEWED_PRODUCTION_BINDINGS_REQUIRED');
  const workerPrefix='bazaar-seller:production-'+value.workerHex,runtimePrefix='bazaar-seller:production-'+sha('runtime:'+value.workerHex).slice(0,32);
  if(workerPrefix===runtimePrefix)fail('EXAMPLE_DISTINCT_PRODUCTION_WORKER_RUNTIME_REQUIRED');
  return {
    ...value,workerPrefix,runtimePrefix,
    workerStorageKey:workerPrefix+':'+value.workerBinding+':storage:v1',runtimeStorageKey:runtimePrefix+':'+value.runtimeBinding+':storage:v1',
    nativeBindingHash:hash({version:P.budgetVersion,serviceId:P.serviceId,cardHash:value.cardHash,ownerFingerprint:value.sellerFingerprint,workerUrl:P.exampleOrigin+'/api/bazaar/example/tick'}),
  };
}
/** Private values are resolved by the later reviewed executor, not this preparation helper. */
export function productionEnvironmentContract(){return {
  bazaar:{preserveEveryProjectProductionReference:true,replaceGuionBinding:false,productionNamespaces:P.productionFamily,
    unchangedGuionKeys:PRESERVED_BAZAAR_ENVIRONMENT_KEYS,
    newDeploymentOnlyKeys:{BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON:'private frozen native service/owner + fixed wake URL/token; protection absent',BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE:P.budgetVersion},
    oneAcceptanceBuyerOnly:true,existingAdmissionPolicyPreserved:true,existingRegistrationPolicyPreserved:true,
    previewProofVariables:'must be absent in effective Production environment',fileDeliveryEnabled:false},
  provider:{preserveEveryProjectProductionReference:true,deploymentsOnly:true,projectTargetsProductionUnchanged:true,
    privateDeploymentOverrides:['BAZAAR_HOSTED_SELLER_CONFIG','BAZAAR_HOSTED_SELLER_BINDING_HASH','BAZAAR_HOSTED_SELLER_PREFIX','BAZAAR_EXAMPLE_RUNTIME_PREFIX','BAZAAR_HOSTED_SELLER_KEY','BAZAAR_HOSTED_SELLER_REDIS_REST_URL','BAZAAR_HOSTED_SELLER_REDIS_REST_TOKEN','CRON_SECRET'],
    fixedDeploymentOverrides:{BAZAAR_HOSTED_SELLER_ENABLED:'true',BAZAAR_SELLER_EXECUTION_MODE:'on-demand',BAZAAR_EXAMPLE_PROVIDER_IO_PROFILE:P.providerIoProfile,BAZAAR_HOSTED_SELLER_MCP_PROTECTION:'',BAZAAR_HOSTED_SELLER_PROVIDER_PROTECTION:''},
    publicControlNonceKey:'BAZAAR_EXAMPLE_CONTROL_RECORD',redisCredential:'two-prefix ACL only; no native/main token',newAccountAgent:'new Production seller only',workerAndRuntimeBytes:20000000,
    guionCanonicalAliasUnchanged:true,guionDeploymentUnchanged:true,providerCrons:[],promoteProvider:false},
};}
export function productionNativePublicationSequence(){return [
  {phase:'capacity-and-authority',action:'Fresh Production/physical Free quota, old holds, canonical deployment, all Production references and WAF/SSO readback',writes:false,gate:'full forecast includes native bootstrap + publication + public checks + new operation reserve; no reset or limit change'},
  {phase:'account',action:'Create one new seller in existing Production native family with separate human/agent/recovery accesses; reuse saved creation identifier after response loss',writes:true,gate:'explicit later production preparation authorization; no borrowing Guion owner'},
  {phase:'permission',action:'New human grants its new agent service-submission permission',writes:true,gate:'same new seller; no admin Magic Link'},
  {phase:'submit',action:'submit_market_service with exact Production card and http-well-known control domain; recover existing submission first',writes:true,gate:'example optimized budget flag still disabled while new native binding is incomplete'},
  {phase:'worker-storage',action:'Initialize exactly two new worker/runtime encrypted ledgers; reserve native 20 MB sidecar; preserve old ledgers',writes:true,gate:'new two-prefix scoped credential and access/key references reviewed separately; no main token at provider'},
  {phase:'provider-stage',action:'Stage V5 Production --skip-domain; do not promote or move Guion canonical alias; bind only new example alias after READY + source/config proof',writes:true,gate:'project.targets.production and Guion deployment/alias unchanged; no provider cron'},
  {phase:'public-proof',action:'GET new alias well-known record, authenticated availability/readiness and internal self-runtime without Preview bypass',writes:false,gate:'both WAF and Deployment Protection proven effective; WAF alone does not prove SSO access'},
  {phase:'review',action:'Operator verify-http then human approve for staging; keep the service inactive',writes:true,gate:'same saved submission, new owner and immutable Production card; no forced approval or listing bypass'},
  {phase:'bazaar-stage',action:'Build distinct hourly-guardian Production candidate and stage --skip-domain with Guion and example independent bindings',writes:true,gate:'existing one-buyer allowlist, original incident slot, budgets, secrets and all old holds unchanged'},
  {phase:'activate-staged',action:'Drain old Bazaar writers; verify frozen configuration on the READY staged candidate; activate same reviewed submission from its private operator route',writes:true,gate:'old canonical source cannot admit the example without its reviewed on-demand/budget binding; activation only under joint publication authorization'},
  {phase:'canonical-handover',action:'Drain old Bazaar writers, exact freshly rebased firewall phases, conditional Bazaar promotion and quarantine old writers',writes:true,gate:'joint user approval of immutable package; guard hourly on new canonical deployment; no provider promotion'},
  {phase:'restricted-proof',action:'Read-only QR/catalog/MCP/identity/private-history and both configured seller readiness proofs',writes:false,gate:'no new order/signature/payment/execution; finite checks charged outside pending holds'},
  {phase:'financial-acceptance',action:'Separate later authorization for one 0.01 USDC Testnet purchase with 0.1 XLM fee cap',writes:false,gate:'not included in this package; opening general purchases remains separate'},
];}
export function restrictedProductionTemplate(){
  const card=productionExampleCard();
  return {
    version:1,status:'PREPARED_RESTRICTED_PRODUCTION_TEMPLATE_BLOCKED_NO_DEPLOYMENT_AUTHORITY',preparedAt:new Date().toISOString(),
    projects:{bazaar:P.bazaarProject,provider:P.providerProject},teamId:P.teamId,
    origins:{bazaar:P.bazaarOrigin,guion:P.guionOrigin,example:P.exampleOrigin},
    service:{id:P.serviceId,cardHash:card.cardHash,destination:P.destination,price:'0.01',asset:'USDC',network:'stellar:testnet',input:{format:'text'},delivery:'text',retentionDays:7},
    providerSource:{digest:P.providerSourceDigest,manifest:P.providerManifest,manifestSha256:P.providerManifestSha256,build:P.providerBuild,buildSha256:P.providerBuildSha256},
    candidateBazaarSource:null,candidateBazaarBuild:null,productionBindings:null,currentProductionMetadata:null,freshCapacity:null,rebasedFirewall:null,
    guardianDefinition:P.guardianDefinition,providerCrons:[],providerPromotionForbidden:true,previewPromotionForbidden:true,
    environmentContract:productionEnvironmentContract(),nativePublication:productionNativePublicationSequence(),
    originalOperationPreserved:{operationId:P.originalOperationId,journalSha256:P.originalJournalSha256,oldConsumptionAndHoldsPreserved:true,paymentStillUncertain:true},
    blockers:['final global-control candidate/source/build and associated acceptance evidence','fresh physical and native capacity including bootstrap/publication and finite complete-flow forecast','new Production seller account/human permission/native submission + reviewed card/owner','two isolated production worker/runtime namespaces, encrypted key and least-privilege credential references','public control proof and exact alias/backend access without Preview protection bypass','fresh project/env/WAF/SSO authority and explicit joint publication approval'],
    upstashPlan:'Free',subscriptionsChanged:false,generalPurchasesEnabled:false,newFinancialAuthorizationRequired:true,
    maximumBazaarPromotions:1,maximumProviderPromotions:0,...zero,
  };
}

function confined(root,path){const value=resolve(root,path),r=relative(root,value);if(!r||r==='..'||r.startsWith('..'+sep)||isAbsolute(r))fail('EXAMPLE_PRODUCTION_OWN_PATH_REQUIRED');return value;}
async function plain(root,path,max=2097152){let p=root;const target=confined(root,path);for(const part of relative(root,target).split(sep)){p=resolve(p,part);if((await lstat(p)).isSymbolicLink())fail('EXAMPLE_PRODUCTION_PLAIN_FILE_REQUIRED');}const s=await lstat(target);if(!s.isFile()||s.size>max)fail('EXAMPLE_PRODUCTION_BOUNDED_FILE_REQUIRED');return readFile(target);}
export function validateProductionSourceDescriptor(value){
  if(!exact(value,['version','purpose','sourceManifest','sourceManifestSha256','sourceDigest','buildReceipt','buildReceiptSha256'])||value.version!==1||value.purpose!=='bazaar-recovery-example-restricted-production-source/v1'||
    !/^docs\/evidence\/recovery-example-[a-z0-9-]+\.json$/.test(value.sourceManifest??'')||!/^docs\/evidence\/recovery-example-[a-z0-9-]+\.json$/.test(value.buildReceipt??'')||
    ![value.sourceManifestSha256,value.sourceDigest,value.buildReceiptSha256].every(hex))fail('EXAMPLE_REVIEWED_PUBLIC_PRODUCTION_SOURCE_DESCRIPTOR_REQUIRED');
  return value;
}
export async function inspectRestrictedProductionSource(root=process.cwd(),descriptor){
  root=resolve(root);descriptor=validateProductionSourceDescriptor(descriptor??JSON.parse(await plain(root,PRODUCTION_PACKAGE_PATHS.descriptor,32768)));
  const raw=await plain(root,descriptor.sourceManifest),manifest=JSON.parse(raw),buildRaw=await plain(root,descriptor.buildReceipt),build=JSON.parse(buildRaw);
  if(sha(raw)!==descriptor.sourceManifestSha256||sha(buildRaw)!==descriptor.buildReceiptSha256||manifest.sourceDigest!==descriptor.sourceDigest||sourceDigest(manifest.files??[])!==descriptor.sourceDigest||
    !/^\.vercel\/recovery-example-[a-z0-9-]+-source$/.test(manifest.sourceDirectory??'')||!Array.isArray(manifest.files)||manifest.files.length<300||manifest.files.length>500||
    !String(manifest.status).startsWith('FROZEN')||build.sourceDigest!==descriptor.sourceDigest||!String(build.status).startsWith('PASS'))fail('EXAMPLE_REVIEWED_PRODUCTION_SOURCE_AND_BUILD_REQUIRED');
  const buffers=new Map(),files=[],changes=[];
  for(const f of manifest.files){
    if(!safeSourcePath(f.path)||buffers.has(f.path)||!hex(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<0)fail('EXAMPLE_SAFE_UNIQUE_PRODUCTION_SOURCE_REQUIRED');
    const prior=await plain(root,manifest.sourceDirectory+'/'+f.path,20000000);if(sha(prior)!==f.sha256||prior.length!==f.bytes)fail('EXAMPLE_PRODUCTION_BASE_SOURCE_CHANGED');
    const bytes=f.path==='vercel.json'?productionHourlyCronOverlay(prior):prior;
    buffers.set(f.path,bytes);files.push({path:f.path,sha256:sha(bytes),bytes:bytes.length});
    if(f.path==='vercel.json')changes.push({path:f.path,beforeSha256:f.sha256,afterSha256:sha(bytes),onlySemanticChange:'hourly guardian cron',afterCrons:P.guardianDefinition});
  }
  if(changes.length!==1)fail('EXAMPLE_PRODUCTION_VERCEL_CONFIG_REQUIRED');
  const effectiveDigest=sourceDigest(files),base={version:1,status:'RESTRICTED_PRODUCTION_SOURCE_PLAN_NO_DEPLOYMENT_AUTHORITY',sourceDirectory:PRODUCTION_PACKAGE_PATHS.source,sourceDigest:effectiveDigest,
    parentSourceDirectory:manifest.sourceDirectory,parentSourceDigest:manifest.sourceDigest,parentManifest:descriptor.sourceManifest,parentManifestSha256:descriptor.sourceManifestSha256,parentBuildReceipt:descriptor.buildReceipt,parentBuildReceiptSha256:descriptor.buildReceiptSha256,
    candidate:'recovery-example-restricted-production-'+effectiveDigest.slice(0,16),fileCount:files.length,files,changes,guardianDefinition:P.guardianDefinition,
    directPreviewPromotionForbidden:true,productionBuildRequired:true,productionConfigurationAcceptanceRequired:true,previewValidationCarriedOnlyAsAntecedent:true,...zero};
  return {plan:{...base,planHash:hash(base)},buffers};
}
export async function prepareRestrictedProductionSource(root,expectedPlanHash){
  root=resolve(root);const {plan,buffers}=await inspectRestrictedProductionSource(root);
  if(!hex(expectedPlanHash)||plan.planHash!==expectedPlanHash)fail('EXAMPLE_APPROVED_LOCAL_PRODUCTION_SOURCE_PLAN_REQUIRED');
  const destination=confined(root,PRODUCTION_PACKAGE_PATHS.source),receipt=confined(root,PRODUCTION_PACKAGE_PATHS.manifest);
  for(const path of [destination,receipt]){try{await lstat(path);fail('EXAMPLE_NEW_IMMUTABLE_PRODUCTION_ARTIFACT_REQUIRED');}catch(e){if(e.code!=='ENOENT')throw e;}}
  await mkdir(destination);
  for(const [path,bytes]of buffers){const target=confined(destination,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});}
  const manifest={...plan,status:'FROZEN_RESTRICTED_EXAMPLE_PRODUCTION_SOURCE_NOT_DEPLOYED',preparedAt:new Date().toISOString()};
  await writeFile(receipt,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  return {status:manifest.status,sourceDigest:manifest.sourceDigest,manifest:PRODUCTION_PACKAGE_PATHS.manifest,fileCount:manifest.fileCount,planHash:plan.planHash,buildRequired:true,...zero};
}
export function restrictedProductionDeployArguments(kind,{copy,sourceDigest:pin,planHash,intentId}){
  if(!['bazaar','provider'].includes(kind)||typeof copy!=='string'||!copy||!hex(pin)||!hex(planHash)||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(intentId??''))fail('EXAMPLE_PINNED_RESTRICTED_PRODUCTION_DEPLOY_ARGUMENTS_REQUIRED');
  if(kind==='provider'&&pin!==P.providerSourceDigest)fail('EXAMPLE_EXACT_V5_PRODUCTION_PROVIDER_REQUIRED');
  return ['deploy','--yes','--json','--archive=tgz','--no-wait','--target','production','--skip-domain','--project',kind==='bazaar'?P.bazaarProject:P.providerProject,'--cwd',copy,'--local-config',resolve(copy,'vercel.json'),
    '--meta','sourceDigest='+pin,'--meta','restrictedExamplePlan='+planHash,'--meta','restrictedExampleIntent='+intentId,'--meta','restrictedExampleStage='+kind,
    '--meta','restrictedExamplePurchases=one-existing-acceptance-buyer'];
}
export function assertProductionExampleAliasOnly({hostname,projectId,deploymentId,guionAliasBefore,guionAliasAfter,providerTargetBefore,providerTargetAfter}){
  if(hostname!==new URL(P.exampleOrigin).hostname||projectId!==P.providerProject||!/^dpl_[A-Za-z0-9]+$/.test(deploymentId??'')||
    !/^dpl_[A-Za-z0-9]+$/.test(providerTargetBefore??'')||providerTargetBefore!==providerTargetAfter||
    !guionAliasBefore||!guionAliasAfter||guionAliasBefore.alias!==new URL(P.guionOrigin).hostname||guionAliasBefore.projectId!==P.providerProject||
    sellerCanonical(guionAliasBefore)!==sellerCanonical(guionAliasAfter)||(guionAliasBefore.deploymentId??guionAliasBefore.deployment?.id)!==providerTargetBefore||deploymentId===providerTargetBefore)fail('EXAMPLE_ADDITIONAL_ALIAS_WITH_GUION_UNCHANGED_REQUIRED');
  return true;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{
    const [action,...args]=process.argv.slice(2);let result;
    if(action==='template'&&!args.length){const template=restrictedProductionTemplate(),card=productionExampleCard();await writeFile(PRODUCTION_PACKAGE_PATHS.template,JSON.stringify(template,null,2)+'\n',{flag:'wx',mode:0o600});try{const prior=JSON.parse(await plain(process.cwd(),PRODUCTION_PACKAGE_PATHS.card));if(sellerCanonical(prior)!==sellerCanonical(card))fail('EXAMPLE_PREPARED_PUBLIC_CARD_CHANGED');}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(PRODUCTION_PACKAGE_PATHS.card,JSON.stringify(card,null,2)+'\n',{flag:'wx',mode:0o600});}result={status:template.status,template:PRODUCTION_PACKAGE_PATHS.template,card:PRODUCTION_PACKAGE_PATHS.card,cardHash:card.cardHash,...zero};}
    else if(action==='inspect-source'&&!args.length){const {plan}=await inspectRestrictedProductionSource();result={...plan,files:plan.files.length};}
    else if(action==='prepare-source'&&args.length===2&&args[0]==='--approved-plan')result=await prepareRestrictedProductionSource(process.cwd(),args[1]);
    else fail('EXAMPLE_PURE_PRODUCTION_PREPARATION_ACTION_REQUIRED');
    console.log(JSON.stringify(result));
  }catch(error){console.error(JSON.stringify({status:'UNCONFIRMED',code:/^[A-Z][A-Z0-9_]{2,95}$/.test(error.message??'')?error.message:'EXAMPLE_PRODUCTION_PREPARATION_UNCONFIRMED',...zero}));process.exitCode=1;}
}
