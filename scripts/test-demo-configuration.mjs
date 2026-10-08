import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {demoConfiguration} from '../lib/demo-configuration.ts';
const id='a'.repeat(32),credential='synthetic-private-secret-never-returned';
const cronSecret='c'.repeat(43),operatorHash=createHash('sha256').update(cronSecret).digest('hex');
const environment={
 VERCEL:'1',VERCEL_ENV:'preview',VERCEL_URL:'stellar-bazaar-x402-synthetic.vercel.app',
 BAZAAR_PUBLIC_DEMO:'true',BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_ENABLE_MARKETPLACE:'true',BAZAAR_WORKSPACE_ADMISSION:'open',
 BAZAAR_WORKSPACE_BACKEND:'redis',BAZAAR_WORKSPACE_REDIS_REST_URL:'https://synthetic.upstash.io',BAZAAR_WORKSPACE_REDIS_REST_TOKEN:credential,
 BAZAAR_PROVIDER_REVIEW_BACKEND:'redis',BAZAAR_DEMO_NAMESPACE_ENV:'preview',
 BAZAAR_WORKSPACE_PREFIX:'bazaar-workspace:pilot-'+id,BAZAAR_MARKET_PREFIX:'bazaar-market:pilot-'+id,BAZAAR_REVIEW_PREFIX:'bazaar-review:pilot-'+id,
 BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'vercel-preview',BAZAAR_ENABLE_SELF_LISTING_INTAKE:'true',BAZAAR_MARKET_REVIEW_SECRET:credential,BAZAAR_MARKET_OPERATOR_HASH:operatorHash,CRON_SECRET:cronSecret,
 BAZAAR_ENABLE_MARKET_PURCHASES:'true',BAZAAR_X402_MARKETPLACE_ENABLED:'true',STELLAR_X402_FACILITATOR_URL:'https://channels.openzeppelin.com/x402/testnet',STELLAR_X402_FACILITATOR_API_KEY:credential,
 X402_ENABLE_LOCAL_PAYER:'false',BAZAAR_S3_BUCKET:'synthetic-private-bucket',BAZAAR_S3_REGION:'auto',BAZAAR_S3_ENDPOINT:'https://synthetic.r2.cloudflarestorage.com',
 BAZAAR_S3_ACCESS_KEY_ID:credential,BAZAAR_S3_SECRET_ACCESS_KEY:credential,BAZAAR_MARKET_FILE_PREFIX:'market-deliveries/v1/preview/'+id,BAZAAR_MARKET_FILES_ENABLED:'true',BAZAAR_MARKET_FILE_LIFECYCLE_ACK:'true',
};
const inspected=demoConfiguration(environment),serialized=JSON.stringify(inspected);
assert.equal(inspected.ready,true);assert.equal(inspected.r2Configured,true);assert.equal(inspected.features.privateFiles.enabled,true);
for(const v of [credential,cronSecret,operatorHash,environment.BAZAAR_WORKSPACE_REDIS_REST_URL,environment.BAZAAR_S3_BUCKET,environment.BAZAAR_S3_ENDPOINT,id])assert.ok(!serialized.includes(v),'The runtime result never contains environment values');
assert.equal(inspected.storageProbeRequired,true);assert.equal(inspected.pairedNamespaceEvidenceRequired,true);
const aliases={...environment,BAZAAR_S3_ACCESS_KEY_ID:' ',BAZAAR_S3_SECRET_ACCESS_KEY:undefined,BAZAAR_S3_KEY_ID:credential,BAZAAR_S3_APP_KEY:credential};
assert.equal(demoConfiguration(aliases).r2Configured,true,'Canonical and alternative credentials match the S3 adapter');
for(const name of ['BAZAAR_S3_BUCKET','BAZAAR_S3_REGION','BAZAAR_S3_ENDPOINT','BAZAAR_S3_ACCESS_KEY_ID','BAZAAR_S3_SECRET_ACCESS_KEY']){
 const missing=demoConfiguration({...environment,[name]:undefined});assert.equal(missing.r2Configured,false);assert.equal(missing.features.privateFiles.enabled,false);
}
for(const value of ['http://synthetic.r2.cloudflarestorage.com','https://user:secret@example.com','https://example.com/?token=secret','https://example.com/private'])assert.equal(demoConfiguration({...environment,BAZAAR_S3_ENDPOINT:value}).r2Configured,false);
const wrongStage=demoConfiguration({...environment,BAZAAR_DEMO_NAMESPACE_ENV:'production'});assert.equal(wrongStage.checks.namespaceStageMatches,false);assert.equal(wrongStage.features.catalogue.enabled,false);
assert.equal(inspected.checks.namespacesIndependent,true);assert.equal(inspected.checks.namespaceFamilyMatches,true);
for(const name of ['BAZAAR_WORKSPACE_PREFIX','BAZAAR_MARKET_PREFIX','BAZAAR_REVIEW_PREFIX','BAZAAR_MARKET_FILE_PREFIX']){
 const split=demoConfiguration({...environment,[name]:environment[name].replace(id,'d'.repeat(32))});assert.equal(split.checks.namespaceFamilyMatches,false);assert.equal(split.features.catalogue.enabled,false);assert.equal(split.features.purchases.enabled,false);assert.equal(split.checks.namespacesIndependent,true,'Separate stores still have distinct prefix strings; one pilot family is a different invariant');
}
assert.equal(demoConfiguration({...environment,BAZAAR_MARKET_FILE_PREFIX:'market-deliveries/v1/production/'+id}).features.privateFiles.enabled,false);
assert.equal(demoConfiguration({...environment,BAZAAR_MARKET_FILE_LIFECYCLE_ACK:undefined}).features.privateFiles.reason,'FILE_LIFECYCLE_BACKSTOP_REQUIRED');
const admissionsPaused=demoConfiguration({...environment,BAZAAR_WORKSPACE_CREATION_PAUSED:'true'});assert.equal(admissionsPaused.features.registration.reason,'ADMISSIONS_PAUSED');assert.equal(admissionsPaused.features.purchases.enabled,true,'New-account closure is independent of purchases');
const noPurchases=demoConfiguration({...environment,BAZAAR_ENABLE_MARKET_PURCHASES:'false'});assert.equal(noPurchases.features.purchases.reason,'PURCHASES_DISABLED');assert.equal(noPurchases.features.privateFiles.enabled,true,'Existing deliveries remain recoverable when purchases close');
assert.equal(demoConfiguration({...environment,X402_ENABLE_LOCAL_PAYER:'true'}).features.purchases.reason,'SERVER_PAYER_FORBIDDEN');
for(const key of [undefined,' ', 'x'.repeat(1025),'invalid\ncredential'])assert.equal(demoConfiguration({...environment,STELLAR_X402_FACILITATOR_API_KEY:key}).features.purchases.enabled,false,'Facilitator adapter constraints are effective configuration');
assert.equal(demoConfiguration({...environment,STELLAR_X402_RPC_URL:'https://soroban.stellar.org'}).features.purchases.enabled,false,'Fresh purchase cannot settle before discovering an invalid ledger transport');
assert.equal(demoConfiguration({...environment,STELLAR_X402_RPC_URL:'https://soroban-testnet.stellar.org'}).features.purchases.enabled,true);
assert.equal(demoConfiguration({...environment,BAZAAR_ENABLE_SELF_LISTING_INTAKE:'false'}).features.serviceSubmission.reason,'PROVIDER_INTAKE_DISABLED');
assert.equal(demoConfiguration({...environment,BAZAAR_PUBLIC_DEMO:'false'}).features.registration.reason,'PUBLIC_DEMO_DISABLED');
assert.equal(inspected.features.guardianAutomation.enabled,false);assert.equal(inspected.features.guardianAutomation.reason,'GUARDIAN_SCHEDULER_PRODUCTION_ONLY');assert.equal(inspected.guardianCron.productionDeployment,false);assert.equal(inspected.guardianCron.scheduledExecutionValidated,false);assert.equal(inspected.scheduledRunEvidenceRequired,true);
for(const secret of [undefined,'short',cronSecret+'\n','d'.repeat(43)]){
 const configuration=demoConfiguration({...environment,CRON_SECRET:secret});assert.equal(configuration.ready,false);assert.equal(configuration.features.guardianAutomation.reason,'GUARDIAN_CRON_CONFIGURATION_INCOMPLETE');assert.equal(configuration.checks.guardianCronMatchesOperator,false);assert.equal(configuration.features.moderation.enabled,true,'Manual operator access survives incomplete scheduled credentials');
}
const production=demoConfiguration({...environment,VERCEL_ENV:'production',BAZAAR_DEMO_NAMESPACE_ENV:'production',BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'https://bazaar.example',BAZAAR_MARKET_FILE_PREFIX:'market-deliveries/v1/production/'+id});assert.equal(production.guardianCron.productionDeployment,true);assert.equal(production.features.guardianAutomation.enabled,true);assert.equal(production.guardianCron.scheduledExecutionValidated,false);
console.log(JSON.stringify({status:'PASS',configurationOnly:true,noSecretOrEndpointValues:true,allFiveR2VariablesRequired:true,credentialAliases:true,stageAndObjectNamespaceChecks:true,guardianCronMatchesExistingOperator:true,scheduledExecutionRequiresSeparateEvidence:true,flagsIndependent:true,networkRequests:0}));
