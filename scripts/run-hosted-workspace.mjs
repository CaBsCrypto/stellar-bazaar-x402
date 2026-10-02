import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {loadPacket,savePacket} from './marketplace-private-packet.mjs';
const phase=process.argv[2];assert.ok(['journey','replacement','rotate','revoke','verify-revoked'].includes(phase));
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const readJson=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const manifest=await readJson('docs/evidence/sprint-marketplace/hosted-workspace-manifest.json');
assert.equal(manifest.readiness.canExecute,true,'PLAN_NOT_READY');
const deployment=await readJson('docs/evidence/sprint-marketplace/hosted-workspace-current.json');
const origin=new URL(deployment.url).origin;assert.match(origin,/^https:\/\/stellar-bazaar-x402-[a-z0-9]+-cabscryptocontacto-6028s-projects\.vercel\.app$/);
const packet=await loadPacket();assert.equal(packet.planId,manifest.planId);assert.ok(!packet.completed.includes(phase),'PHASE_ALREADY_COMPLETE_DO_NOT_REPLAY');
const auth=await readJson(join(tmpdir(),'bazaar-vercel-auth-preview','auth.json'));
const reportPath='docs/evidence/sprint-marketplace/hosted-workspace-http.json';
let report;try{report=await readJson(reportPath);}catch(e){if(e.code!=='ENOENT')throw e;const probe=await readJson('docs/evidence/sprint-marketplace/hosted-counter-probe.json');assert.equal(probe.status,'PASS');report={version:1,planId:packet.planId,status:'IN_PROGRESS',appRequests:probe.appRequests,redisRequests:probe.redisRequests,commandsUpperBound:probe.commandsUpperBound,outboundPayloadBytes:probe.outboundPayloadBytes,inboundPayloadBytes:probe.inboundPayloadBytes,activeExecutionMs:12000,ledgerRequests:0,facilitatorRequests:0,retries:0,attempts:[{phase:'readonly-counter-probe',requestId:probe.requestId,deploymentId:probe.deploymentId,status:'CONFIRMED'}],phases:[]};}
assert.equal(report.planId,packet.planId);assert.notEqual(report.status,'UNCERTAIN','STOPPED_DO_NOT_RETRY');
report.workspaceStoredBytesUpperBound??=0;
const start=Date.now(),baseMs=report.activeExecutionMs;
async function persist(){report.activeExecutionMs=baseMs+Date.now()-start;await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');}
const quoted=v=>'"'+v.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\r','\\r').replaceAll('\n','\\n')+'"';
async function appFetch(input,init={}){
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);assert.equal(url.origin,origin);assert.equal(url.search,'');
 const method=init.method??'GET',headers=new Headers(init.headers),body=init.body===undefined?'':String(init.body);
 assert.ok(report.appRequests+1<=manifest.limits.appRequests-manifest.browserReserve.appRequests);assert.ok(report.redisRequests+32<=manifest.limits.redisRestExchanges-manifest.browserReserve.redisRestExchanges);assert.ok(report.commandsUpperBound+224<=manifest.limits.redisCommandsUpperBound-manifest.browserReserve.redisCommandsUpperBound);assert.ok(baseMs+Date.now()-start<manifest.limits.activeExecutionSeconds*1000);
 const attempt={phase,path:url.pathname,method,payloadHash:hash(body),deploymentId:deployment.id,status:'PENDING'};report.attempts.push(attempt);report.appRequests++;await persist();
 let config='';for(const [name,value]of headers)config+='header = '+quoted(name+': '+value)+'\n';if(body)config+='data = '+quoted(body)+'\n';
 const args=[join(tmpdir(),'bazaar-vercel-cli-preview','node_modules/vercel/dist/index.js'),'curl',url.pathname,'--deployment',origin,'--','--request',method,'--max-time','12','--retry','0','--silent','--show-error','--include','--config','-'];
 let raw;
 try{raw=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{env:{...process.env,VERCEL_TOKEN:auth.token,VERCEL_TELEMETRY_DISABLED:'1'},windowsHide:true,stdio:['pipe','pipe','pipe']});let text='';child.stdout.on('data',part=>{text+=part;if(text.length>1048576){child.kill();reject(Error('RESPONSE_OVERSIZE'));}});child.stderr.on('data',()=>{});child.on('error',()=>reject(Error('TRANSPORT_UNCONFIRMED')));child.on('close',code=>code?reject(Error('TRANSPORT_UNCONFIRMED')):resolve(text));child.stdin.end(config);});}catch(e){attempt.status='UNCERTAIN';report.status='UNCERTAIN';await persist();throw e;}
 const blocks=[...raw.matchAll(/HTTP\/[\d.]+ (\d{3})[^\r\n]*\r?\n([\s\S]*?)\r?\n\r?\n/g)];const block=blocks.at(-1);if(!block){report.status='UNCERTAIN';await persist();throw Error('HTTP_ENVELOPE_UNCONFIRMED');}
 const responseHeaders=new Headers();for(const line of block[2].split(/\r?\n/)){const split=line.indexOf(':');if(split>0)responseHeaders.append(line.slice(0,split),line.slice(split+1).trim());}
 attempt.httpStatus=Number(block[1]);attempt.requestId=responseHeaders.get('x-bazaar-acceptance-request-id');
 const values={redisRequests:'x-bazaar-redis-requests',commandsUpperBound:'x-bazaar-redis-commands-upper-bound',outboundPayloadBytes:'x-bazaar-redis-outbound-payload-bytes',inboundPayloadBytes:'x-bazaar-redis-inbound-payload-bytes'};
 for(const [name,header]of Object.entries(values)){const value=responseHeaders.get(header);if(!/^\d+$/.test(value??'')){report.status='UNCERTAIN';await persist();throw Error('METER_MISSING_STOP');}attempt[name]=Number(value);report[name]+=Number(value);}
 const stored=responseHeaders.get('x-bazaar-workspace-stored-bytes-upper-bound');if(!/^\d+$/.test(stored??'')){report.status='UNCERTAIN';await persist();throw Error('STORAGE_METER_MISSING_STOP');}report.workspaceStoredBytesUpperBound=Math.max(report.workspaceStoredBytesUpperBound,Number(stored));assert.ok(report.workspaceStoredBytesUpperBound<=manifest.limits.newStoredBytes);
 if(responseHeaders.get('x-bazaar-redis-uncertain')!=='false'){attempt.status='UNCERTAIN';report.status='UNCERTAIN';await persist();throw Error('REDIS_OUTCOME_UNCONFIRMED_STOP');}
 for(const [name,limit]of [['redisRequests','redisRestExchanges'],['commandsUpperBound','redisCommandsUpperBound'],['outboundPayloadBytes','outboundPayloadBytes'],['inboundPayloadBytes','inboundPayloadBytes']])assert.ok(report[name]<=manifest.limits[limit]);
 attempt.status='CONFIRMED';await persist();
 return new Response([204,304].includes(attempt.httpStatus)?null:raw.slice(block.index+block[0].length),{status:attempt.httpStatus,headers:responseHeaders});
}
async function http(path,token,body,expected=200){const response=await appFetch(origin+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.equal(response.status,expected,'STATUS_MISMATCH_'+path);return response.json();}
async function mcp(token,fn){const client=new Client({name:'bazaar-hosted-synthetic-external-agent',version:'1'});try{await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/api/mcp'),{requestInit:{headers:{authorization:'Bearer '+token}},fetch:appFetch,reconnectionOptions:{maxRetries:0}}));return await fn(client);}finally{await client.close();}}
async function tool(client,name,args){const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,'MCP_TOOL_REJECTED_'+name);return result;}
const a=packet.identities[0],b=packet.identities[1];
try{
 if(phase==='journey'){
  for(const [i,v]of packet.identities.entries()){const receipt=(await http('/api/workspaces',v.bootstrap,packet.creations[i],201)).record;assert.match(receipt.ownerId,/^ow_[a-f0-9]{32}$/);packet.receipt[i]=receipt;await savePacket(packet);}
  assert.equal((await http('/api/workspaces',a.bootstrap,packet.creations[0])).record.ownerId,packet.receipt[0].ownerId);
  await http('/api/conversations',a.human,packet.conversation,201);await http('/api/conversations',a.human,packet.conversation);
  const path='/api/conversations/'+packet.conversation.conversationId+'/messages';
  await http(path,a.human,packet.message,201);await http(path,a.human,packet.message);await http(path,a.human,{...packet.message,text:'Contenido distinto'},409);
  await http(path,b.human,undefined,404);await http(path,'q'.repeat(43),undefined,401);
  await mcp(a.agent,async client=>{assert.ok((await client.listTools()).tools.some(t=>t.name==='respond_bazaar_agent_task'));await tool(client,'list_bazaar_agent_tasks',{});await tool(client,'claim_bazaar_agent_task',{taskId:packet.message.taskId,...packet.claim});await tool(client,'record_bazaar_operation',{operation:packet.operation});const response={taskId:packet.message.taskId,attemptId:packet.claim.attemptId,...packet.response,operationId:packet.operation.clientOperationId};await tool(client,'respond_bazaar_agent_task',response);await tool(client,'respond_bazaar_agent_task',response);});
  packet.originalConversation=(await http(path,a.human)).conversation;packet.originalHistory=(await http('/api/operations',a.human)).records;
  assert.equal(packet.originalConversation.messages.length,2);assert.equal(packet.originalHistory.length,1);assert.equal(packet.originalHistory[0].delivery.result.text,packet.response.text);assert.equal((await http('/api/operations',b.human)).records.length,0);
 } else if(phase==='replacement'){
  assert.ok(packet.completed.includes('journey'));
  assert.deepEqual((await http('/api/conversations/'+packet.conversation.conversationId+'/messages',a.human)).conversation,packet.originalConversation);assert.deepEqual((await http('/api/operations',a.human)).records,packet.originalHistory);await http('/api/conversations/'+packet.conversation.conversationId+'/messages',b.human,undefined,404);
 } else if(phase==='rotate'){
  assert.ok(packet.completed.includes('replacement'));
  const path='/api/workspaces/'+packet.receipt[0].workspaceId+'/access';
  const human={action:'rotate',role:'human',accessHash:hash(a.rotatedHuman),expectedGeneration:1};await http(path,a.bootstrap,human);await http(path,a.bootstrap,human);await http('/api/operations',a.human,undefined,401);assert.deepEqual((await http('/api/operations',a.rotatedHuman)).records,packet.originalHistory);
  await http(path,a.bootstrap,{action:'rotate',role:'agent',accessHash:hash(a.rotatedAgent),expectedGeneration:2});await http('/api/agent-tasks',a.agent,undefined,401);await mcp(a.rotatedAgent,client=>tool(client,'list_bazaar_agent_tasks',{}));
 } else if(phase==='revoke'){
  assert.ok(packet.completed.includes('rotate'));
  await http('/api/workspaces/'+packet.receipt[0].workspaceId+'/access',a.bootstrap,{action:'revoke',expectedGeneration:3});await http('/api/operations',a.rotatedHuman,undefined,401);await http('/api/agent-tasks',a.rotatedAgent,undefined,401);assert.equal((await http('/api/operations',b.human)).records.length,0);
 } else {
  assert.ok(packet.completed.includes('revoke'));await http('/api/operations',a.rotatedHuman,undefined,401);await http('/api/agent-tasks',a.rotatedAgent,undefined,401);assert.equal((await http('/api/operations',b.human)).records.length,0);assert.equal((await http('/api/workspaces',a.bootstrap,packet.creations[0])).record.revoked,true);await http('/api/workspaces',b.bootstrap,packet.pauseProbe,503);
 }
 packet.completed.push(phase);await savePacket(packet);report.phases.push({phase,deploymentId:deployment.id,passed:true});report.status='PASS_EXECUTED_PHASES';await persist();console.log(JSON.stringify({status:'PASS',phase,appRequests:report.appRequests,redisRequests:report.redisRequests,commandsUpperBound:report.commandsUpperBound,ledgerRequests:0,productionChanges:0}));
}catch(error){if(report.status!=='UNCERTAIN')report.status='FAILED_CONFIRMED';await persist();console.error(error.message);process.exitCode=1;}
