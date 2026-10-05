import assert from 'node:assert/strict';
import {measuredHandler,meteredExternal,meteredRedis,acceptanceStorageCaps} from '../lib/acceptance-meter.ts';
const prefix='bazaar-workspace:pilot-'+'c'.repeat(32),market=prefix.replace('bazaar-workspace:','bazaar-market:'),key=market+':x402-settlements:state';
Object.assign(process.env,{BAZAAR_ACCEPTANCE_METER:'true',BAZAAR_ACCEPTANCE_SALE:'true',BAZAAR_ACCEPTANCE_X402:'true',BAZAAR_WORKSPACE_PREFIX:prefix,BAZAAR_ACCEPTANCE_SETTLEMENT_KEY:key,BAZAAR_ACCEPTANCE_STORAGE_CAPS_JSON:JSON.stringify({workspace:6000,market:20000,review:5000,catalog:3000,settlement:15164})});
const logs=[],info=console.info;console.info=value=>logs.push(JSON.parse(value));let middleware,effects=0;
meteredRedis({use(fn){middleware=fn;}});const command=body=>middleware({body},async()=>{effects++;return {result:1};});
const run=measuredHandler(async fn=>{await fn();return new Response('ok');});
const lua="local raw=redis.call('GET',KEYS[1]);redis.call('SET',KEYS[1],ARGV[3]);return 1";
const value=JSON.stringify({version:1,revision:'public-revision',state:{version:1,records:[{phase:'uncertain',proof:'private-proof-fixture'}]}});
try{
 const response=await run(()=>command(['eval',lua,1,key,'missing','',value]));assert.equal(Number(response.headers.get('x-bazaar-settlement-stored-bytes-upper-bound')),Buffer.byteLength(key)+Buffer.byteLength(value));assert.equal(response.headers.get('x-bazaar-acceptance-meter'),'v2');
 const external=await run(async()=>{await meteredExternal('facilitator',async()=>({success:true}),undefined,()=>({outboundBytes:42,inboundBytes:43}));await meteredExternal('rpc',async()=>({status:'SUCCESS'}),undefined,()=>({outboundBytes:44,inboundBytes:45}));});assert.equal(external.headers.get('x-bazaar-external-facilitator'),'1');assert.equal(external.headers.get('x-bazaar-external-rpc'),'1');assert.equal(external.headers.get('x-bazaar-external-inbound-payload-bytes'),'88');
 const before=effects;await assert.rejects(run(()=>command(['eval',lua,1,key+'-other','missing','',value])),/WRITE_KEY_DENIED/);assert.equal(effects,before);
 process.env.BAZAAR_ACCEPTANCE_STORAGE_CAPS_JSON=JSON.stringify({workspace:6000,market:20000,review:5000,catalog:3000,settlement:1});await assert.rejects(run(()=>command(['eval',lua,1,key,'missing','',value])),/STORAGE_BUDGET/);assert.equal(effects,before);
 process.env.BAZAAR_ACCEPTANCE_STORAGE_CAPS_JSON=JSON.stringify({workspace:6000,market:20000,review:5000,catalog:3000,settlement:49164});assert.throws(acceptanceStorageCaps,/ALLOCATION_INVALID/);await assert.rejects(run(()=>command(['get',key])),/ALLOCATION_INVALID/);assert.equal(effects,before);
 assert.ok(logs.every(row=>!JSON.stringify(row).includes('private-proof-fixture')));info(JSON.stringify({status:'PASS',scope:'x402 settlement allocation/external counters/public-only logs',effectsOnDoubles:effects,remoteRequests:0,secretReads:0}));
}finally{console.info=info;}
