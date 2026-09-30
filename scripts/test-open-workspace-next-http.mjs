import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, access, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cwd=process.cwd(), next=join(cwd,'node_modules/next/dist/bin/next');
const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
Object.assign(env,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'});
async function run(args){return new Promise((resolveRun,reject)=>{const child=spawn(process.execPath,[next,...args],{cwd,env});let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);child.on('error',reject);child.on('exit',code=>code===0?resolveRun():reject(Error(output.slice(-5000))));});}
if(process.argv.includes('--build'))await run(['build','--webpack']);
await access(join(cwd,'.next/BUILD_ID'));
const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const base='http://127.0.0.1:'+port, dir=await mkdtemp(join(tmpdir(),'bazaar-workspace-next-'));
const child=spawn(process.execPath,[next,'start','-H','127.0.0.1','-p',String(port)],{cwd,env:{...env,BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_WORKSPACE_BACKEND:'file',BAZAAR_WORKSPACE_FILE_DIRECTORY:dir,BAZAAR_WORKSPACE_LOCAL_ORIGIN:base}});
let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);
try {
  const until=Date.now()+30000;let ready=false;
  while(Date.now()<until){try{const r=await fetch(base+'/api/workspaces');if(r.status===405){ready=true;break;}}catch{}if(child.exitCode!==null)throw Error(output.slice(-3000));await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,'Next production server did not become ready');
  const tokens=Object.fromEntries(['bootstrap','human','agent'].map(role=>[role,randomBytes(32).toString('base64url')])),hash=v=>createHash('sha256').update(v).digest('hex');
  const body={creationId:randomUUID(),humanAccessHash:hash(tokens.human),agentAccessHash:hash(tokens.agent)};
  async function invoke(path,token,value,headers={}){return new Promise((resolveRequest,reject)=>{const request=httpRequest(base+path,{method:value===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,origin:base,...(value===undefined?{}:{'content-type':'application/json'}),...headers}},response=>{let text='';response.on('data',chunk=>text+=chunk);response.on('end',()=>{try{resolveRequest({status:response.statusCode,body:JSON.parse(text)});}catch(e){reject(e);}});});request.on('error',reject);if(value!==undefined)request.write(JSON.stringify(value));request.end();});}
  const created=await invoke('/api/workspaces',tokens.bootstrap,body);assert.equal(created.status,201,JSON.stringify({status:created.status,code:created.body.error?.code}));
  assert.equal((await invoke('/api/workspaces',tokens.bootstrap,body)).status,200);
  assert.equal((await invoke('/api/operations',tokens.human)).status,200);
  const operation={clientOperationId:'native-next-synthetic',mode:'mock',service:{id:'fixture',title:'Synthetic fixture',provider:'Synthetic fixture',url:base+'/synthetic'},payment:{status:'not-requested',network:'stellar:testnet',asset:'USDC',amountAtomic:'0',recipient:'G'+'A'.repeat(55)},delivery:{status:'reported-delivered',result:{synthetic:true}}};
  assert.equal((await invoke('/api/operations',tokens.agent,operation)).status,201);
  assert.equal((await invoke('/api/activity',tokens.agent,{eventId:'event-next',taskId:'task-next',mode:'mock',kind:'search',title:'Synthetic'})).status,201);
  assert.equal((await invoke('/api/activity',tokens.human)).status,200);
  for(const headers of [{host:'evil.example:'+port},{origin:'https://evil.example'},{origin:'http://localhost:'+port},{'x-forwarded-host':'evil.example'},{'x-forwarded-proto':'https'},{'x-forwarded-port':String(port+1)}]){
    const result=await invoke('/api/workspaces',tokens.bootstrap,body,headers);assert.ok([400,403].includes(result.status),JSON.stringify({headers,status:result.status,code:result.body.error?.code}));
  }
  assert.equal((await invoke('/api/operations',tokens.agent,operation,{origin:'http://localhost:'+port})).status,400);
  assert.equal((await invoke('/api/activity',tokens.agent,{eventId:'bad',taskId:'task-next',mode:'mock',kind:'search',title:'Synthetic'},{'x-forwarded-host':'evil.example'})).status,403);
  console.log(JSON.stringify({ok:true,nextProductionHttp:true,node:process.version,configuredIpOrigin:true,nextLoopbackNormalization:true,strictHost:true,strictOrigin:true,forwardedAuthorityRejected:true,nativeOperations:true,nativeActivity:true,externalWrites:false}));
}finally{
  if(child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill();});
  assert.ok(resolve(dir).startsWith(resolve(tmpdir()))&&dir.includes('bazaar-workspace-next-'));await rm(dir,{recursive:true,force:true});
}
