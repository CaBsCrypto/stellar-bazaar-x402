import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root=process.argv[2]==='--checkout'?resolve(process.argv[3]):process.cwd();
await access(join(root,'.next/BUILD_ID'));
const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const hash=v=>createHash('sha256').update(v).digest('hex'),token=()=>randomBytes(32).toString('hex');
const counts={},failures=[],diagnosticCounts={};let sameOwner=true,persistedOneOwner=true;
async function freePort(){const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}
async function exists(path){try{await stat(path);return true;}catch{return false;}}
for(let round=0;round<20;round++){
  const directory=await mkdtemp(join(tmpdir(),'bazaar-workspace-concurrency-')),children=[],diagnostics=[];
  const legacy=JSON.stringify([{ownerId:'diagnostic_legacy',readTokenHash:hash(token()),writeTokenHash:hash(token())}]);
  async function start(){
    const base='http://127.0.0.1:'+await freePort();
    const child=spawn(process.execPath,['--import',pathToFileURL(join(root,'scripts/workspace-file-diagnostics.mjs')).href,join(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',new URL(base).port],{cwd:root,env:{...env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_WORKSPACE_BACKEND:'file',BAZAAR_WORKSPACE_PREFIX:'bazaar-workspace:local-test',BAZAAR_WORKSPACE_FILE_DIRECTORY:directory,BAZAAR_WORKSPACE_LOCAL_ORIGIN:base,BAZAAR_WORKSPACE_FILE_DIAGNOSTICS_TEST:'1',BAZAAR_HISTORY_ACCOUNTS_JSON:legacy,X402_PILOT_PAYMENTS_ENABLED:'false',X402_LEGACY_PAYMENTS_ENABLED:'false',X402_ENABLE_LOCAL_PAYER:'false'}});
    children.push(child);child.stdout.resume();let buffer='';child.stderr.on('data',chunk=>{buffer=(buffer+chunk).slice(-8192);const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines){try{const d=JSON.parse(line).workspaceFileDiagnostic;if(d&&/^[a-z-]{1,50}$/.test(d.phase)&&/^[A-Z]{1,20}$/.test(d.code))diagnostics.push({phase:d.phase,code:d.code});}catch{}}});
    const until=Date.now()+15000;while(Date.now()<until){if(child.exitCode!==null)throw Error('Diagnostic Next startup failed');try{if((await fetch(base+'/api/mcp',{signal:AbortSignal.timeout(1000)})).status===200)return base;}catch{}await new Promise(r=>setTimeout(r,75));}throw Error('Diagnostic Next startup timed out');
  }
  try{
    const bases=await Promise.all([start(),start()]),bootstrap=token(),body={creationId:randomUUID(),humanAccessHash:hash(token()),agentAccessHash:hash(token())};
    const send=async(base,input,authorization=bootstrap)=>{const response=await fetch(base+'/api/workspaces',{method:'POST',headers:{'content-type':'application/json',origin:base,...(authorization?{authorization:'Bearer '+authorization}:{})},body:JSON.stringify(input),signal:AbortSignal.timeout(10000)});return{status:response.status,body:await response.json()};};
    assert.equal((await send(bases[0],body,null)).status,401);assert.equal((await send(bases[0],{...body,ownerId:'client_owner'})).status,400);
    const responses=await Promise.all(Array.from({length:6},(_,i)=>send(bases[i%2],body)));
    await new Promise(r=>setTimeout(r,25));
    for(const d of diagnostics){const key=d.phase+':'+d.code;diagnosticCounts[key]=(diagnosticCounts[key]??0)+1;}
    const accepted=responses.filter(r=>[200,201].includes(r.status));sameOwner&&=new Set(accepted.map(r=>r.body.record.ownerId)).size===1;
    const registry=JSON.parse(await readFile(join(directory,'local-test','registry.json'),'utf8'));
    persistedOneOwner&&=registry.workspaces.length===1&&registry.workspaces[0].creationId===body.creationId;
    assert.equal(responses.filter(r=>r.status===201).length,1,'Each fresh intent must have exactly one creation winner');
    for(const r of responses)counts[r.status]=(counts[r.status]??0)+1;
    if(responses.some(r=>![200,201,409].includes(r.status))){const folder=join(directory,'local-test');const failure={round,responses:responses.map(r=>({status:r.status,code:r.body.error?.code})),diagnostics,markers:{lock:await exists(join(folder,'lock')),pending:await exists(join(folder,'pending.json')),initialized:await exists(join(folder,'initialized')),registry:await exists(join(folder,'registry.json'))}};failures.push(failure);console.log(JSON.stringify(failure));}
  }finally{await Promise.all(children.map(child=>child.exitCode!==null?Promise.resolve():new Promise(r=>{child.once('exit',r);child.kill();})));assert.ok(resolve(directory).startsWith(resolve(tmpdir()))&&directory.includes('bazaar-workspace-concurrency-'));await rm(directory,{recursive:true,force:true});}
}
console.log(JSON.stringify({diagnosticOnly:true,rounds:20,nextProcessesPerRound:2,simultaneousCreationsPerRound:6,freshDirectories:20,statusCounts:counts,diagnosticCounts,sameOwner,persistedOneOwner,failures:failures.length,externalRequests:0,realPayments:0}));
if(failures.length||!sameOwner||!persistedOneOwner)process.exitCode=1;
