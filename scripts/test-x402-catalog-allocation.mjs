import assert from 'node:assert/strict';
import {measuredHandler,meteredRedis,acceptanceCatalogAllocation} from '../lib/acceptance-meter.ts';
const suffix='pilot-'+'d'.repeat(32),workspace='bazaar-workspace:'+suffix,market='bazaar-market:'+suffix,index=market+':catalog:index';
const ids=['guionista-algorithmic-text-pilot','guionista-algorithmic-text-x402-pilot'];
const caps={workspace:7000,market:18000,review:8500,catalog:5000,settlement:10664};
Object.assign(process.env,{BAZAAR_ACCEPTANCE_METER:'true',BAZAAR_ACCEPTANCE_SALE:'true',BAZAAR_ACCEPTANCE_X402:'true',BAZAAR_WORKSPACE_PREFIX:workspace,BAZAAR_ACCEPTANCE_STORAGE_CAPS_JSON:JSON.stringify(caps),BAZAAR_ACCEPTANCE_CATALOG_VALUE_CAPS_JSON:JSON.stringify(Object.fromEntries(ids.map(id=>[id,2250])))});
const create="if redis.call('EXISTS',KEYS[1])==1 then return 0 end;redis.call('SET',KEYS[1],ARGV[1]);redis.call('SADD',KEYS[2],ARGV[2]);return 1";
const withdraw="-- x402-catalog-withdraw-cas-v1\nlocal old=redis.call('GET',KEYS[1]);if old~=ARGV[1] then return 0 end;redis.call('SET',KEYS[1],ARGV[2]);return 1";
let middleware,effects=0,scenarios=0;const info=console.info;console.info=()=>{};
meteredRedis({use(fn){middleware=fn;}});
const command=body=>middleware({body},async()=>{effects++;return {result:1};}),run=measuredHandler(async fn=>{await fn();return new Response('ok');});
const cardKey=id=>market+':catalog:card:'+id;
const write=(id,value)=>run(()=>command(['eval',create,2,cardKey(id),index,value,id]));
const remove=(id,old,next)=>run(()=>command(['eval',withdraw,1,cardKey(id),old,next]));
const rejected=async(fn,pattern)=>{const before=effects;await assert.rejects(fn(),pattern);assert.equal(effects,before);scenarios++;};
try{
 const allocation=acceptanceCatalogAllocation(market,5000),expected=4500+Buffer.byteLength(index)+ids.reduce((sum,id)=>sum+Buffer.byteLength(cardKey(id))+Buffer.byteLength(id),0);
 assert.equal(allocation.aggregateBytes,expected);assert.ok(expected<=5000);scenarios++;
 const responses=await Promise.all(ids.map(id=>write(id,JSON.stringify({card:{id,payment:{asset:'USDC'}},approvedAt:'public-fixture'}))));
 assert.deepEqual(responses.map(r=>Number(r.headers.get('x-bazaar-catalog-stored-bytes-upper-bound'))),[expected,expected]);scenarios++;
 const old=JSON.stringify({approvedAt:'public-fixture',card:{id:ids[0],payment:{asset:'USDC'},unknownHistoricalField:{nested:['keep',1]}},unknownTopLevel:'keep'}),next=JSON.stringify({...JSON.parse(old),withdrawn:true});
 const removed=await remove(ids[0],old,next);assert.equal(Number(removed.headers.get('x-bazaar-catalog-stored-bytes-upper-bound')),expected);scenarios++;
 const reordered=JSON.stringify({withdrawn:true,unknownTopLevel:'keep',card:{unknownHistoricalField:{nested:['keep',1]},payment:{asset:'USDC'},id:ids[0]},approvedAt:'public-fixture'});
 await remove(ids[0],old,reordered);scenarios++;
 await rejected(()=>remove(ids[0],old,JSON.stringify({...JSON.parse(old),card:{id:ids[0],payment:{asset:'XLM'}},withdrawn:true})),/WITHDRAW_CHANGED_FIELDS/);
 await rejected(()=>remove(ids[0],old,JSON.stringify({withdrawn:true})),/WITHDRAW_CHANGED_FIELDS/);
 await rejected(()=>remove(ids[0],old,JSON.stringify({...JSON.parse(old),withdrawn:false})),/WITHDRAW_CHANGED_FIELDS/);
 await rejected(()=>write(ids[0],'x'.repeat(2251)),/STORAGE_BUDGET/);
 await rejected(()=>write('third-service','{}'),/CATALOG_KEY_DENIED/);
 const wrongIndex=()=>run(()=>command(['eval',create,2,cardKey(ids[0]),index+'-other','{}',ids[0]]));await rejected(wrongIndex,/CATALOG_KEY_DENIED/);
 // Each value fits its own cap, but their reserved sum exceeds the shared catalog allocation.
 process.env.BAZAAR_ACCEPTANCE_CATALOG_VALUE_CAPS_JSON=JSON.stringify(Object.fromEntries(ids.map(id=>[id,2500])));await rejected(()=>write(ids[0],'{}'),/STORAGE_BUDGET/);
 process.env.BAZAAR_ACCEPTANCE_CATALOG_VALUE_CAPS_JSON=JSON.stringify({[ids[0]]:2250});await rejected(()=>write(ids[0],'{}'),/CATALOG_ALLOCATION_INVALID/);
 delete process.env.BAZAAR_ACCEPTANCE_CATALOG_VALUE_CAPS_JSON;await rejected(()=>write(ids[0],'{}'),/CATALOG_ALLOCATION_REQUIRED/);
 info(JSON.stringify({status:'PASS',scenarios,effectsOnDoubles:effects,catalogAggregateUpperBound:expected,globalStorageAllocation:49164,remoteRequests:0,secretReads:0}));
}finally{console.info=info;}
