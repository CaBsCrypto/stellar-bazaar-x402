import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {measuredHandler,meteredRedis} from '../lib/acceptance-meter.ts';
import {requireWorkspacePrincipal} from '../lib/workspace-auth.ts';
import {READ_WORKSPACE_LUA,setWorkspaceStoreForTests} from '../lib/workspace-store.ts';
import {setOperationalBudgetStoreForTests} from '../lib/operational-budget.ts';
import {classifyOperationalRequest} from '../lib/operational-pressure.ts';
import {WorkspaceError} from '../lib/workspace-types.ts';
const names=['BAZAAR_OPERATIONAL_METER','BAZAAR_OPERATIONAL_BUDGET','BAZAAR_ACCEPTANCE_METER','BAZAAR_ENABLE_OPEN_WORKSPACES','BAZAAR_WORKSPACE_PREFIX','BAZAAR_WORKSPACE_ADMISSION','BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE','BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY'];
const old=Object.fromEntries(names.map(name=>[name,process.env[name]])),info=console.info,logs=[];console.info=row=>logs.push(JSON.parse(row));
const prefix='bazaar-workspace:pilot-'+'9'.repeat(32),valid='v'.repeat(43),human='h'.repeat(43),hash=value=>createHash('sha256').update(value).digest('hex');
Object.assign(process.env,{BAZAAR_OPERATIONAL_METER:'true',BAZAAR_OPERATIONAL_BUDGET:'true',BAZAAR_ACCEPTANCE_METER:'false',BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_WORKSPACE_PREFIX:prefix,BAZAAR_WORKSPACE_ADMISSION:'open',BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE:'120',BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY:'1000'});
let middleware,authReads=0,writes=0,publicExhausted=false,newWorkPaused=false;
meteredRedis({use(fn){middleware=fn;}});
const admissions=[];
setOperationalBudgetStoreForTests({async reserve(kind){admissions.push({...kind});if(kind.profile==='public'&&publicExhausted)throw new WorkspaceError('OPERATIONAL_REQUEST_BUDGET',429);if(kind.profile==='authenticated'&&newWorkPaused)throw new WorkspaceError('NEW_OPERATIONS_PAUSED',429);},async read(){},async refresh(){}});
setWorkspaceStoreForTests({async resolveHash(candidate){authReads++;await middleware({body:['eval',READ_WORKSPACE_LUA,3,prefix+':registry',prefix+':owner:none',prefix+':initialized']},async()=>({result:['{}','','workspace-v1']}));if(![hash(valid),hash(human)].includes(candidate))throw new WorkspaceError('UNAUTHORIZED',401);return {ownerId:'ow_test',workspaceId:'test',agentId:'agent_test',generation:1,role:candidate===hash(valid)?'agent':'human'};}});
const failure=error=>Response.json({error:{code:error.code}},{status:error.status??503});
const nested=measuredHandler(async request=>{await requireWorkspacePrincipal(request.headers.get('authorization'),'agent');writes++;return Response.json({created:true},{status:201});});
const handler=measuredHandler(async request=>{try{return await nested(request);}catch(error){return failure(error);}});
const request=(path,token,body={})=>new Request('https://bazaar.example'+path,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});
const cases=[['/api/market/orders',{}],['/api/market/services',{}],...['create_market_order','submit_market_service','submit_provider_request'].map(name=>['/api/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{}}}])];
try{
 for(let i=0;i<11;i++){const [path,body]=cases[i%cases.length];const denied=await handler(request(path,'f'.repeat(43),body));assert.equal(denied.status,401);assert.equal(denied.headers.get('x-bazaar-redis-requests'),'1');assert.equal(denied.headers.get('x-bazaar-redis-commands-upper-bound'),'4');}
 assert.equal(admissions.filter(kind=>kind.profile!=='public').length,0,'Fake bearers cannot reserve either private allocation');assert.equal(writes,0);
 publicExhausted=true;
 assert.equal((await handler(request('/api/market/orders','f'.repeat(43)))).status,401);
 for(const [path,body]of cases){const before=admissions.length,created=await handler(request(path,valid,body));assert.equal(created.status,201);assert.equal(admissions.length,before+1,'Outer MCP and native handlers share one new-work reservation');assert.deepEqual(admissions.at(-1),{profile:'authenticated',newOperation:true});}
 assert.equal(writes,cases.length);assert.equal(authReads,17);
 const beforeForbidden=admissions.filter(kind=>kind.profile==='authenticated').length;assert.equal((await handler(request('/api/market/orders',human))).status,403);assert.equal(admissions.filter(kind=>kind.profile==='authenticated').length,beforeForbidden,'Wrong requested role does not reserve new work');
 newWorkPaused=true;const beforePaused=writes,paused=await handler(request('/api/market/orders',valid));assert.equal(paused.status,429);assert.equal((await paused.json()).error.code,'NEW_OPERATIONS_PAUSED');assert.equal(writes,beforePaused,'Verified new work must reserve before its first business write');newWorkPaused=false;
 const bootstrap={creationId:randomUUID(),humanAccessHash:'a'.repeat(64),agentAccessHash:'b'.repeat(64)};
 for(const [path,body]of [['/api/workspaces',bootstrap],['/api/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'create_bazaar_workspace',arguments:bootstrap}}]]){
  const req=request(path,'b'.repeat(43),body);assert.equal((await classifyOperationalRequest(req)).bootstrapCreation,true);
  const before=admissions.length,readsBefore=authReads;
  const create=measuredHandler(async()=>{assert.equal(admissions.length,before+1);assert.equal(admissions.at(-1).profile,'authenticated');return Response.json({created:true},{status:201});});
  assert.equal((await create(req)).status,201);assert.equal(authReads,readsBefore,'New anonymous bootstrap has no existing principal to resolve');
 }
 for(const input of [{...bootstrap,ownerId:'ow_attacker'},{...bootstrap,creationId:'not-a-uuid'},{...bootstrap,humanAccessHash:'a'.repeat(65)}]){
  const req=request('/api/workspaces','b'.repeat(43),input);assert.equal((await classifyOperationalRequest(req)).bootstrapCreation,undefined);
  const before=admissions.filter(kind=>kind.profile==='authenticated').length;
  assert.equal((await measuredHandler(async()=>Response.json({error:'INVALID_REQUEST'},{status:400}))(req)).status,400);
  assert.equal(admissions.filter(kind=>kind.profile==='authenticated').length,before,'Malformed bootstrap intent cannot reserve the expensive profile');
 }
 assert.equal((await classifyOperationalRequest(request('/api/workspaces','bad',bootstrap))).bootstrapCreation,undefined);
 assert.ok(logs.every(row=>!JSON.stringify(row).includes(valid)&&!JSON.stringify(row).includes(human)));
 info(JSON.stringify({status:'PASS',elevenFakeBearersCannotDebitNewWork:true,publicExhaustionDoesNotBlockVerifiedNewWork:true,roleCheckedBeforeAdmission:true,nestedMcpChargedOnce:true,newWorkPausePrecedesWrite:true,bootstrapValidatedBeforeReservation:true,remoteRequests:0}));
}finally{console.info=info;setWorkspaceStoreForTests();setOperationalBudgetStoreForTests();for(const[name,value]of Object.entries(old))value===undefined?delete process.env[name]:process.env[name]=value;}
