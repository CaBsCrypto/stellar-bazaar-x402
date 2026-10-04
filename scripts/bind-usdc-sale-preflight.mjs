import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {provisioningBinding} from './provision-usdc-sale-wallets.mjs';
const run=promisify(execFile),dir='docs/evidence/sprint-marketplace',path=dir+'/usdc-sale-manifest.json';
const json=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,'')),sha=value=>createHash('sha256').update(value).digest('hex');
const m=await json(path),phase=process.argv[2];assert.ok(['local','probe','provider','provision'].includes(phase));
if(phase==='local'){
 const native=await json(dir+'/usdc-native-local.json'),margin=await json(dir+'/usdc-redis-free-margin.json');
 assert.equal(native.status,'PASS');assert.equal(native.serverMeterMatchesProtocol,true);assert.equal(native.buildId,(await readFile('.next/BUILD_ID','utf8')).trim());assert.equal(native.ledgerSubmissions,2);assert.equal(native.providerRequests,1);assert.equal(native.actualAlgorithmicProvider,true);assert.equal(native.externalRequests,0);
 for(const [key,limit]of [['apiRequests','apiRequests'],['redisRequests','redisRestExchanges'],['redisCommandsUpperBound','redisCommandsUpperBound'],['maximumStoredBytes','storedBytes'],['outboundPayloadBytes','outboundPayloadBytes'],['inboundPayloadBytes','inboundPayloadBytes']])assert.ok(native[key]<=m.limits[limit]);
 assert.equal(margin.plan,'Free Tier');assert.equal(margin.cost,'$0.00');assert.ok(Date.now()-Date.parse(margin.observedAt)<86400000);
 const {stdout}=await run('git',['rev-parse','HEAD'],{windowsHide:true});m.sourceSha=stdout.trim();assert.match(m.sourceSha,/^[a-f0-9]{40}$/);
 const dirty=await run('git',['diff','--name-only','HEAD','--','app','lib','components','proxy.ts'],{windowsHide:true});assert.equal(dirty.stdout.trim(),'','APPLICATION_SOURCE_NOT_COMMITTED');
 m.uploads={};for(const target of ['bazaar','provider']){const audit=await json(dir+`/usdc-${target}-upload-audit.json`);assert.equal(audit.secretsFound,0);m.uploads[target]={payloadFingerprint:audit.payloadFingerprint,fileCount:audit.fileCount,totalBytes:audit.totalBytes};}
 m.payloads.pauseOperationId??=randomUUID();m.browserReserve={apiRequests:20,redis:80,commandsUpperBound:400};
 m.preflight={nativeReportHash:sha(await readFile(dir+'/usdc-native-local.json')),buildId:native.buildId,measured:{api:native.apiRequests,redis:native.redisRequests,commands:native.redisCommandsUpperBound,stored:native.maximumStoredBytes,outbound:native.outboundPayloadBytes,inbound:native.inboundPayloadBytes},projected:{appApi:55,backendExternal:21,provisioningHttp:13,browserPrivateApi:20,apiUpperBound:109,redisUpperBound:368,commandsUpperBound:1790,storageUpperBound:49152},limitation:'Projection reserves are gates, not hosted observations; SSR/browser must be reconciled with server metadata.'};
 assert.ok(m.preflight.projected.apiUpperBound<=m.limits.apiRequests&&m.preflight.projected.redisUpperBound<=m.limits.redisRestExchanges&&m.preflight.projected.commandsUpperBound<=m.limits.redisCommandsUpperBound);
 m.measurement.vercel='Bounded control commands and deployment creates; CLI internal platform HTTP is not reported as application API traffic.';m.measurement.api='Cumulative application HTTP/MCP/browser private API + Horizon, Friendbot, faucet, proof and provider HTTP; DNS attempts included conservatively.';m.measurement.horizon='Backend all Horizon attempts plus provisioning GETs capped conservatively at24; provisioning trustline POSTs counted separately.';
 m.provisioningBinding=provisioningBinding(m);Object.assign(m.readiness,{localSaleMeasured:true,freeMarginRefreshed:true,payloadsFrozen:true,canDeployPreview:true,canProbe:false,canProvision:false,canExecute:false});m.phase='LOCAL-PASS-PREVIEW-ONLY';
}else if(phase==='probe'){
 const report=await json(dir+'/usdc-hosted-http.json'),logs=await json(dir+'/usdc-meter-bazaar-probe.json'),deployment=await json(dir+'/usdc-bazaar-probe.json');
 assert.equal(deployment.sourceSha,m.sourceSha);assert.equal(deployment.payloadFingerprint,m.uploads.bazaar.payloadFingerprint);assert.equal(report.phases.find(v=>v.phase==='probe')?.passed,true);const counter=logs.records.find(v=>v.requestId===report.probe.requestId);assert.ok(counter);assert.equal(counter.redis,report.probe.redis);assert.equal(counter.uncertain,false);assert.equal(counter.source,'api');
 m.deployments??={};m.deployments.bazaarProbe=deployment;m.readiness.countersVerified=true;m.readiness.canExecute=true;m.readiness.canProbe=false;m.phase='HOSTED-COUNTER-PROBE-PASS';
}else if(phase==='provider'){
 const control=await json(dir+'/usdc-vercel-control.json'),deployment=await json(dir+'/usdc-provider-proof.json'),proof=await json(dir+'/usdc-provider-proof-check.json');assert.equal(control.providerAlias.projectId,m.providerProjectId);assert.equal(control.providerAlias.deploymentId,deployment.id);assert.equal(proof.deploymentId,deployment.id);assert.equal(proof.unauthenticatedDenied,true);assert.equal(proof.exactChallenge,true);assert.equal(proof.automaticRetries,0);m.deployments??={};m.deployments.providerProof=deployment;m.readiness.providerProofReady=true;m.readiness.canProvision=true;m.provisioningBinding=provisioningBinding(m);
}else{
 const report=await json(dir+'/usdc-wallet-provision.json');assert.equal(report.status,'PASS_PROVISIONED');assert.equal(report.provisioningBinding,m.provisioningBinding);assert.equal(report.planId,m.planId);m.readiness.walletProvisioned=true;m.readiness.canProvision=false;
}
await writeFile(path,JSON.stringify(m,null,2)+'\n');console.log(JSON.stringify({phase,sourceSha:m.sourceSha,readiness:m.readiness,remoteEffects:0}));
