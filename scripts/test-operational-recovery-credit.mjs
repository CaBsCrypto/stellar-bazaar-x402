import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { measuredHandler, meteredRedis } from '../lib/acceptance-meter.ts';
import { requireWorkspacePrincipal } from '../lib/workspace-auth.ts';
import { READ_WORKSPACE_LUA, setWorkspaceStoreForTests } from '../lib/workspace-store.ts';
import { setOperationalBudgetStoreForTests } from '../lib/operational-budget.ts';
import { WorkspaceError } from '../lib/workspace-types.ts';
const names=['BAZAAR_OPERATIONAL_METER','BAZAAR_OPERATIONAL_BUDGET','BAZAAR_ACCEPTANCE_METER','BAZAAR_ENABLE_OPEN_WORKSPACES','BAZAAR_WORKSPACE_PREFIX','BAZAAR_WORKSPACE_ADMISSION','BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE','BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY'];
const old=Object.fromEntries(names.map(name=>[name,process.env[name]])),info=console.info,logs=[];console.info=row=>logs.push(JSON.parse(row));
const prefix='bazaar-workspace:pilot-'+'d'.repeat(32),valid='v'.repeat(43),hash=createHash('sha256').update(valid).digest('hex');
Object.assign(process.env,{BAZAAR_OPERATIONAL_METER:'true',BAZAAR_OPERATIONAL_BUDGET:'true',BAZAAR_ACCEPTANCE_METER:'false',BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_WORKSPACE_PREFIX:prefix,BAZAAR_WORKSPACE_ADMISSION:'open',BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE:'120',BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY:'1000'});
let middleware,authReads=0;meteredRedis({use(fn){middleware=fn;}});
const admissions=[];let publicExhausted=false;
setOperationalBudgetStoreForTests({async reserve(kind){admissions.push(kind.profile);if(kind.profile==='public'&&publicExhausted)throw new WorkspaceError('OPERATIONAL_REQUEST_BUDGET',429);},async read(){},async refresh(){}});
setWorkspaceStoreForTests({async resolveHash(candidate){authReads++;await middleware({body:['eval',READ_WORKSPACE_LUA,3,prefix+':registry',prefix+':owner:none',prefix+':initialized']},async()=>({result:['{}','','workspace-v1']}));if(candidate!==hash)throw new WorkspaceError('UNAUTHORIZED',401);return {ownerId:'ow_test',workspaceId:'test',agentId:'agent_test',generation:1,role:'human'};}});
const handler=measuredHandler(async request=>{try{await requireWorkspacePrincipal(request.headers.get('authorization'));return Response.json({orders:[]});}catch(error){return Response.json({error:{code:error.code}},{status:error.status});}});
const request=token=>new Request('https://bazaar.example/api/market/orders',{headers:{authorization:'Bearer '+token}});
try {
  for(let i=0;i<10;i++)assert.equal((await handler(request('f'.repeat(43)))).status,401);
  assert.equal(admissions.filter(profile=>profile==='recovery').length,0,'Guessed valid-format bearers cannot debit recovery');
  publicExhausted=true;
  assert.equal((await handler(request('g'.repeat(43)))).status,401);
  const authorized=await handler(request(valid));assert.equal(authorized.status,200);assert.equal(admissions.at(-1),'recovery');assert.equal(authorized.headers.get('x-bazaar-redis-requests'),'1');
  assert.equal(authReads,12,'One bounded identity read per attempt, including the valid caller');
  const double=measuredHandler(async request=>{await requireWorkspacePrincipal(request.headers.get('authorization'));await requireWorkspacePrincipal(request.headers.get('authorization'));return new Response('ok');});
  const before=admissions.length;assert.equal((await double(request(valid))).status,200);assert.equal(admissions.length,before+1,'Multiple verified native calls share one admission');
  assert.ok(logs.every(row=>!JSON.stringify(row).includes(valid)));
  info(JSON.stringify({status:'PASS',fakeBearerCannotDebitRecovery:true,publicExhaustionDoesNotBlockValidRecovery:true,boundedPreauthCounted:true,verifiedNativeCallsChargedOnce:true,remoteRequests:0}));
}finally{console.info=info;setWorkspaceStoreForTests();setOperationalBudgetStoreForTests();for(const[name,value]of Object.entries(old))value===undefined?delete process.env[name]:process.env[name]=value;}
