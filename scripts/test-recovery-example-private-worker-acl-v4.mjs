// Pure, injected protocol tests. No actual Redis, CLI, DPAPI or token issuer.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPrivateWorkerAclTransportV4,exactPrivateWorkerAclV4,PRIVATE_WORKER_ACL_PERMISSIONS as permissions,PRIVATE_IO_PINS as P} from './recovery-example-private-bootstrap-io-v4.mjs';
import {createPinnedManagementGuardFactoryV4} from './recovery-example-production-management-guard-v4.mjs';
import {guardianExistingIdleBudgetLua} from '../lib/guardian-finite-budget.ts';
const sha=v=>createHash('sha256').update(v).digest('hex'),prefixes=['bazaar-seller:production-'+'a'.repeat(32),'bazaar-seller:production-'+'b'.repeat(32)],issuer='i'.repeat(43),token='t'.repeat(43),name='bazaar_example_production_'+'a'.repeat(32),ledger='bazaar-workspace:pilot-0cd860b8cfc35fc459b4838fa9092007:{pilot-0cd860b8cfc35fc459b4838fa9092007}:continuous-free-budget:v1',acl={flags:['on','sanitize-payload'],passwords:['a'.repeat(64)],commands:'-@all '+permissions.map(v=>'+'+v).join(' '),keys:prefixes.map(v=>'~'+v+':*'),channels:[],selectors:[]};
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=async(fn,code)=>{await assert.rejects(fn,new RegExp(code));checks++;};
eq(exactPrivateWorkerAclV4(acl,prefixes),true);eq(exactPrivateWorkerAclV4(Object.entries(acl).flat(),prefixes),true);
for(const patch of [{keys:[...acl.keys,'~bazaar-workspace:*']},{commands:acl.commands+' +ping'},{commands:'-@all +@all'},{flags:['on','nopass']},{passwords:[]},{selectors:[{keys:'*'}]},{channels:['*']},{unexpected:true}])eq(exactPrivateWorkerAclV4({...acl,...patch},prefixes),false);
eq(exactPrivateWorkerAclV4(['flags',acl.flags,'flags',acl.flags],prefixes),false);
const bodies=[['ACL','GETUSER',name],['ACL','GENTOKEN',name],[['ACL','SETUSER',name,'reset','on','>'+token,'-@all',...prefixes.map(v=>'~'+v+':*'),...permissions.map(v=>'+'+v)],['ACL','GETUSER',name]],['GET',ledger]],config='{}';
function guard(){return createPinnedManagementGuardFactoryV4({nativeSourceDigest:'b6266def82f2962eae943c04a01f28f63f11c66279edb83da71c2709d91b875d'}).createExampleProductionManagementGuardV4({redisOrigin:P.redisOrigin,knownLedgerKeySha256:[sha(ledger)],administrativeDescriptors:[],prechargeConfigurationSha256:sha(config)});}
const g=guard();let effects=0;
const packet=index=>({index,body:bodies[index],workerPrefix:prefixes[0],runtimePrefix:prefixes[1],token:index>=2?token:undefined,deniedKey:ledger}),durable=index=>({confirmed:true,revision:index+1,bodySha256:sha(JSON.stringify(bodies[index]))});
await reject(()=>g.workerAclExchange(packet(0),durable(0),async()=>{effects++;return Response.json({result:null});}),'EXACT_WORKER');eq(effects,0);
await g.precharge({body:['EVAL',guardianExistingIdleBudgetLua(),1,ledger,config,JSON.stringify({action:'debit',profile:'background',commands:128,transferBytes:17039360})]},async()=>Response.json({result:[1,128,'background',60]}));
const transport=createPrivateWorkerAclTransportV4({issuerToken:issuer,workerPrefix:prefixes[0],runtimePrefix:prefixes[1],deniedKey:ledger,fetchImpl:async(url,init)=>{const current=effects++;eq(url,P.redisOrigin.replace(/\/$/,'')+(current===2?'/pipeline':'/'));eq(init.redirect,'error');eq(init.credentials,'omit');eq(new Headers(init.headers).has('cookie'),false);eq(new Headers(init.headers).get('authorization'),'Bearer '+(current===3?token:issuer));eq(JSON.parse(init.body),bodies[current]);return current===0?Response.json({result:null}):current===1?Response.json({result:token}):current===2?Response.json([{result:'OK'},{result:acl}]):Response.json({error:'NOPERM native key forbidden'},{status:403});}});
await reject(()=>g.workerAclExchange(packet(1),durable(1),transport.send),'EXACT_WORKER');eq(effects,0);
await reject(()=>g.workerAclExchange(packet(0),{...durable(0),confirmed:false},transport.send),'EXACT_WORKER');eq(effects,0);
for(let index=0;index<4;index++){const bytes=await g.workerAclExchange(packet(index),durable(index),transport.send);const value=JSON.parse(bytes);eq(index===3?value.error.startsWith('NOPERM'):!!value,true);bytes.fill(0);}
eq(effects,4);eq(g.snapshot().administrativeExchanges,4);eq(g.snapshot().prechargeRequests,1);eq(g.snapshot().redisCommandsUpper,9);eq(transport.snapshot().issuerTransferredToProvider,false);
await reject(()=>g.workerAclExchange(packet(3),durable(3),transport.send),'EXACT_WORKER');eq(effects,4);
const t=createPrivateWorkerAclTransportV4({issuerToken:issuer,workerPrefix:prefixes[0],runtimePrefix:prefixes[1],deniedKey:ledger,fetchImpl:async()=>{throw Error('UNEXPECTED_NETWORK');}}),base={url:P.redisOrigin,method:'POST',body:JSON.stringify(bodies[0]),headers:{},redirect:'error',credentials:'omit',cache:'no-store'};
await reject(()=>t.send({...base,url:'https://foreign.upstash.io/'}),'SEQUENCE');await reject(()=>t.send({...base,url:P.redisOrigin+'pipeline'}),'SEQUENCE');await reject(()=>t.send({...base,body:JSON.stringify(['ACL','SETUSER',name,'on','+@all'])}),'PACKET');eq(t.snapshot().calls,0);
console.log(JSON.stringify({status:'PASS_WORKER_TWO_PREFIX_ACL_FIXED_SEQUENCE_AND_SHARED_CREDIT',checks,actualNetworkRequests:0,actualAclChanges:0,payments:0,productionChanged:false}));
