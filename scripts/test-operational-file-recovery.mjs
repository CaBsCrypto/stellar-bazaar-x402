import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {classifyOperationalRequest} from '../lib/operational-pressure.ts';
import {createOperationalBudgetStore,OPERATIONAL_BUDGET_CAS,OPERATIONAL_REQUEST_ENVELOPE,operationalResources,setOperationalBudgetStoreForTests} from '../lib/operational-budget.ts';
import {measuredHandler,meteredRedis} from '../lib/acceptance-meter.ts';
import {requireWorkspacePrincipal} from '../lib/workspace-auth.ts';
import {READ_WORKSPACE_LUA,setWorkspaceStoreForTests} from '../lib/workspace-store.ts';
import {marketOperator} from '../lib/marketplace.ts';
import {WorkspaceError} from '../lib/workspace-types.ts';

const prior={...process.env},info=console.info,logs=[];
const prefix='bazaar-workspace:pilot-'+'d'.repeat(32),valid='v'.repeat(43),operator='o'.repeat(43),hash=value=>createHash('sha256').update(value).digest('hex');
const now=Date.now(),checkpoint={version:1,epoch:randomUUID(),observedAt:new Date(now).toISOString(),expiresAt:new Date(now+3600000).toISOString(),evidence:'synthetic-file-recovery-pressure',remaining:Object.fromEntries(operationalResources.map(name=>[name,OPERATIONAL_REQUEST_ENVELOPE[name]*400]))};
const data=new Map(),redis={async get(key){return data.get(key)??null;},async eval(script,[key],[mode,old,next]){assert.equal(script,OPERATIONAL_BUDGET_CAS);if(mode==='missing'?data.has(key):data.get(key)!==old)return 0;data.set(key,next);return 1;}};
const budget=createOperationalBudgetStore(redis,prefix,()=>checkpoint);
const request=(path,body,token=valid)=>new Request('https://bazaar.example'+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const mcp=name=>({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{operationId:randomUUID()}}});
const recoveryCases=[
 ...['prepare_market_delivery','confirm_market_delivery','get_market_delivery','get_bazaar_identity','get_bazaar_query_history','complete_wallet_binding'].map(name=>({path:'/api/mcp',body:mcp(name)})),
 {path:'/api/market/orders/'+randomUUID()+'/deliveries',body:{}},
 {path:'/api/market/orders/'+randomUUID()+'/deliveries/confirm',body:{}},
 {path:'/api/account/wallet/complete',body:{}},
 ...['run','reconcile','probe-storage'].map(action=>({path:'/api/market/guardian',body:{action},token:operator})),
];
const freshCases=[{path:'/api/market/orders',body:{}},{path:'/api/mcp',body:mcp('create_market_order')},{path:'/api/mcp',body:mcp('request_wallet_binding')},{path:'/api/account/wallet/challenge',body:{}}];
let middleware,writes=0;
try{
 for(const key of Object.keys(process.env))if(/^(BAZAAR_|VERCEL)/.test(key))delete process.env[key];
 Object.assign(process.env,{NODE_ENV:'test',BAZAAR_OPERATIONAL_METER:'true',BAZAAR_OPERATIONAL_BUDGET:'true',BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_WORKSPACE_PREFIX:prefix,BAZAAR_WORKSPACE_ADMISSION:'open',BAZAAR_MARKET_OPERATOR_HASH:hash(operator)});
 console.info=row=>logs.push(JSON.parse(row));meteredRedis({use(fn){middleware=fn;}});
 setWorkspaceStoreForTests({async resolveHash(candidate){await middleware({body:['eval',READ_WORKSPACE_LUA,3,prefix+':registry',prefix+':owner:none',prefix+':initialized']},async()=>({result:['{}','','workspace-v1']}));if(candidate!==hash(valid))throw new WorkspaceError('UNAUTHORIZED',401);return {ownerId:'ow_fixture',workspaceId:'fixture',agentId:'agent_fixture',generation:1,role:'agent'};}});
 setOperationalBudgetStoreForTests(budget);
 for(let i=0;i<75;i++)await budget.reserve({profile:'authenticated',newOperation:true});
 assert.equal((await budget.read()).profiles.authenticated.pressure.requests.paused,true);
 const native=measuredHandler(async req=>{if(new URL(req.url).pathname==='/api/market/guardian')await marketOperator(req.headers.get('authorization'));else await requireWorkspacePrincipal(req.headers.get('authorization'),'agent');writes++;return Response.json({accepted:true});});
 const handler=measuredHandler(async req=>{try{return await native(req);}catch(error){return Response.json({error:{code:error.code}},{status:error.status??503});}});
 for(const item of recoveryCases){
  const req=request(item.path,item.body,item.token);assert.deepEqual(await classifyOperationalRequest(req),{profile:'recovery',newOperation:false});
  const before=await budget.read(),used=before.profiles.recovery.used.requests;
  const denied=await handler(request(item.path,item.body,'f'.repeat(43)));assert.equal(denied.status,401);assert.equal((await budget.read()).profiles.recovery.used.requests,used,'Invalid caller cannot debit paid-delivery recovery');
  const response=await handler(req);assert.equal(response.status,200,item.path+' remains admitted after the new-work pause');assert.equal(response.headers.get('x-bazaar-operational-meter'),'v1');
  const after=await budget.read();assert.equal(after.profiles.recovery.used.requests,used+1,'Nested MCP/native handling charges recovery exactly once');assert.equal(after.profiles.authenticated.used.requests,75);
 }
 assert.equal(writes,recoveryCases.length);
 for(const item of freshCases){const req=request(item.path,item.body);assert.deepEqual(await classifyOperationalRequest(req),{profile:'authenticated',newOperation:true});const before=writes,response=await handler(req);assert.equal(response.status,429);assert.equal((await response.json()).error.code,'NEW_OPERATIONS_PAUSED');assert.equal(writes,before,'Fresh work stops before business effects');}
 assert.ok(logs.every(row=>!JSON.stringify(row).includes(valid)&&!JSON.stringify(row).includes(operator)));
 info(JSON.stringify({status:'PASS',remoteRequests:0,payments:0,operationalNewWorkPressurePercent:75,recoveryCases:recoveryCases.length,freshWorkCases:freshCases.length,checks:['file MCP and native delivery routes use paid-completion reserve','private identity/history and existing wallet proof remain available','manual guardian run/reconcile/probe use recovery reserve','invalid callers cannot consume private reserve','nested native/MCP charged once','new order and new wallet challenge remain blocked before effects'],scope:'measured admission boundary with synthetic budget/authentication; file payment/ownership enforced by file-handler tests'}));
}finally{console.info=info;setWorkspaceStoreForTests();setOperationalBudgetStoreForTests();for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior);}
