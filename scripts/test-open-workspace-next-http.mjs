import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, access, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const cwd=process.cwd(), next=join(cwd,'node_modules/next/dist/bin/next');
const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
Object.assign(env,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'});
async function run(args){return new Promise((resolveRun,reject)=>{const child=spawn(process.execPath,[next,...args],{cwd,env});let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);child.on('error',reject);child.on('exit',code=>code===0?resolveRun():reject(Error(output.slice(-5000))));});}
if(process.argv.includes('--build'))await run(['build','--webpack']);
await access(join(cwd,'.next/BUILD_ID'));
const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const base='http://127.0.0.1:'+port, dir=await mkdtemp(join(tmpdir(),'bazaar-workspace-next-'));
const children=[];let output='';
function start(serverPort){const origin='http://127.0.0.1:'+serverPort;const child=spawn(process.execPath,['--import',pathToFileURL(join(cwd,'scripts/workspace-file-diagnostics.mjs')).href,next,'start','-H','127.0.0.1','-p',String(serverPort)],{cwd,env:{...env,BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_WORKSPACE_BACKEND:'file',BAZAAR_WORKSPACE_FILE_DIRECTORY:dir,BAZAAR_WORKSPACE_LOCAL_ORIGIN:origin,BAZAAR_WORKSPACE_FILE_DIAGNOSTICS_TEST:'1'}});children.push(child);child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);return child;}
const child=start(port);
const diagnostics=()=>output.split('\n').flatMap(line=>{try{return JSON.parse(line).workspaceFileDiagnostic?[JSON.parse(line).workspaceFileDiagnostic]:[];}catch{return[];}});
async function readyServer(origin,child){const until=Date.now()+30000;while(Date.now()<until){try{const r=await fetch(origin+'/api/workspaces');if(r.status===405)return;}catch{}if(child.exitCode!==null)throw Error(output.slice(-3000));await new Promise(r=>setTimeout(r,100));}throw Error('Next production server did not become ready');}
try {
  await readyServer(base,child);
  const secondReservation=createServer();await new Promise(r=>secondReservation.listen(0,'127.0.0.1',r));const secondPort=secondReservation.address().port;await new Promise(r=>secondReservation.close(r));const secondBase='http://127.0.0.1:'+secondPort,second=start(secondPort);await readyServer(secondBase,second);
  const tokens=Object.fromEntries(['bootstrap','human','agent'].map(role=>[role,randomBytes(32).toString('base64url')])),hash=v=>createHash('sha256').update(v).digest('hex');
  const body={creationId:randomUUID(),humanAccessHash:hash(tokens.human),agentAccessHash:hash(tokens.agent)};
  async function invoke(path,token,value,headers={},origin=base){
    const options={method:value===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,origin,...(value===undefined?{}:{'content-type':'application/json'}),...headers}};
    if(!Object.keys(headers).some(key=>key.toLowerCase()==='host')){const response=await fetch(origin+path,{...options,...(value===undefined?{}:{body:JSON.stringify(value)})});return{status:response.status,body:await response.json()};}
    return new Promise((resolveRequest,reject)=>{const request=httpRequest(origin+path,options,response=>{let text='';response.on('data',chunk=>text+=chunk);response.on('end',()=>{try{resolveRequest({status:response.statusCode,body:JSON.parse(text)});}catch(e){reject(e);}});});request.on('error',reject);if(value!==undefined)request.write(JSON.stringify(value));request.end();});
  }
  const parallel=await Promise.all(Array.from({length:6},(_,i)=>invoke('/api/workspaces',tokens.bootstrap,body,{},i%2?secondBase:base)));
  assert.equal(parallel.filter(r=>r.status===201).length,1,JSON.stringify({responses:parallel.map(r=>({status:r.status,code:r.body.error?.code})),diagnostics:diagnostics()}));
  assert.ok(parallel.every(r=>[200,201,409].includes(r.status)),JSON.stringify({responses:parallel.map(r=>({status:r.status,code:r.body.error?.code})),diagnostics:diagnostics()}));
  assert.equal(new Set(parallel.filter(r=>r.body.record).map(r=>r.body.record.ownerId)).size,1);
  for(let round=0;round<15;round++){
    const raced=await Promise.all(Array.from({length:6},(_,i)=>invoke('/api/workspaces',tokens.bootstrap,body,{},i%2?secondBase:base)));
    assert.ok(raced.every(r=>r.status===200),JSON.stringify({round,responses:raced.map(r=>({status:r.status,code:r.body.error?.code})),diagnostics:diagnostics()}));
  }
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
  console.log(JSON.stringify({ok:true,nextProductionHttp:true,node:process.version,nextProcesses:2,concurrentCreations:6,fileDiagnostics:diagnostics(),configuredIpOrigin:true,nextLoopbackNormalization:true,strictHost:true,strictOrigin:true,forwardedAuthorityRejected:true,nativeOperations:true,nativeActivity:true,externalWrites:false}));
}finally{
  await Promise.all(children.map(child=>child.exitCode!==null?Promise.resolve():new Promise(r=>{child.once('exit',r);child.kill();})));
  assert.ok(resolve(dir).startsWith(resolve(tmpdir()))&&dir.includes('bazaar-workspace-next-'));await rm(dir,{recursive:true,force:true});
}
