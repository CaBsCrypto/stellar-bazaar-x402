import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {measuredHandler,meteredRedis,creditOperationalPrincipal,meteredExternal} from '../lib/acceptance-meter.ts';
import {classifyOperationalRequest} from '../lib/operational-pressure.ts';
import {operationalRequestEnvelope,setOperationalBudgetStoreForTests} from '../lib/operational-budget.ts';
import {OPERATIONAL_METADATA_ENVELOPE,OPERATIONAL_CONTROL_ENVELOPES,OPERATIONAL_TRANSPORT_ENVELOPES} from '../lib/operational-envelopes.ts';
import {READ_WORKSPACE_LUA,COMMIT_WORKSPACE_LUA,READ_MARKET_PERMISSION_LUA} from '../lib/workspace-store.ts';
import {MARKET_CAPACITY_CAS} from '../lib/marketplace-capacity.ts';

// Actual middleware, real reviewed Lua and wide bounded snapshots. This is a
// transport envelope fixture, not a valid account/database or provider bill.
const previous={...process.env},info=console.info;console.info=()=>{};
const prefix='bazaar-workspace:pilot-'+'8'.repeat(32),market=prefix.replace('workspace','market'),review=prefix.replace('workspace','review');
Object.assign(process.env,{BAZAAR_OPERATIONAL_METER:'true',BAZAAR_OPERATIONAL_BUDGET:'true',BAZAAR_ACCEPTANCE_METER:'false',BAZAAR_WORKSPACE_PREFIX:prefix});
let middleware,calls=0;
meteredRedis({use(fn){middleware=fn;}});
const keys=[prefix+':registry',prefix+':owner',prefix+':initialized'];
const registry=JSON.stringify({padding:'\\'.repeat(500000)}),document=JSON.stringify({padding:'\\'.repeat(60000)});
const ledger=JSON.stringify({padding:'\\'.repeat(30000)}),marketRaw=JSON.stringify({padding:'\\'.repeat(250000)}),reviewRaw=registry;
assert.ok(Buffer.byteLength(registry)<1048576);assert.ok(Buffer.byteLength(document)<131072);assert.ok(Buffer.byteLength(ledger)<65536);assert.ok(Buffer.byteLength(marketRaw)<524288);
const command=async(body,value)=>{calls++;return (await middleware({body},async()=>({result:value}))).result;};
setOperationalBudgetStoreForTests({async reserve(){await command(['get',prefix+':operations-budget:state'],ledger);await command(['eval',"redis.call('GET',KEYS[1]);redis.call('SET',KEYS[1],ARGV[3]);return 1",1,prefix+':operations-budget:state','present',ledger,ledger],1);},async read(){},async refresh(){}});
const read=owner=>command(['eval',READ_WORKSPACE_LUA,3,...keys,], [registry,owner?document:'','workspace-v1']);
const quota=async owner=>{for(let i=0;i<8;i++){await read(owner);const result=await command(['eval',COMMIT_WORKSPACE_LUA,3,...keys,registry,owner?document:'','workspace-v1',registry,''],i===7?1:0);if(result===1)return;}};
const request=(name,args={},token)=>new Request('https://bazaar.example/api/mcp',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+'a'.repeat(43)}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method:name==='initialize'?'initialize':'tools/call',params:name==='initialize'?{}:{name,arguments:args}})});
const samples=[];
try{
 for(const name of ['initialize','get_bazaar_identity','list_market_orders','report_market_capacity','get_bazaar_capabilities']){
  const authenticated=name!=='initialize',incoming=request(name,name==='report_market_capacity'?{ready:true}:name==='list_market_orders'?{limit:20,cursor:'x'.repeat(512)}:{},authenticated),kind=await classifyOperationalRequest(incoming);
  const expected=name==='initialize'?'metadata':name==='get_bazaar_identity'?'identity':name==='list_market_orders'?'orders':name==='report_market_capacity'?'capacity':'observed-metadata';assert.equal(kind.workload,expected);
  const start=calls;
  const response=await measuredHandler(async()=>{
   await quota(false);
   if(authenticated){await read(false);await creditOperationalPrincipal();await quota(true);}
   if(['get_bazaar_identity','report_market_capacity','get_bazaar_capabilities'].includes(name))await command(['eval',READ_MARKET_PERMISSION_LUA,4,...keys,prefix+':permission'],[registry,document,'workspace-v1','']);
   if(name==='list_market_orders')await command(['get',market+':state'],marketRaw);
   if(name==='report_market_capacity'){
    await command(['get',market+':state'],marketRaw);await command(['get',review+':state'],reviewRaw);await command(['get',market+':state'],marketRaw);await command(['get',market+':x402-settlements:state'],ledger);await command(['get',market+':capacity-reservations:v1'],ledger);
    await command(['eval',MARKET_CAPACITY_CAS,4,market+':state',market+':x402-settlements:state',market+':capacity-reservations:v1',keys[0],'present',marketRaw,'present',ledger,'present',ledger,marketRaw,'',ledger,'present',registry,'unchecked','',''],1);
   }
   if(name==='get_bazaar_capabilities'){await read(false);await read(true);await command(['eval',COMMIT_WORKSPACE_LUA,3,...keys,registry,document,'workspace-v1',registry,document],1);}
   return Response.json({ok:true});
  })(incoming);
  assert.equal(response.status,200);
  const envelope=expected==='metadata'?OPERATIONAL_METADATA_ENVELOPE:OPERATIONAL_CONTROL_ENVELOPES[expected];
  const measured={redisRequests:Number(response.headers.get('x-bazaar-redis-requests')),redisCommandsUpperBound:Number(response.headers.get('x-bazaar-redis-commands-upper-bound')),outboundBytes:Number(response.headers.get('x-bazaar-redis-outbound-payload-bytes')),inboundBytes:Number(response.headers.get('x-bazaar-redis-inbound-payload-bytes'))};
  assert.equal(measured.redisRequests,calls-start);assert.ok(measured.redisRequests<=envelope.redis);assert.ok(measured.redisCommandsUpperBound<=envelope.commandsUpperBound);assert.ok(measured.outboundBytes<=envelope.outboundPayloadBytes);assert.ok(measured.inboundBytes<=envelope.inboundPayloadBytes);
  samples.push({workload:expected,...measured,reserved:operationalRequestEnvelope(kind.profile,kind.workload)});
 }
 assert.equal(samples[0].redisRequests,18,'Metadata must include budget GET/CAS and eight ingress attempts, not the former two-request cutoff');
 assert.equal(samples[1].redisRequests,36);assert.equal(samples[2].redisRequests,36);assert.equal(samples[3].redisRequests,42);
 assert.equal((await classifyOperationalRequest(request('report_market_capacity',{ready:false},true))).newOperation,false,'Withdrawing readiness remains a control recovery');
 const direct=new Request('https://bazaar.example/api/account/identity');assert.equal((await classifyOperationalRequest(direct)).workload,'identity');
 assert.equal((await classifyOperationalRequest(new Request('https://bazaar.example/api/market/orders?limit=20'))).workload,'orders');
 const payment=request('create_market_order',{},true);assert.equal((await classifyOperationalRequest(payment)).workload,undefined);assert.equal(operationalRequestEnvelope('authenticated').externalRequests,3,'Payment allocation remains unchanged');
 await assert.rejects(measuredHandler(()=>meteredExternal('rpc',async()=>({})),{classify:()=>({profile:'recovery',newOperation:false,workload:'identity'})})(),/OPERATIONAL_EXTERNAL_BUDGET/);
 assert.equal(OPERATIONAL_TRANSPORT_ENVELOPES.authenticated.redis,112);assert.equal(OPERATIONAL_TRANSPORT_ENVELOPES.recovery.redis,64);
 info(JSON.stringify({status:'PASS',samples,reservationsAreNotConsumption:true,wideRegistryAndEightDefiniteCasConflicts:true,paymentExternalBoundsUnchanged:true,paymentBoundsIncludePublicDemoIngress:true,externalRequests:0,payments:0,cloudWrites:0}));
}finally{console.info=info;setOperationalBudgetStoreForTests();for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
