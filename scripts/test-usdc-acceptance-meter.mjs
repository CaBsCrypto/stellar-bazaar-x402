import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import ts from 'typescript';
import {measuredHandler,measuredRead,meteredExternal,meteredRedis,SALE_STORAGE_CAPS} from '../lib/acceptance-meter.ts';

const suffix='pilot-'+'c'.repeat(32),workspace='bazaar-workspace:'+suffix,market='bazaar-market:'+suffix,review='bazaar-review:'+suffix;
Object.assign(process.env,{BAZAAR_ACCEPTANCE_METER:'true',BAZAAR_ACCEPTANCE_SALE:'true',BAZAAR_WORKSPACE_PREFIX:workspace,BAZAAR_ACCEPTANCE_CATALOG_CARD_ID:'acceptance-usdc-text'});
const logs=[],originalInfo=console.info;console.info=value=>logs.push(JSON.parse(value));
let middleware,effects=0,externalEffects=0;
meteredRedis({use(fn){middleware=fn;}});
const command=body=>middleware({body},async()=>{effects++;return {result:1};});
const run=measuredHandler(async(fn)=>{await fn();return new Response('ok');});
const cas="local old=redis.call('GET',KEYS[1]); redis.call('SET',KEYS[1],ARGV[3]); return 1";
const storeWrite=(key,value)=>command(['eval',cas,1,key,'missing','',value]);
try{
 assert.equal(Object.values(SALE_STORAGE_CAPS).reduce((sum,v)=>sum+v,0)<=49164,true);
 for(const name of ['market','review']){
  const key=(name==='market'?market:review)+':state',valueCap=SALE_STORAGE_CAPS[name]-Buffer.byteLength(key);
  const response=await run(()=>storeWrite(key,'x'.repeat(valueCap)));
  assert.equal(Number(response.headers.get('x-bazaar-'+name+'-stored-bytes-upper-bound')),SALE_STORAGE_CAPS[name]);
  const before=effects;await assert.rejects(run(()=>storeWrite(key,'x'.repeat(valueCap+1))),/STORAGE_BUDGET/);assert.equal(effects,before);
 }
 const workspaceScript="local registry=redis.call('GET',KEYS[1]); redis.call('SET',KEYS[1],ARGV[4]); redis.call('SET',KEYS[3],'workspace-v1'); return 1";
 const ownerId='ow_'+'e'.repeat(32),workspaceRoot=workspace+':{'+suffix+'}',workspaceKeys=[workspaceRoot+':registry',workspaceRoot+':owner:'+ownerId,workspaceRoot+':initialized'];
 const workspaceKeyBytes=workspaceKeys.reduce((sum,key)=>sum+Buffer.byteLength(key),0);
 const registry=JSON.stringify({workspaces:[{ownerId,documentBytes:11500}]});
 const workspaceResponse=await run(()=>command(['eval',workspaceScript,3,...workspaceKeys,'','','',registry,'document']));
 assert.equal(Number(workspaceResponse.headers.get('x-bazaar-workspace-stored-bytes-upper-bound')),Buffer.byteLength(registry)+11500+12+workspaceKeyBytes);
 let before=effects;await assert.rejects(run(()=>command(['eval',workspaceScript,3,...workspaceKeys,'','','',JSON.stringify({workspaces:[{ownerId,documentBytes:12288}]}),'document'])),/STORAGE_BUDGET/);assert.equal(effects,before);
 await assert.rejects(run(()=>command(['eval',workspaceScript,3,...workspaceKeys,'','','',JSON.stringify({workspaces:[{ownerId:'../../wrong',documentBytes:1}]}),'document'])),/STORAGE_OWNER_REQUIRED/);assert.equal(effects,before);
 let exactDocumentBytes=11500;
 for(let i=0;i<4;i++)exactDocumentBytes=SALE_STORAGE_CAPS.workspace-workspaceKeyBytes-12-Buffer.byteLength(JSON.stringify({workspaces:[{ownerId,documentBytes:exactDocumentBytes}]}));
 const exactRegistry=JSON.stringify({workspaces:[{ownerId,documentBytes:exactDocumentBytes}]});
 assert.equal(Buffer.byteLength(exactRegistry)+exactDocumentBytes+12+workspaceKeyBytes,SALE_STORAGE_CAPS.workspace);
 const exactWorkspace=await run(()=>command(['eval',workspaceScript,3,...workspaceKeys,'','','',exactRegistry,'x'.repeat(exactDocumentBytes)]));assert.equal(Number(exactWorkspace.headers.get('x-bazaar-workspace-stored-bytes-upper-bound')),SALE_STORAGE_CAPS.workspace);
 before=effects;await assert.rejects(run(()=>command(['eval',workspaceScript,3,...workspaceKeys,'','','',JSON.stringify({workspaces:[{ownerId,documentBytes:exactDocumentBytes+1}]}),'x'.repeat(exactDocumentBytes+1)])),/STORAGE_BUDGET/);assert.equal(effects,before);
 const create="if redis.call('EXISTS',KEYS[1])==1 then return 0 end; redis.call('SET',KEYS[1],ARGV[1]); redis.call('SADD',KEYS[2],ARGV[2]); return 1";
 const catalog=market+':catalog:',cardId=process.env.BAZAAR_ACCEPTANCE_CATALOG_CARD_ID;
 const catalogResponse=await run(()=>command(['eval',create,2,catalog+'card:'+cardId,catalog+'index','x'.repeat(7936),cardId]));
 assert.equal(Number(catalogResponse.headers.get('x-bazaar-catalog-stored-bytes-upper-bound')),7936+Buffer.byteLength(cardId)+Buffer.byteLength(catalog+'card:'+cardId)+Buffer.byteLength(catalog+'index'));
 before=effects;await assert.rejects(run(()=>command(['eval',create,2,catalog+'card:other',catalog+'index','{}','other'])),/CATALOG_KEY_DENIED/);assert.equal(effects,before);
 await assert.rejects(run(()=>command(['eval',create,2,catalog+'card:'+cardId,catalog+'index','x'.repeat(7937),cardId])),/STORAGE_BUDGET/);assert.equal(effects,before);
 before=effects;await assert.rejects(run(()=>storeWrite('bazaar-market:pilot-'+'d'.repeat(32)+':state','{}')),/WRITE_KEY_DENIED|KEY_DENIED/);assert.equal(effects,before);
 await assert.rejects(meteredExternal('horizon',async()=>{externalEffects++;return {}; }),/SCOPE_REQUIRED/);assert.equal(externalEffects,0);
 const external=await run(async()=>{for(let i=0;i<8;i++)await meteredExternal('horizon',async()=>{externalEffects++;return {result:'one'};},{request:'public'});});
 assert.equal(external.headers.get('x-bazaar-external-horizon'),'8');assert.equal(externalEffects,8);
 assert.equal(Number(external.headers.get('x-bazaar-external-outbound-payload-bytes')),8*Buffer.byteLength(JSON.stringify({request:'public'})));
 const exhausted=await run(async()=>{for(let i=0;i<8;i++)await meteredExternal('provider',async()=>{externalEffects++;return {};});await assert.rejects(meteredExternal('provider',async()=>{externalEffects++;return {};}),/EXTERNAL_BUDGET/);});
 assert.equal(exhausted.headers.get('x-bazaar-external-provider'),'8');assert.equal(externalEffects,16);
 const lost=await run(async()=>{try{await meteredExternal('horizon',async()=>{externalEffects++;throw Error('response lost');});}catch{}});
 assert.equal(lost.headers.get('x-bazaar-external-horizon'),'1');assert.equal(lost.headers.get('x-bazaar-redis-uncertain'),'true');
 const rawBody='  { "result": "one" }   ';let rawBytes=0;
 const raw=await run(()=>meteredExternal('horizon',async()=>{rawBytes=Buffer.byteLength(rawBody);return JSON.parse(rawBody);},{normalized:'ignored'},()=>({outboundBytes:3,inboundBytes:rawBytes})));
 assert.equal(Number(raw.headers.get('x-bazaar-external-inbound-payload-bytes')),Buffer.byteLength(rawBody));assert.equal(Number(raw.headers.get('x-bazaar-external-outbound-payload-bytes')),3);
 let partialBytes=0;const partial=await run(async()=>{try{await meteredExternal('provider',async()=>{partialBytes=17;throw Error('partial read lost');},undefined,()=>({outboundBytes:0,inboundBytes:partialBytes}));}catch{}});
 assert.equal(Number(partial.headers.get('x-bazaar-external-inbound-payload-bytes')),17);assert.equal(partial.headers.get('x-bazaar-redis-uncertain'),'true');
 await assert.rejects(run(()=>meteredExternal('provider',async()=>{externalEffects++;return {};},undefined,()=>({outboundBytes:-1}))),/BYTE_EVIDENCE_INVALID/);
 before=externalEffects;await assert.rejects(run(()=>meteredExternal('provider',async()=>{externalEffects++;return {};},'x'.repeat(4*1048576))),/EXTERNAL_BUDGET/);assert.equal(externalEffects,before);
 const ssrLogStart=logs.length;await measuredRead(()=>meteredExternal('horizon',async()=>({balance:'public'})));assert.equal(logs.length,ssrLogStart+1);assert.equal(logs.at(-1).source,'ssr');assert.equal(logs.at(-1).external.horizon,1);
 const nestedLogStart=logs.length;await run(()=>measuredRead(()=>meteredExternal('horizon',async()=>({balance:'public'}))));assert.equal(logs.length,nestedLogStart+1);assert.equal(logs.at(-1).source,'api');
 const thrownLogStart=logs.length;await assert.rejects(run(()=>meteredExternal('horizon',async()=>{throw Error('uncaught transport response lost');})),/response lost/);assert.equal(logs.length,thrownLogStart+1);assert.equal(logs.at(-1).external.horizon,1);assert.equal(logs.at(-1).uncertain,true);

 // Execute the real pinned HTTPS implementation in a VM with a transport double.
 // The dummy bypass is public; no network socket or real credential is involved.
 const source=await readFile('lib/provider-review-operator.ts','utf8'),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const require=createRequire(import.meta.url),captured=[];let activeHost='provider-preview.vercel.app',status=200,recordedProofs=0,hangResponse=false,proofMethod='http-well-known';
 const submission=()=>({status:'awaiting-control-proof',expiresAt:new Date(Date.now()+60000).toISOString(),card:{url:'https://'+activeHost},control:{method:proofMethod,domain:activeHost,verificationPath:'/.well-known/stellar-bazaar-provider.txt',expectedRecord:'public-proof',challengeId:'public-challenge'}});
 const reviewDouble={getSubmissionForOperator:async()=>({ok:true,value:submission()}),recordControlProofResult:async(_id,value)=>{recordedProofs++;return {ok:true,value};}};
 const httpsDouble={request(options,callback){captured.push(options);const request=new EventEmitter();request.destroy=error=>{request.emit('error',error);request.emit('close');};request.end=()=>setImmediate(()=>{const response=new EventEmitter();response.statusCode=status;response.destroy=()=>{};callback(response);if(status===200){response.emit('data',Buffer.from('public-proof'));if(!hangResponse)response.emit('end');}if(!hangResponse)request.emit('close');});return request;}};
 const proofEnv={BAZAAR_PROVIDER_PREVIEW_HOST:'provider-preview.vercel.app',BAZAAR_PROVIDER_PREVIEW_BYPASS:'public-dummy-bypass'.padEnd(43,'x')};
 const module={exports:{}};vm.runInNewContext(compiled,{module,exports:module.exports,require(specifier){if(specifier==='node:https')return httpsDouble;if(specifier==='./provider-self-listing.ts')return reviewDouble;if(specifier==='./canonical-service-card.ts')return {computeCanonicalServiceCardHash:()=> 'public-card-hash'};if(specifier==='./service-ingest.ts')return {};if(specifier==='./acceptance-meter.ts')return {meteredExternal};return require(specifier);},process:{env:proofEnv},URL,Buffer,setTimeout,clearTimeout},{filename:'actual-provider-review-operator.js'});
 const verify=()=>module.exports.verifySubmissionHttp('public-submission',{lookup:async()=>[{address:'8.8.8.8',family:4}]});
 const proof=await run(verify);assert.equal(proof.headers.get('x-bazaar-external-proof-dns'),'1');assert.equal(proof.headers.get('x-bazaar-external-proof-http'),'1');assert.equal(captured.at(-1).headers['x-vercel-protection-bypass'],proofEnv.BAZAAR_PROVIDER_PREVIEW_BYPASS);assert.equal(captured.at(-1).servername,activeHost);assert.equal(captured.at(-1).agent,false);
 activeHost='other-preview.vercel.app';await run(verify);assert.equal(captured.at(-1).headers,undefined);
 activeHost='provider-preview.vercel.app.evil.example';await run(verify);assert.equal(captured.at(-1).headers,undefined);
 activeHost='provider-preview.vercel.app';proofEnv.BAZAAR_PROVIDER_PREVIEW_BYPASS='';const capturedBefore=captured.length;await assert.rejects(run(verify),/PREVIEW_AUTH_UNAVAILABLE/);assert.equal(captured.length,capturedBefore);
 proofEnv.BAZAAR_PROVIDER_PREVIEW_BYPASS='public-dummy-bypass'.padEnd(43,'x');status=302;before=recordedProofs;await assert.rejects(run(verify),/HTTP_PROOF_STATUS/);assert.equal(recordedProofs,before);
 status=200;hangResponse=true;const timeout=await run(async()=>{await assert.rejects(module.exports.verifySubmissionHttp('public-submission',{timeoutMs:30,lookup:async()=>{await new Promise(done=>setTimeout(done,10));return [{address:'8.8.8.8',family:4}];}}),/HTTP_PROOF_TIMEOUT/);});
 assert.equal(timeout.headers.get('x-bazaar-external-proof-http'),'1');assert.equal(timeout.headers.get('x-bazaar-redis-uncertain'),'true');assert.equal(Number(timeout.headers.get('x-bazaar-external-inbound-payload-bytes'))>=Buffer.byteLength('public-proof'),true);assert.equal(recordedProofs,before);
 proofMethod='dns-txt';const dnsTimeout=await run(async()=>{await assert.rejects(module.exports.verifySubmissionDns('public-submission',{timeoutMs:15,resolveTxt:async()=>{await new Promise(done=>setTimeout(done,35));return [['public-proof']];}}),/DNS_PROOF_UNAVAILABLE/);});
 assert.equal(dnsTimeout.headers.get('x-bazaar-external-proof-dns'),'1');assert.equal(dnsTimeout.headers.get('x-bazaar-redis-uncertain'),'true');assert.equal(recordedProofs,before);
 assert.equal(logs.every(log=>!JSON.stringify(log).includes('public-dummy-bypass')&&!JSON.stringify(log).includes('public-proof')),true);
 originalInfo(JSON.stringify({status:'PASS',externalRequests:0,namespaceCaps:SALE_STORAGE_CAPS,checks:['before-effect namespace storage limits','catalog exact-card admission','external invocation budget/no retry/lost response flag','SSR and nested scope accounting','real pinned HTTPS header exact host','lookalike/other host receives no bypass','missing bypass and redirects reject','metadata logs contain no proof payload or credentials']}));
}finally{console.info=originalInfo;}
