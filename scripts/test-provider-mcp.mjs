import assert from 'node:assert/strict';
import {MCP_TOOLS} from "../lib/mcp-tool-contract.ts";
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const directory=mkdtempSync(join(tmpdir(),'bazaar-mcp-synthetic-'));
const base='http://127.0.0.1:3280';
const clean=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(BAZAAR_|UPSTASH_|KV_|RESEND_|ADMIN_|X402_|STELLAR_X402_|VERCEL)/.test(k)));
let child;
async function start(intake='true',backend='file') {
  child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3280'],{stdio:'ignore',env:{...clean,NODE_ENV:'production',NEXT_PUBLIC_APP_URL:base,BAZAAR_PROVIDER_REVIEW_BACKEND:backend,BAZAAR_REVIEW_PREFIX:'bazaar-review:local-test',BAZAAR_PROVIDER_REVIEW_DIR:directory,BAZAAR_ENABLE_SELF_LISTING_INTAKE:intake,BAZAAR_ENABLE_PROVIDER_ACTIVATION:'false',BAZAAR_ENABLE_REGISTRY_MUTATIONS:'false',X402_PILOT_PAYMENTS_ENABLED:'false'}});
  for(let i=0;i<60;i++){try{if((await fetch(base+'/api/mcp')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Local server unavailable');
}
async function stop(){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}
async function connect(token){const c=new Client({name:'synthetic-provider-acceptance',version:'1'});await c.connect(new StreamableHTTPClientTransport(new URL(base+'/api/mcp'),{requestInit:{headers:token?{Authorization:`Bearer ${token}`}:{}}}));return c;}
const body=r=>r.structuredContent??JSON.parse(r.content[0].text);
const token=randomBytes(32).toString('hex'),id=randomUUID();
const card={version:'bazaar.service-card/v0',id:'synthetic-provider-mcp',name:'Synthetic MCP service',description:'Synthetic fixture, never publicly available',kind:'http',url:'https://api.example.com',routeTemplate:'/v1/report',input:[{name:'topic',type:'string',required:true}],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',amount:'0.001',destination:'GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ'},provider:{name:'Synthetic'},tags:['synthetic']};
const args={submissionId:id,card,controlProof:{method:'dns-txt',domain:'api.example.com'}};
let clients=[];
try {
  await start(); const a=await connect(token);clients.push(a);
  const list=await a.listTools();assert.deepEqual(list.tools.map(tool=>tool.name),MCP_TOOLS);
  assert.equal(list.tools.find(t=>t.name==='submit_provider_request').annotations.readOnlyHint,false);
  const skills=body(await a.callTool({name:'get_bazaar_skills',arguments:{role:'seller'}}));
  const downloaded=await (await fetch(base+skills.skills[0].download)).text();assert.equal(downloaded,skills.skills[0].instructions);
  assert.equal(body(await a.callTool({name:'validate_service_card',arguments:{card}})).valid,true);
  const sent=body(await a.callTool({name:'submit_provider_request',arguments:args}));assert.equal(sent.ok,true);assert.equal(sent.submission.publiclyActive,false);
  const b=await connect(token);clients.push(b);
  const concurrent=await Promise.all([a,b].map(c=>c.callTool({name:'submit_provider_request',arguments:args})));
  assert(concurrent.some(r=>body(r).ok===true));
  const same=body(await b.callTool({name:'get_provider_request_status',arguments:{submissionId:id}}));assert.equal(same.submission.submissionId,id);
  assert.equal(JSON.parse(readFileSync(join(directory,'review.json'),'utf8')).records.length,1);
  const altered=await a.callTool({name:'submit_provider_request',arguments:{...args,card:{...card,description:'Altered conditions are not the original submission'}}});assert.equal(altered.isError,true);assert.equal(body(altered).error.code,'SUBMISSION_CONFLICT');
  const stranger=await connect(randomBytes(32).toString('hex'));clients.push(stranger);
  assert.equal((await stranger.callTool({name:'get_provider_request_status',arguments:{submissionId:id}})).isError,true);
  assert.equal((await stranger.callTool({name:'get_operation_history',arguments:{}})).isError,true);
  const discovered=body(await a.callTool({name:'list_services',arguments:{}}));assert(!JSON.stringify(discovered).includes(card.id));
  const oversized=await fetch(base+'/api/mcp',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(65537)});assert.equal(oversized.status,413);
  for(const c of clients)await c.close().catch(()=>{});clients=[];await stop();
  await start('false');const restarted=await connect(token);clients.push(restarted);
  const recovered=body(await restarted.callTool({name:'get_provider_request_status',arguments:{submissionId:id}}));assert.equal(recovered.submission.submissionId,id);
  const closed=await restarted.callTool({name:'submit_provider_request',arguments:args});assert.equal(body(closed).error.code,'INTAKE_DISABLED');
  await restarted.close();clients=[];await stop();
  await start('true','redis');const unavailable=await connect(token);clients.push(unavailable);
  const blocked=await unavailable.callTool({name:'submit_provider_request',arguments:args});assert.equal(blocked.isError,true);
  assert.equal(JSON.parse(readFileSync(join(directory,'review.json'),'utf8')).records.length,1);
  console.log(JSON.stringify({ok:true,transport:'real MCP SDK + built localhost HTTP',storage:'isolated local file',skillsMatch:true,concurrency:true,restartRecovery:true,intakeClosed:true,storageUnavailable:true,privateIsolation:true,pendingNotPublic:true,realPayments:0,productionWrites:0}));
} finally {for(const c of clients)await c.close().catch(()=>{});if(child?.exitCode===null)await stop();}
