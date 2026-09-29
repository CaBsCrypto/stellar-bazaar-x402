import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const directory=await mkdtemp(path.join(tmpdir(),'bazaar-seller-e2e-'));
const children=new Set();
async function start(){
  const child=fork(fileURLToPath(new URL('./serve-seller-review.mjs',import.meta.url)),[`--directory=${directory}`],{silent:true});children.add(child);
  let output='',errors='';child.stderr.on('data',chunk=>{errors+=chunk});
  const ready=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error(`Review server timeout: ${errors}`)),20000);
    child.once('exit',code=>{clearTimeout(timer);reject(Error(`Review server exited ${code}: ${errors}`));});
    child.stdout.on('data',chunk=>{output+=chunk;for(const line of output.split('\n')){try{const data=JSON.parse(line);if(data.ready){clearTimeout(timer);resolve(data);}}catch{}}});
  });
  return {...ready,child};
}
async function stop(server){await new Promise(resolve=>{server.child.once('exit',resolve);server.child.kill();});children.delete(server.child);}
const token=randomBytes(32).toString('hex'),id=randomUUID();
const card={version:'bazaar.service-card/v0',id:'seller-e2e-synthetic',name:'Synthetic seller acceptance',description:'Local synthetic service proving durable reviewed publication.',kind:'http',url:'https://api.seller.example.com',routeTemplate:'/v1/quote/{pair}',input:[{name:'pair',type:'string',required:true}],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',amount:'0.001',destination:'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'},provider:{name:'Synthetic seller'},tags:['synthetic','acceptance']};
const payload={card,controlProof:{method:'dns-txt',domain:'api.seller.example.com',verified:true},submissionId:id};
async function request(server,route,{method='GET',body,credential=token}={}){
  const response=await fetch(server.url+route,{method,headers:{...(credential?{authorization:`Bearer ${credential}`} :{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
}
const submit=(server,body=payload,credential=token)=>request(server,'/api/provider-self-listing',{method:'POST',body,credential});
const status=(server,credential=token)=>request(server,`/api/provider-self-listing/${id}`,{credential});
const action=(server,action,extra={})=>request(server,'/__fixture/operator',{method:'POST',body:{action,id,...extra},credential:'synthetic-local-operator'});
async function mcp(server,name,args){
  const client=new Client({name:'seller-acceptance',version:'1.0.0'});
  try{
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url+'/api/mcp')));
    const result=await client.callTool({name,arguments:args});return {error:result.isError===true,data:JSON.parse(result.content.find(item=>item.type==='text').text)};
  }finally{await client.close();}
}
try{
  let first=await start(),second=await start();
  assert.notEqual(first.pid,second.pid);
  assert.equal((await submit(first,payload,'')).body.ok,false,'Missing receipt credential rejected');
  const invalid=await submit(first,{...payload,submissionId:randomUUID(),card:{...card,url:'http://localhost'}});
  assert.equal(invalid.body.ok,false,'Invalid service cannot enter review');
  const race=await Promise.all([submit(first),submit(second)]);
  assert.ok(race.some(result=>result.body.ok),JSON.stringify(race));
  assert.ok(race.every(result=>result.body.ok||result.status===503),JSON.stringify(race));
  const receipt=race.find(result=>result.body.ok).body.submission;
  assert.equal(receipt.submissionId,id);assert.equal(receipt.status,'awaiting-control-proof');
  assert.equal(receipt.control.status,'pending','Provider-supplied verified:true is never domain evidence');
  const replay=await submit(second);assert.equal(replay.body.ok,true);assert.deepEqual(replay.body.submission,receipt);
  assert.equal((await submit(second,{...payload,card:{...card,name:'Conflicting card'}})).status,409);
  assert.equal((await status(second,randomBytes(32).toString('hex'))).status,401);
  const beforeRestart=(await status(second)).body.submission;
  const state=JSON.parse(await readFile(path.join(directory,'review.json'),'utf8'));
  assert.equal(state.records.length,1,'Concurrent processes create one receipt');
  assert.ok(!JSON.stringify(state).includes(token),'Only receipt-token hash may persist');
  assert.equal((await request(first,'/api/discovery/resources')).body.results.length,0,'Private queue is never discovery');
  assert.equal((await mcp(first,'get_service',{id:card.id})).error,true,'Private queue is never MCP');
  const premature=await action(first,'review');assert.ok(premature.body.ok===false||premature.status>=400);
  assert.equal((await request(first,'/__fixture/operator',{method:'POST',body:{action:'review',id}})).status,401,'Seller receipt cannot authorize operator review');
  const activation=await action(first,'activate');assert.ok(activation.body.ok===false||activation.status>=400);
  await stop(first);await stop(second);first=await start();
  assert.notEqual(first.pid,second.pid);
  assert.deepEqual((await status(first)).body.submission,beforeRestart,'Fresh process recovers receipt/challenge');
  assert.equal((await action(first,'verify',{txt:'incorrect'})).body.error,'CONTROL_PROOF_MISMATCH');
  const proof=await action(first,'verify',{txt:receipt.control.expectedRecord});
  assert.equal(proof.body.status,'pending-manual-review',JSON.stringify(proof));
  await stop(first);first=await start();
  const proven=(await status(first)).body.submission;assert.equal(proven.control.status,'verified');
  const reviewed=await action(first,'review');assert.equal(reviewed.body.value.status,'approved-for-staging',JSON.stringify(reviewed));
  assert.equal((await action(first,'stage')).body.value.status,'staged-not-public');
  assert.equal((await request(first,'/api/discovery/resources')).body.results.length,0,'Approval alone is private');
  const activated=await action(first,'activate');assert.equal(activated.body.status,'activated',JSON.stringify(activated));
  const resources=(await request(first,'/api/discovery/resources')).body.results;
  assert.equal(resources.length,1);assert.deepEqual(resources[0],card);
  const searched=(await request(first,'/api/discovery/search?query=synthetic')).body.results;
  assert.deepEqual(searched[0].resource,card);
  const detail=await mcp(first,'get_service',{id:card.id});assert.equal(detail.error,false);assert.deepEqual(detail.data.resource,card);
  const list=await mcp(first,'list_services',{});assert.equal(list.error,false);
  const {availability,...listedCard}=list.data.services.find(service=>service.id===card.id);assert.deepEqual(listedCard,card);
  assert.deepEqual((await mcp(first,'search_services',{query:'synthetic'})).data.results[0].resource,card);
  await stop(first);first=await start();
  assert.equal((await status(first)).body.submission.status,'activated','Activation receipt survives restart');
  assert.deepEqual((await mcp(first,'get_service',{id:card.id})).data.resource,card,'Registry fixture survives restart');
  const rejectedId=randomUUID(),rejectedPayload={...payload,submissionId:rejectedId,card:{...card,id:'seller-e2e-rejected'}};
  const rejectedReceipt=(await submit(first,rejectedPayload)).body.submission;
  await action(first,'verify',{id:rejectedId,txt:rejectedReceipt.control.expectedRecord});
  const rejected=await action(first,'review',{id:rejectedId,decision:'reject'});
  assert.equal(rejected.body.value.status,'rejected');
  const rejectedStatus=(await request(first,`/api/provider-self-listing/${rejectedId}`)).body.submission;
  assert.deepEqual(rejectedStatus.review.reasons,['Synthetic local conformance review'],'Owner receives actionable review reasons');
  assert.equal((await action(first,'activate',{id:rejectedId})).body.error,'INVALID_TRANSITION');
  const correction={...rejectedPayload,submissionId:randomUUID(),card:{...rejectedPayload.card,name:'Corrected synthetic service'}};
  const corrected=await submit(first,correction);assert.equal(corrected.body.submission.status,'awaiting-control-proof');
  const preserved=JSON.parse(await readFile(path.join(directory,'review.json'),'utf8')).records.find(record=>record.submission.submissionId===rejectedId).submission;
  assert.deepEqual(preserved.card,rejectedPayload.card);assert.equal(preserved.review.decision,'reject','Correction does not overwrite reviewed evidence');
  assert.equal((await request(first,'/api/discovery/resources')).body.results.length,1,'Rejected and corrected pending requests stay private');
  // Corrupt storage must not fall back to an empty queue or admit another submission.
  await writeFile(path.join(directory,'review.json'),'{invalid');
  assert.equal((await submit(first,{...payload,submissionId:randomUUID(),card:{...card,id:'second'}})).status,503);
  assert.equal((await request(first,'/api/discovery/resources')).body.results.length,1);
  console.log(JSON.stringify({ok:true,evidence:'local synthetic doubles only',crossProcessConcurrency:true,freshProcessRestarts:3,authenticatedReceipt:true,privateQueueExcluded:true,operatorDnsProof:true,manualReview:true,rejectedCorrectionPreservesEvidence:true,actualAdministrativeCreateService:true,actualDiscoveryAndMcp:true,payments:0,externalWrites:0},null,2));
}finally{
  for(const child of children){child.kill();await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)resolve();else child.once('exit',resolve);});}
  await rm(directory,{recursive:true,force:true});
}
