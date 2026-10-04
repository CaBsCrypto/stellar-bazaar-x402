import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAutomationPreviewFetch} from '../examples/protected-preview-client.mjs';

const origin='https://fixed-preview.vercel.app',bypassSecret='synthetic-automation-secret-only-memory',privateToken='synthetic-private-agent-token';
let calls=0,spawnCalls=0,responseFactory=()=>new Response('{"ok":true,"text":"á"}',{headers:{'content-type':'application/json','x-bazaar-redis-requests':'2'}});
const observations=[],completions=[],uncertainties=[],sent=[];
const fetcher=createAutomationPreviewFetch({origin,bypassSecret,maxResponseBytes:1048576,
 spawnProcess:()=>{spawnCalls++;throw Error('NO_PROCESS_EXPECTED');},
 fetchImpl:async(url,init)=>{calls++;sent.push({url,init});return responseFactory();},
 beforeRequest:meta=>observations.push(meta),onResponse:async(meta,response)=>{completions.push(meta);assert.equal(response.headers.get('x-bazaar-redis-requests'),'2');},onUncertain:meta=>uncertainties.push(meta),
});
const body=JSON.stringify({text:'á\ntexto'});
const response=await fetcher(origin+'/api/mcp',{method:'POST',headers:{authorization:'Bearer '+privateToken,'content-type':'application/json'},body});
assert.deepEqual(await response.json(),{ok:true,text:'á'});assert.equal(calls,1);assert.equal(spawnCalls,0);
assert.equal(sent[0].url,origin+'/api/mcp');assert.equal(sent[0].init.redirect,'error');assert.equal(sent[0].init.credentials,'omit');assert.equal(sent[0].init.cache,'no-store');
assert.equal(sent[0].init.headers.get('x-vercel-protection-bypass'),bypassSecret);assert.equal(sent[0].init.headers.get('authorization'),'Bearer '+privateToken);
assert.equal(observations[0].requestBytes,Buffer.byteLength(body));assert.equal(observations[0].payloadHash,createHash('sha256').update(body).digest('hex'));
assert.equal(completions[0].responseBodyBytes,Buffer.byteLength('{"ok":true,"text":"á"}'));
let expectedHeaderBytes=0;for(const[key,value]of response.headers)expectedHeaderBytes+=Buffer.byteLength(key+': '+value+'\r\n');
assert.equal(completions[0].responseHeaderBytes,expectedHeaderBytes);assert.equal(completions[0].responseBytes,expectedHeaderBytes+completions[0].responseBodyBytes);
assert.equal(JSON.stringify({observations,completions,uncertainties}).includes(bypassSecret),false);assert.equal(JSON.stringify({observations,completions,uncertainties}).includes(privateToken),false);
for(const url of ['https://other-preview.vercel.app/api/mcp','https://fixed-preview.vercel.app.evil.example/api/mcp','http://fixed-preview.vercel.app/api/mcp',origin+'/api/mcp?secret=hidden',origin+'/api/mcp#hidden','https://user:password@fixed-preview.vercel.app/api/mcp'])await assert.rejects(fetcher(url),/UNBOUND_TRANSPORT_TARGET/);
for(const headers of [{'X-Vercel-Protection-Bypass':'replacement'},{'X-Vercel-Set-Bypass-Cookie':'true'},{host:'different.example'},{cookie:'existing=secret'}])await assert.rejects(fetcher(origin+'/api/mcp',{headers}),/TRANSPORT_HEADER_DENIED/);
await assert.rejects(fetcher(origin+'/api/mcp',{method:'PATCH'}),/METHOD_DENIED/);
await assert.rejects(fetcher(origin+'/api/mcp',{method:'POST',body:'x'.repeat(65537)}),/REQUEST_BODY_DENIED/);
await assert.rejects(fetcher(origin+'/api/mcp',{body:'unbound-get-body'}),/REQUEST_BODY_DENIED/);
assert.equal(calls,1);assert.equal(observations.length,1);

responseFactory=()=>new Response('',{status:302,headers:{location:'https://other-preview.vercel.app/'}});
await assert.rejects(fetcher(origin+'/api/mcp'),/REDIRECT_DENIED/);assert.equal(calls,2);assert.equal(uncertainties.at(-1).code,'REDIRECT_DENIED');
responseFactory=()=>{throw Error('transport exception '+bypassSecret+' '+privateToken);};
await assert.rejects(fetcher(origin+'/api/mcp'),error=>error.message==='TRANSPORT_UNCONFIRMED');assert.equal(calls,3);assert.equal(JSON.stringify(uncertainties).includes(bypassSecret),false);

let largeCalls=0,cancelled=0;const large=createAutomationPreviewFetch({origin,bypassSecret,maxResponseBytes:80,
 fetchImpl:async()=>{largeCalls++;return new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(100));},cancel(){cancelled++;}}));},onUncertain:meta=>uncertainties.push(meta),
});
await assert.rejects(large(origin+'/api/mcp'),/RESPONSE_OVERSIZE/);assert.equal(largeCalls,1);assert.equal(cancelled,1);
let timeoutCalls=0;const timeout=createAutomationPreviewFetch({origin,bypassSecret,timeoutMs:10,
 fetchImpl:async(_url,init)=>{timeoutCalls++;return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(Error('private unconfirmed transport '+bypassSecret)),{once:true}));},onUncertain:meta=>uncertainties.push(meta),
});
await assert.rejects(timeout(origin+'/api/mcp'),/TRANSPORT_UNCONFIRMED/);assert.equal(timeoutCalls,1);
const aborted=new AbortController();aborted.abort();await assert.rejects(fetcher(origin+'/api/mcp',{signal:aborted.signal}),/TRANSPORT_ABORTED/);assert.equal(calls,3);
let requestCalls=0;const requestFetcher=createAutomationPreviewFetch({origin,bypassSecret,fetchImpl:async(_url,init)=>{requestCalls++;assert.equal(init.headers.get('authorization'),'Bearer '+privateToken);assert.equal(init.body,body);return new Response('accepted');}});
assert.equal(await(await requestFetcher(new Request(origin+'/api/mcp',{method:'POST',headers:{authorization:'Bearer '+privateToken},body}))).text(),'accepted');assert.equal(requestCalls,1);
for(const options of [{origin:'http://localhost',bypassSecret},{origin,bypassSecret:'short'},{origin,bypassSecret,timeoutMs:12001},{origin,bypassSecret,maxResponseBytes:1048577}])assert.throws(()=>createAutomationPreviewFetch(options));
console.log(JSON.stringify({status:'PASS',exactOrigin:true,oneFetchPerAttempt:true,redirects:0,retries:0,secretsInMetadata:false,processes:0,boundedBytes:true,externalRequests:0}));
