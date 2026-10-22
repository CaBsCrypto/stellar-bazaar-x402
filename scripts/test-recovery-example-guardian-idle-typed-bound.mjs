import assert from 'node:assert/strict';
import {deriveGuardianIdleTypedBound} from './recovery-example-guardian-idle-typed-bound.mjs';
import {parseGuardianPolicy,initialGuardianPolicy} from '../lib/guardian-finite-budget.ts';
import {createMarketStore} from '../lib/marketplace-store.ts';
import {createRedisWorkspaceStore,READ_WORKSPACE_MAINTENANCE_LUA} from '../lib/workspace-store.ts';
const result=deriveGuardianIdleTypedBound();let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
equal(result.maximumCombinedBytes,35994);equal(result.maximumCommands,10);equal(result.bytesMargin,870);equal(result.commandsMargin,6);equal(result.allPrefixesFit,true);equal(result.scriptBytes,5760);
for(const row of result.rows){assert.ok(row.beforeSendUpperBytes<=36864);checks++;assert.ok(row.outboundUpperBytes>4096);checks++;}
const pad=value=>{const raw=JSON.stringify(value);return raw+'\n'.repeat(512-Buffer.byteLength(raw));};
const stamp=Date.parse('2026-10-13T00:00:00.000Z'),policy=pad(initialGuardianPolicy(stamp)),marketIndex=pad({version:1,nextExpiryAt:null,reconciliationDue:false,deliveryDue:false,operatorAttention:false}),workspaceIndex=pad({version:1,registryRevision:'22222222-2222-4222-8222-222222222222',initialized:true,nextExpiryAt:null});
equal(Buffer.byteLength(policy),512);equal(parseGuardianPolicy(policy),initialGuardianPolicy(stamp));
const prior=Object.fromEntries(['BAZAAR_FREE_DEMO_MODE','BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE'].map(name=>[name,process.env[name]]));let nativeCalls=0;
try{
 process.env.BAZAAR_FREE_DEMO_MODE='continuous';process.env.BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE='example-text-wire/v3';
 const market=createMarketStore({get:async()=>assert.fail('No extra GET'),eval:async(script,keys,args)=>{nativeCalls++;equal(keys.length,2);equal(args.length,0);return [marketIndex,policy];}},'bazaar-market:pilot-'+'a'.repeat(32));
 const snapshot=await market.finiteGuardianMaintenanceIndex();equal(snapshot.initialized,true);equal(snapshot.guardianPolicy,initialGuardianPolicy(stamp));equal(snapshot.index.reconciliationDue,false);
 const workspace=createRedisWorkspaceStore({eval:async(script,keys,args)=>{nativeCalls++;equal(script,READ_WORKSPACE_MAINTENANCE_LUA);equal(keys.length,1);equal(args.length,0);return [workspaceIndex,String(Math.floor(stamp/1000)),'0'];}},'bazaar-workspace:pilot-'+'a'.repeat(32),()=>({ownerIds:[],hashes:[]}));
 equal((await workspace.maintenanceIndex()).needsBootstrap,false);equal(nativeCalls,2);
 for(const [value,cap]of [[policy,512],[marketIndex,512],[workspaceIndex,512]]){assert.ok(Buffer.byteLength(JSON.stringify(value))<=2*cap+2);checks++;assert.ok(Buffer.byteLength(JSON.stringify(Buffer.from(value).toString('base64')))<=2*cap+2);checks++;}
 equal(result.networkRequests,0);equal(result.ledgerWrites,0);equal(result.payments,0);
 console.log(JSON.stringify({...result,checks,nativeReadMethodsValidated:true,validatedRaw512Fixtures:true,protocolDoubleNotRealRedis:true,modelConfigurationNotRuntimeChange:true}));
}finally{for(const[name,value]of Object.entries(prior))value===undefined?delete process.env[name]:process.env[name]=value;}
