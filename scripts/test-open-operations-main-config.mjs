import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareOpenOperationsProjectTimeout} from './prepare-open-operations-project-timeout.mjs';
const config=JSON.parse(readFileSync(new URL('../docs/validation/open-operations-safe-config.json',import.meta.url),'utf8'));
const flags=config.prospectiveFlags,build={...flags,...config.buildOverrides},active={...flags,...config.afterAcceptanceOverrides};
const suffix='pilot-be8432d7255e0a3b0dca564d8aa769a0',origin='https://bazaar.browns.studio';
for(const env of [flags,build,active]){
 for(const key of ['BAZAAR_ACCEPTANCE_METER','BAZAAR_ACCEPTANCE_SALE','BAZAAR_ACCEPTANCE_X402'])assert.equal(env[key],'false');
 assert.equal(env.NEXT_PUBLIC_BAZAAR_MARKETPLACE,'true');assert.equal(env.NEXT_PUBLIC_APP_URL,origin);assert.equal(env.BAZAAR_WORKSPACE_PUBLIC_ORIGIN,origin);
 assert.equal(env.BAZAAR_ENABLE_MARKETPLACE,'true','Server layout mode must agree at build and runtime');
 assert.equal(env.BAZAAR_WORKSPACE_ADMISSION,'open');assert.equal(env.BAZAAR_WORKSPACE_INVITE_HASHES_JSON,'absent');
 for(const [name,prefix]of [['WORKSPACE','bazaar-workspace:'],['MARKET','bazaar-market:'],['REVIEW','bazaar-review:']])assert.equal(env['BAZAAR_'+name+'_PREFIX'],prefix+suffix);
 assert.equal(env.BAZAAR_DYNAMIC_PREFIX,'bazaar-market:'+suffix+':catalog');
 for(const key of config.removeAcceptanceMetadata)assert.equal(env[key],undefined);
}
for(const key of ['BAZAAR_OPERATIONAL_METER','BAZAAR_OPERATIONAL_BUDGET']){assert.equal(flags[key],'true');assert.equal(active[key],'true');assert.equal(build[key],'false');}
assert.equal(flags.BAZAAR_WORKSPACE_CREATION_PAUSED,'true');assert.equal(active.BAZAAR_WORKSPACE_CREATION_PAUSED,'false');
for(const key of ['BAZAAR_ENABLE_MARKET_PURCHASES','BAZAAR_X402_MARKETPLACE_ENABLED','BAZAAR_ENABLE_SELF_LISTING_INTAKE','BAZAAR_ENABLE_PROVIDER_ACTIVATION']){assert.equal(flags[key],'false');assert.equal(active[key],'true');}
assert.equal(config.privateConfiguration.checkpointJson,null);assert.ok(!String(config.privateConfiguration.workspaceRedisRestUrl).startsWith('https://'));
for(const key of config.buildSecretNamesMustBeAbsent)assert.equal(flags[key],undefined,'Public manifest has no credential value: '+key);
assert.equal(build.BAZAAR_WORKSPACE_REDIS_REST_URL,'https://build-only.invalid');assert.equal(build.BAZAAR_WORKSPACE_REDIS_REST_TOKEN,'offline-build-placeholder');assert.equal(config.buildWorkspaceConnectionIsSynthetic,true);assert.equal(config.buildMustPerformZeroStoreReads,true);assert.equal(config.builtPagesMustExcludeLegacyWebMcpProvider,true);
const fetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Configuration preparation must stay offline');};
try{const plan=prepareOpenOperationsProjectTimeout();assert.equal(plan.projectId,config.target.projectId);assert.equal(plan.teamId,config.target.teamId);assert.equal(plan.method,'PATCH');assert.equal(plan.remoteRequestPerformed,false);assert.equal(plan.sourceOnly,true);assert.deepEqual(plan.body,{resourceConfig:{functionDefaultTimeout:60}});assert.equal(plan.verify.expectedNodeVersion,'24.x');assert.equal(plan.verify.expectedFramework,'nextjs');}finally{globalThis.fetch=fetch;}
console.log(JSON.stringify({status:'PASS',sameExistingNamespace:true,allAcceptanceSwitchesFalse:true,newWorkPausedUntilAcceptance:true,buildClientModeMatchesRuntime:true,noSecretValues:true,timeoutPlanTargetsOnlyExistingProject:true,remoteRequests:0}));
