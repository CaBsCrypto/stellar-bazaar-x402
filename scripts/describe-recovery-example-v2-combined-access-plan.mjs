// Consolidate the exact pending test permissions; never read/use Redis tokens.
import {readFile} from 'node:fs/promises';
import {v3Journal,v3Prefixes,LOCAL_V3} from './recovery-example-budget-local-v3-access.mjs';
import {LOCAL_ACL_PERMISSIONS} from './recovery-example-budget-local-access.mjs';
import {exclusive,originalJournalUnchanged,sha} from './recovery-example-preview-lib.mjs';
const preview=JSON.parse(await readFile('docs/release/recovery-example-budget2-exact-acl-approval-plan-2026-10-13.json'));
const j=await v3Journal().read();
if(j?.phase!=='prepared'||j.profile.token!==null||j.profile.purpose!==LOCAL_V3.purpose)throw Error('PREPARED_LOCAL_ACCESS_ONLY_REQUIRED');
await originalJournalUnchanged();
const plan={version:1,status:'PENDING_COMBINED_EXACT_TEST_ACCESS_APPROVAL',previewSourceDigest:preview.sourceDigest,recipients:[...preview.recipients,{user:j.aclUser,destination:'Only the local synthetic-financial driver; never deployed',prefixes:v3Prefixes(j.profile).map(v=>v+':*'),commands:LOCAL_ACL_PERMISSIONS}],temporaryPreviewAccess:{hosts:preview.temporaryPreviewHosts,bazaarCrossMachine:'Only GET/POST /api/mcp on the exact new Bazaar Preview alias',providerCrossMachine:'Only the example-worker HTTPS control/readiness endpoints on its exact new Preview alias',operatorOtherPaths:'Current validation machine only',vercelProtectionAndAgentAuthenticationRetained:true,restoreOriginalFirewallAfterAcceptance:true},bounds:{newSyntheticActors:4,newPreviewDeployments:2,newUnpaidPreviewOrders:1,localSyntheticOrdersMaximum:2,localSyntheticSettlementsMaximum:1,localExecutionsMaximum:1,previewExecutions:0,maximumRealRedisCommands:30000,maximumRealRedisTransferBytes:100000000},preserveOldAccountsOrdersUsageAndHolds:true,masterCredentialDeployed:false,cronActivated:false,productionPublished:false,productionLimitsChanged:false,realPayments:0,credentialValuesReturned:0,permissionChangesPerformed:0};
await exclusive('docs/release/recovery-example-v2-combined-exact-access-approval-plan-2026-10-13.json',plan);
console.log(JSON.stringify({status:plan.status,plan:'docs/release/recovery-example-v2-combined-exact-access-approval-plan-2026-10-13.json',planSha256:sha(JSON.stringify(plan,null,2)+'\n'),recipients:plan.recipients.map(v=>({user:v.user,prefixes:v.prefixes,destination:v.destination})),permissionsChanged:false,networkRequests:0,realPayments:0}));
