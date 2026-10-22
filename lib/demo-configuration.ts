import {createHash,timingSafeEqual} from 'node:crypto';
import {purchaseAdmissionConfiguration} from './market-purchase-admission.ts';
import {freeDemoWindow} from './free-demo-window.ts';
import {continuousFreeBudgetConfiguration} from './continuous-free-budget.ts';
import {textSellerConfiguration,exampleTextSellerConfiguration} from './market-text-seller-runtime.ts';
/** Read-only runtime inspection. Returns only booleans and fixed reason codes;
 * never credentials, endpoints, bucket names or environment variable values. */
type Environment=Readonly<Record<string,string|undefined>>;
type Feature={enabled:boolean;reason:string|null};
const present=(v:string|undefined)=>Boolean(v?.trim());
export function guardianCronConfiguration(environment:Environment=process.env){
 const secret=environment.CRON_SECRET,expected=environment.BAZAAR_MARKET_OPERATOR_HASH;
 const credentialConfigured=/^[a-zA-Z0-9_-]{43}$/.test(secret??'');
 const operatorHashMatches=credentialConfigured&&/^[a-f0-9]{64}$/.test(expected??'')&&timingSafeEqual(createHash('sha256').update(secret!).digest(),Buffer.from(expected!,'hex'));
 return {credentialConfigured,operatorHashMatches,productionDeployment:environment.VERCEL==='1'&&environment.VERCEL_ENV==='production'};
}
function safeHttps(value:string|undefined){try{const u=new URL(value??'');return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/';}catch{return false;}}
function publicOrigin(value:string|undefined,environment:Environment){
 if(value==='vercel-preview')return environment.VERCEL==='1'&&environment.VERCEL_ENV==='preview'&&/^stellar-bazaar-x402-[a-z0-9-]+\.vercel\.app$/.test(environment.VERCEL_URL??'');
 try{const u=new URL(value??'');return u.origin===value&&!u.username&&!u.password&&(u.protocol==='https:'||(!environment.VERCEL&&u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)));}catch{return false;}
}
function feature(enabled:boolean,reason:string):Feature{return {enabled,reason:enabled?null:reason};}
export function demoConfiguration(environment:Environment=process.env,buyerOwnerId?:string){
 const stage=environment.VERCEL_ENV==='production'?'production':environment.VERCEL_ENV==='preview'?'preview':'local';
 const marketplace=environment.BAZAAR_ENABLE_MARKETPLACE==='true';
 const workspacePrefix=environment.BAZAAR_WORKSPACE_PREFIX??'',marketPrefix=environment.BAZAAR_MARKET_PREFIX??'',reviewPrefix=environment.BAZAAR_REVIEW_PREFIX??'';
 const accessKeyId=environment.BAZAAR_S3_ACCESS_KEY_ID?.trim()||environment.BAZAAR_S3_KEY_ID?.trim();
 const secretAccessKey=environment.BAZAAR_S3_SECRET_ACCESS_KEY?.trim()||environment.BAZAAR_S3_APP_KEY?.trim();
 const reviewUrl=marketplace?environment.BAZAAR_WORKSPACE_REDIS_REST_URL:environment.BAZAAR_REVIEW_REDIS_REST_URL;
 const reviewToken=marketplace?environment.BAZAAR_WORKSPACE_REDIS_REST_TOKEN:environment.BAZAAR_REVIEW_REDIS_REST_TOKEN;
 const filePrefix=environment.BAZAAR_MARKET_FILE_PREFIX??'';
 const cron=guardianCronConfiguration(environment);
 const purchaseAdmission=purchaseAdmissionConfiguration(environment,buyerOwnerId);
 const demoWindow=freeDemoWindow(environment);
 let continuousConfigured=true,textSellerConfigured=true;
 try{continuousFreeBudgetConfiguration(environment);}catch{continuousConfigured=false;}
 try{textSellerConfiguration(environment);exampleTextSellerConfiguration(environment);}catch{textSellerConfigured=false;}
 const checks={
  publicDemo:environment.BAZAAR_PUBLIC_DEMO==='true',
  workspacesEnabled:environment.BAZAAR_ENABLE_OPEN_WORKSPACES==='true',
  marketplaceEnabled:marketplace,
  publicAdmission:environment.BAZAAR_WORKSPACE_ADMISSION==='open'&&!present(environment.BAZAAR_WORKSPACE_INVITE_HASHES_JSON),
  newAdmissionsOpen:environment.BAZAAR_WORKSPACE_CREATION_PAUSED!=='true'&&demoWindow.admissionOpen,
  freeDemoWindowConfigured:demoWindow.configured,
  continuousBudgetConfigured:continuousConfigured,
  textSellerConfigured,
  workspaceRedisBackend:environment.BAZAAR_WORKSPACE_BACKEND==='redis',
  workspaceRedisUrl:safeHttps(environment.BAZAAR_WORKSPACE_REDIS_REST_URL),
  workspaceRedisToken:present(environment.BAZAAR_WORKSPACE_REDIS_REST_TOKEN),
  workspaceNamespace:/^bazaar-workspace:pilot-[a-f0-9]{32}$/.test(workspacePrefix),
  marketNamespace:/^bazaar-market:pilot-[a-f0-9]{32}$/.test(marketPrefix),
  reviewRedisBackend:environment.BAZAAR_PROVIDER_REVIEW_BACKEND==='redis',
  reviewRedisUrl:safeHttps(reviewUrl),
  reviewRedisToken:present(reviewToken),
  reviewNamespace:/^bazaar-review:pilot-[a-f0-9]{32}$/.test(reviewPrefix),
  namespacesIndependent:Boolean(workspacePrefix&&marketPrefix&&reviewPrefix&&new Set([workspacePrefix,marketPrefix,reviewPrefix]).size===3),
  // The meter admits distinct store prefixes from one frozen pilot family.
  // A hosted object prefix belongs to that same family and deployment stage.
  namespaceFamilyMatches:/^bazaar-workspace:pilot-[a-f0-9]{32}$/.test(workspacePrefix)&&marketPrefix==='bazaar-market:'+workspacePrefix.slice('bazaar-workspace:'.length)&&reviewPrefix==='bazaar-review:'+workspacePrefix.slice('bazaar-workspace:'.length)&&(!environment.VERCEL||filePrefix===`market-deliveries/v1/${stage}/`+workspacePrefix.slice('bazaar-workspace:pilot-'.length)),
  // This marker is checked against deployment stage; comparing preview versus
  // production namespace identifiers still requires paired deployment evidence.
  namespaceStageMatches:environment.BAZAAR_DEMO_NAMESPACE_ENV===stage,
  publicOrigin:publicOrigin(environment.BAZAAR_WORKSPACE_PUBLIC_ORIGIN,environment),
  providerIntakeEnabled:environment.BAZAAR_ENABLE_SELF_LISTING_INTAKE==='true'&&demoWindow.admissionOpen,
  reviewSecret:typeof environment.BAZAAR_MARKET_REVIEW_SECRET==='string'&&environment.BAZAAR_MARKET_REVIEW_SECRET.length>=32,
  manualOperator:/^[a-f0-9]{64}$/.test(environment.BAZAAR_MARKET_OPERATOR_HASH??''),
  guardianCronCredential:cron.credentialConfigured,
  guardianCronMatchesOperator:cron.operatorHashMatches,
  purchasesEnabled:environment.BAZAAR_ENABLE_MARKET_PURCHASES==='true'&&demoWindow.admissionOpen,
  purchaseAdmissionConfigured:purchaseAdmission.configured,
  x402Enabled:environment.BAZAAR_X402_MARKETPLACE_ENABLED==='true',
  testnetFacilitator:environment.STELLAR_X402_FACILITATOR_URL==='https://channels.openzeppelin.com/x402/testnet',
  facilitatorCredential:present(environment.STELLAR_X402_FACILITATOR_API_KEY)&&environment.STELLAR_X402_FACILITATOR_API_KEY!.trim().length<=1024&&!/[\r\n]/.test(environment.STELLAR_X402_FACILITATOR_API_KEY!.trim()),
  testnetRpc:environment.STELLAR_X402_RPC_URL===undefined||environment.STELLAR_X402_RPC_URL==='https://soroban-testnet.stellar.org',
  noServerPayer:!present(environment.X402_PAYER_SECRET)&&environment.X402_ENABLE_LOCAL_PAYER!=='true',
  r2Bucket:present(environment.BAZAAR_S3_BUCKET),
  r2Region:present(environment.BAZAAR_S3_REGION),
  r2Endpoint:safeHttps(environment.BAZAAR_S3_ENDPOINT),
  r2AccessKey:present(accessKeyId),
  r2SecretKey:present(secretAccessKey),
  fileNamespace:/^market-deliveries\/v1\/(preview|production|local)\/[a-f0-9]{32}$/.test(filePrefix)&&filePrefix.startsWith(`market-deliveries/v1/${stage}/`),
  privateFilesEnabled:environment.BAZAAR_MARKET_FILES_ENABLED==='true',
  fileLifecycleBackstop:!environment.VERCEL||environment.BAZAAR_MARKET_FILE_LIFECYCLE_ACK==='true',
 };
 const workspace=checks.workspacesEnabled&&checks.workspaceRedisBackend&&checks.workspaceRedisUrl&&checks.workspaceRedisToken&&checks.workspaceNamespace&&checks.publicOrigin;
 const durableMarket=workspace&&checks.marketplaceEnabled&&checks.marketNamespace&&checks.reviewRedisBackend&&checks.reviewRedisUrl&&checks.reviewRedisToken&&checks.reviewNamespace&&checks.namespacesIndependent&&checks.namespaceFamilyMatches&&checks.namespaceStageMatches;
 const r2Configured=checks.r2Bucket&&checks.r2Region&&checks.r2Endpoint&&checks.r2AccessKey&&checks.r2SecretKey;
 const purchases=durableMarket&&checks.continuousBudgetConfigured&&checks.textSellerConfigured&&checks.purchasesEnabled&&checks.purchaseAdmissionConfigured&&purchaseAdmission.allowed&&checks.x402Enabled&&checks.testnetFacilitator&&checks.facilitatorCredential&&checks.testnetRpc&&checks.noServerPayer;
 const guardianConfigured=durableMarket&&checks.manualOperator&&checks.guardianCronCredential&&checks.guardianCronMatchesOperator;
 const reasons=Object.entries(checks).filter(([,value])=>!value).map(([key])=>'CONFIG_'+key.replace(/[A-Z]/g,c=>'_'+c).toUpperCase());
 return {
  checks,
  features:{
   registration:feature(workspace&&checks.publicDemo&&checks.publicAdmission&&checks.newAdmissionsOpen,!workspace?'WORKSPACE_CONFIGURATION_INCOMPLETE':!checks.publicDemo?'PUBLIC_DEMO_DISABLED':!checks.publicAdmission?'REGISTRATION_NOT_PUBLIC':'ADMISSIONS_PAUSED'),
   catalogue:feature(durableMarket,'MARKET_CONFIGURATION_INCOMPLETE'),
   serviceSubmission:feature(durableMarket&&checks.providerIntakeEnabled&&checks.reviewSecret,!checks.providerIntakeEnabled?'PROVIDER_INTAKE_DISABLED':'PROVIDER_REVIEW_CONFIGURATION_INCOMPLETE'),
   moderation:feature(durableMarket&&checks.manualOperator,'OPERATOR_CONFIGURATION_INCOMPLETE'),
   guardianAutomation:feature(guardianConfigured&&cron.productionDeployment,!guardianConfigured?'GUARDIAN_CRON_CONFIGURATION_INCOMPLETE':'GUARDIAN_SCHEDULER_PRODUCTION_ONLY'),
   purchases:feature(purchases,!checks.purchasesEnabled?'PURCHASES_DISABLED':!checks.purchaseAdmissionConfigured?'PURCHASE_ADMISSION_CONFIGURATION_INCOMPLETE':!purchaseAdmission.allowed?'BUYER_ADMISSION_RESTRICTED':!checks.noServerPayer?'SERVER_PAYER_FORBIDDEN':'X402_CONFIGURATION_INCOMPLETE'),
   privateFiles:feature(durableMarket&&r2Configured&&checks.fileNamespace&&checks.privateFilesEnabled&&checks.fileLifecycleBackstop,!checks.privateFilesEnabled?'FILE_STORAGE_DISABLED':!checks.fileNamespace?'FILE_NAMESPACE_REQUIRED':!checks.fileLifecycleBackstop?'FILE_LIFECYCLE_BACKSTOP_REQUIRED':'PRIVATE_FILES_NOT_CONFIGURED'),
  },
  r2Configured,
  freeDemoWindow:demoWindow,
  purchaseAdmission:{mode:purchaseAdmission.mode,configured:purchaseAdmission.configured},
  ready:Object.values(checks).every(Boolean),
  reasons,
  storageProbeRequired:true,
  pairedNamespaceEvidenceRequired:true,
  guardianCron:{...cron,scheduledExecutionValidated:false},
  scheduledRunEvidenceRequired:true,
 };
}
