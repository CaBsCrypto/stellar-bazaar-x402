import assert from 'node:assert/strict';
import {Redis} from '@upstash/redis';
import {createMarketGuardianRunner} from '../lib/market-guardian.ts';
import {createMarketStore} from '../lib/marketplace-store.ts';
import {createRedisWorkspaceStore,READ_WORKSPACE_MAINTENANCE_LUA} from '../lib/workspace-store.ts';
import {meteredRedis} from '../lib/acceptance-meter.ts';
import {READ_GUARDIAN_INDEX_POLICY_LUA,guardianExistingIdleBudgetLua,reserveFiniteGuardianIdle,initialGuardianPolicy,guardianWireObservation,withGuardianIdleWireScope} from '../lib/guardian-finite-budget.ts';
const prior={...process.env},oldFetch=globalThis.fetch,start=Date.parse('2026-10-13T00:00:00Z'),family='pilot-'+'c'.repeat(32),workspace='bazaar-workspace:'+family,market='bazaar-market:'+family,id='00000000-0000-4000-8000-000000000001',calls=[];let checks=0,idleUnavailable=false;
Object.assign(process.env,{BAZAAR_FREE_DEMO_MODE:'continuous',BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE:'example-text-wire/v3',BAZAAR_WORKSPACE_PREFIX:workspace,BAZAAR_WORKSPACE_REDIS_REST_URL:'https://guardian-sdk.synthetic.invalid',BAZAAR_WORKSPACE_REDIS_REST_TOKEN:'SYNTHETIC_LOCAL_ONLY'});
const index=JSON.stringify({version:1,nextExpiryAt:null,reconciliationDue:false,deliveryDue:false}),policy=JSON.stringify(initialGuardianPolicy(start)),workspaceIndex=JSON.stringify({version:1,registryRevision:id,initialized:true,nextExpiryAt:null});
const encode=v=>typeof v==='string'?Buffer.from(v).toString('base64'):Array.isArray(v)?v.map(encode):v;
globalThis.fetch=async(input,options)=>{
 assert.equal(String(input),'https://guardian-sdk.synthetic.invalid');checks++;const body=JSON.parse(options.body);calls.push(body[1]);assert.equal(body[0],'eval');checks++;
 let result;if(body[1]===guardianExistingIdleBudgetLua()){assert.equal(body[2],1);assert.deepEqual(JSON.parse(body.at(-1)),{action:'debit',profile:'background',commands:16,transferBytes:36864});checks+=2;result=idleUnavailable?[-2,0,'background',60]:[1,16,'background',60];}
 else if(body[1]===READ_GUARDIAN_INDEX_POLICY_LUA){assert.deepEqual(body.slice(3),[market+':maintenance-index:v1',market+':guardian-policy:v1']);checks++;result=[index,policy];}
 else if(body[1]===READ_WORKSPACE_MAINTENANCE_LUA){assert.deepEqual(body.slice(3),[workspace+`:{${family}}:maintenance`]);checks++;result=[workspaceIndex,String(start/1000),'0'];}
 else assert.fail('No other native Redis action in idle');
 return Response.json({result:encode(result)});
};
try{
 const client=()=>meteredRedis(new Redis({url:process.env.BAZAAR_WORKSPACE_REDIS_REST_URL,token:process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN,automaticDeserialization:false,retry:false,enableAutoPipelining:false}));
 const nativeMarket=createMarketStore(client(),market),nativeWorkspace=createRedisWorkspaceStore(client(),workspace,()=>({ownerIds:[],hashes:[]}));
 const run=createMarketGuardianRunner({now:()=>start,marketStore:()=>nativeMarket,workspaceStore:()=>nativeWorkspace,snapshot:async()=>assert.fail('No full snapshot'),cleanup:async()=>assert.fail('No full cleanup'),reconcile:async()=>assert.fail('No reconcile'),dispatch:async()=>assert.fail('No delivery')});
 // Nested runner starts a fresh idle scope; the real reserve function constructs
 // its own SDK client. Capture all three source-real clients in one fresh scope.
 let observation;const result=await withGuardianIdleWireScope(async()=>{
  await reserveFiniteGuardianIdle();
  const [m,w]=await Promise.all([nativeMarket.finiteGuardianMaintenanceIndex(),nativeWorkspace.maintenanceIndex()]);assert.equal(m.initialized,true);assert.equal(w.initialized,true);checks+=2;observation=guardianWireObservation();return {idle:true};
 });
 assert.equal(result.idle,true);assert.equal(calls.length,3);assert.equal(observation.requests,3);assert.equal(observation.commandsUpper,10);assert(observation.combinedUpperBytes<=36864);checks+=5;
 const before=calls.length;assert.equal((await run()).idle,true);assert.equal(calls.length-before,3);checks+=2;
 idleUnavailable=true;const beforeFailure=calls.length;await assert.rejects(run(),error=>error.code==='GUARDIAN_INITIAL_CREDIT_UNCONFIRMED'&&error.status===503&&error.guardian.needsOperator&&error.guardian.pendingWork==='unknown');checks++;assert.equal(calls.length-beforeFailure,1);checks++;
 const lua=guardianExistingIdleBudgetLua();assert(lua.includes("if not existing then return {-2,0,'background',60} end"));assert.equal((lua.match(/redis\.call\('GET'/g)??[]).length,1);checks+=2;
 console.log(JSON.stringify({status:'PASS_LOCAL_REAL_SDK_GUARDIAN_IDLE_CONSTRUCTION',checks,restPerIdleTick:3,redisCommandsUpper:10,combinedUpperBytes:observation.combinedUpperBytes,actualReserveFunctionHooked:true,actualSdkEncoding:true,externalRequests:0,realRedisLua:false,payments:0}));
}finally{globalThis.fetch=oldFetch;for(const name of Object.keys(process.env))if(!(name in prior))delete process.env[name];Object.assign(process.env,prior);}
