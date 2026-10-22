// Describe pending scoped permissions only; no credential is returned or used.
import {journalRead,readBudgetPreviewTarget,previousPreviewProfileUnchanged,originalJournalUnchanged,exclusive,sha} from './recovery-example-budget2-preview-lib.mjs';
const target=await readBudgetPreviewTarget(),j=await journalRead();
if(j?.phase!=='prepared'||j.scopedToken!==null||j.scopedNativeToken!==null||j.candidateSources.bazaar!==target.sourceDigest)throw Error('PREPARED_NOT_APPLIED_SCOPE_REQUIRED');
await previousPreviewProfileUnchanged(target.previousPreviewProfileSha256);await originalJournalUnchanged();
const base=['get','set','del','exists','eval','pttl','time','ping'];
const plan={version:1,status:'PENDING_EXACT_PREVIEW_ACL_AUTHORIZATION',sourceDigest:target.sourceDigest,familyFingerprint:sha(j.family),recipients:[{user:j.nativeUser,destination:'Only the protected synthetic Bazaar Preview and this local native initializer',prefixes:['bazaar-workspace:'+j.family+':*','bazaar-market:'+j.family+':*','bazaar-review:'+j.family+':*'],commands:[...base,'smembers','sadd','srem']},{user:j.user,destination:'Only the protected synthetic example-worker Preview',prefixes:[j.workerPrefix+':*',j.runtimePrefix+':*'],commands:base}],secrets:'New tokens stay encrypted locally and in deployment-only Preview overrides; no Redis master token is deployed.',temporaryPreviewHosts:['stellar-bazaar-x402-example-budget2.vercel.app','ai-video-scriptwriter-example-budget2.vercel.app'],maximumNewOrders:1,orderMustRemainUnpaid:true,cron:[],networkRequests:0,credentialValuesReturned:0,permissionsChanged:false,productionPublished:false,limitsChanged:false,payments:0};
await exclusive('docs/release/recovery-example-budget2-exact-acl-approval-plan-2026-10-13.json',plan);
console.log(JSON.stringify(plan));
