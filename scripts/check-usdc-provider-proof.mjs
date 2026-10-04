import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadPacket,packetDirectory} from './marketplace-private-packet.mjs';
import {acquireSaleEffectLock} from '../examples/sale-effect-lock.mjs';
import {createAutomationPreviewFetch} from '../examples/protected-preview-client.mjs';
const dir='docs/evidence/sprint-marketplace',json=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const m=await json(dir+'/usdc-sale-manifest.json'),control=await json(dir+'/usdc-vercel-control.json'),deployment=await json(dir+'/usdc-provider-proof.json');
assert.equal(m.readiness.canExecute,true);assert.equal(deployment.sourceSha,m.sourceSha);assert.equal(control.providerAlias.projectId,m.providerProjectId);assert.equal(control.providerAlias.deploymentId,deployment.id);assert.equal(control.projects.provider.protection,true);
const path=dir+'/usdc-provider-proof-check.json',lock=await acquireSaleEffectLock(packetDirectory,m.planId);let report;
try{
 try{await readFile(path);throw Error('PROOF_CHECK_ALREADY_ATTEMPTED_DO_NOT_RETRY');}catch(e){if(e.code!=='ENOENT')throw e;}
 const packet=await loadPacket();assert.equal(packet.sale.planId,m.planId);const origin=m.config.providerOrigin,url=origin+'/.well-known/stellar-bazaar-provider.txt';
 const started=Date.now();report={planId:m.planId,sourceSha:m.sourceSha,deploymentId:deployment.id,origin,challengeHash:createHash('sha256').update(m.payloads.expectedRecord).digest('hex'),status:'PENDING',proofHttpRequests:0,outboundPayloadBytes:0,inboundPayloadBytes:0,activeExecutionMs:0,automaticRetries:0,unauthenticatedDenied:false,exactChallenge:false,attempts:[]};const persist=()=>{report.activeExecutionMs=Date.now()-started;return writeFile(path,JSON.stringify(report,null,2)+'\n');};
 async function guard(){
  const hosted=await json(dir+'/usdc-hosted-http.json');assert.notEqual(hosted.status,'UNCERTAIN');let setup={counts:{},activeExecutionMs:0,outboundPayloadBytes:0,inboundPayloadBytes:0};try{setup=await json(dir+'/usdc-wallet-provision.json');assert.notEqual(setup.status,'UNCERTAIN');}catch(error){if(error.code!=='ENOENT')throw error;}
  const protection=await json(dir+'/usdc-bazaar-protection-check.json');assert.equal(protection.status,'PASS');assert.equal(protection.planId,m.planId);
  const total=hosted.apiRequests+Object.values(hosted.external).reduce((n,v)=>n+v,0)+Object.entries(setup.counts).filter(([k])=>k!=='usdcFaucetClaims').reduce((n,[,v])=>n+v,0)+report.proofHttpRequests+protection.apiRequests;
  assert.ok(total+1<=m.limits.apiRequests-(m.browserReserve?.apiRequests??20));assert.ok(hosted.external['proof-http']+report.proofHttpRequests+1<=m.limits.proofHttpRequests);assert.ok(hosted.activeExecutionMs+(setup.activeExecutionMs??0)+(protection.activeExecutionMs??0)+Date.now()-started+12000<=m.limits.activeExecutionSeconds*1000);assert.ok(hosted.inboundPayloadBytes+setup.inboundPayloadBytes+protection.inboundPayloadBytes+report.inboundPayloadBytes+131072<=m.limits.inboundPayloadBytes);
 }
 await guard();
 report.attempts.push({authentication:'none',path:'/.well-known/stellar-bazaar-provider.txt',status:'PENDING'});report.proofHttpRequests++;await persist();
 const unauthenticated=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000)});let bytes=0;for await(const chunk of unauthenticated.body??[]){bytes+=chunk.length;assert.ok(bytes<=131072);}report.inboundPayloadBytes+=bytes;report.attempts[0].httpStatus=unauthenticated.status;report.attempts[0].status='CONFIRMED';assert.ok([302,303,307,308,401,403].includes(unauthenticated.status),'PROTECTION_NOT_EFFECTIVE');report.unauthenticatedDenied=true;await persist();
 const fetcher=await createAutomationPreviewFetch({origin,bypassSecret:packet.sale.providerBypass,maxResponseBytes:8192,beforeRequest:async meta=>{await guard();report.attempts.push({...meta,authentication:'existing-automation-bypass',status:'PENDING'});report.proofHttpRequests++;await persist();},onResponse:async(meta,response)=>{report.inboundPayloadBytes+=meta.responseBytes;report.attempts.at(-1).httpStatus=response.status;report.attempts.at(-1).status='CONFIRMED';await persist();},onUncertain:async()=>{report.status='UNCERTAIN';report.attempts.at(-1).status='UNCERTAIN';await persist();}});
 const response=await fetcher(url);assert.equal(response.status,200);assert.equal(await response.text(),m.payloads.expectedRecord,'EXACT_CHALLENGE_MISMATCH');report.exactChallenge=true;report.status='PASS';await persist();console.log(JSON.stringify({...report,attempts:undefined}));
}catch(error){if(report){report.status='UNCERTAIN';await writeFile(path,JSON.stringify(report,null,2)+'\n');}console.error(error.message);process.exitCode=1;}
finally{if(report?.status==='UNCERTAIN'||report?.attempts.some(v=>v.status==='PENDING'))await lock.preserve();else await lock.release();}
