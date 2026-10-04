import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAutomationPreviewFetch,serializePreviewFetch,withProtectedPrivateMcp} from '../examples/protected-preview-client.mjs';

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
let unreadHookSnapshot;
const notificationFetcher=createAutomationPreviewFetch({origin,bypassSecret,fetchImpl:async()=>new Response('ignored notification body',{status:202}),onResponse:(_meta,value)=>{unreadHookSnapshot=value;}});
const notification=await notificationFetcher(origin+'/api/mcp');
await notification.body.cancel();assert.equal(unreadHookSnapshot.bodyUsed,false);assert.equal(await unreadHookSnapshot.text(),'ignored notification body');

// The installed MCP SDK starts GET in the background after initialized receives
// 202. Delaying that GET forces the first tool POST to queue behind all its hooks.
let releaseBackground,startBackground,activeHooks=0,maxActiveHooks=0,actionEntered=false;
const backgroundStarted=new Promise(resolve=>{startBackground=resolve;}),mcpAttempts=[],mcpNetwork=[];
const mcpFetch=serializePreviewFetch(createAutomationPreviewFetch({origin,bypassSecret,
 beforeRequest:meta=>{activeHooks++;maxActiveHooks=Math.max(maxActiveHooks,activeHooks);mcpAttempts.push({...meta,status:'PENDING'});},
 onResponse:async meta=>{await Promise.resolve();const attempt=mcpAttempts.at(-1);assert.equal(attempt.payloadHash,meta.payloadHash);assert.equal(attempt.method,meta.method);attempt.status='CONFIRMED';activeHooks--;},
 onUncertain:()=>assert.fail('Synthetic MCP request must be confirmed'),
 fetchImpl:async(_url,init)=>{
  mcpNetwork.push(init.method);if(init.method==='GET'){startBackground();await new Promise(resolve=>{releaseBackground=resolve;});return new Response('{"discovery":true}',{headers:{'content-type':'application/json'}});}
  const message=JSON.parse(init.body);
  if(message.method==='initialize')return new Response(JSON.stringify({jsonrpc:'2.0',id:message.id,result:{protocolVersion:message.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'synthetic-preview',version:'1'}}}),{headers:{'content-type':'application/json'}});
  if(message.method==='notifications/initialized')return new Response(null,{status:202});
  assert.equal(message.method,'tools/call');return new Response(JSON.stringify({jsonrpc:'2.0',id:message.id,result:{content:[{type:'text',text:'accepted'}]}}),{headers:{'content-type':'application/json'}});
 }
}));
const mcpRun=withProtectedPrivateMcp(origin,'a'.repeat(43),mcpFetch,async client=>{actionEntered=true;return client.callTool({name:'synthetic_tool',arguments:{}},undefined,{timeout:5000});});
await Promise.race([backgroundStarted,new Promise((_,reject)=>setTimeout(()=>reject(Error('Background GET not started: '+JSON.stringify(mcpNetwork)+' attempts '+JSON.stringify(mcpAttempts))),1000))]);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(actionEntered,true);assert.deepEqual(mcpNetwork,['POST','POST','GET']);assert.equal(activeHooks,1);
releaseBackground();assert.equal((await mcpRun).content[0].text,'accepted');assert.deepEqual(mcpNetwork,['POST','POST','GET','POST']);assert.equal(maxActiveHooks,1);assert.equal(activeHooks,0);assert.ok(mcpAttempts.every(attempt=>attempt.status==='CONFIRMED'));

// A queued cancellation has no hooks/effect. Failure reaches its caller, while
// the queue itself remains usable for the caller's explicit recovery decision.
let releaseQueue,queueStarted,queuedCalls=0;const queueStartedPromise=new Promise(resolve=>{queueStarted=resolve;}),queueAbort=new AbortController();
const queued=serializePreviewFetch(async()=>{queuedCalls++;if(queuedCalls===1){queueStarted();await new Promise(resolve=>{releaseQueue=resolve;});}return new Response('confirmed');});
const queuedFirst=queued(origin+'/api/mcp');await queueStartedPromise;const queuedSecond=queued(origin+'/api/mcp',{signal:queueAbort.signal});queueAbort.abort();releaseQueue();await queuedFirst;await assert.rejects(queuedSecond,/TRANSPORT_ABORTED/);assert.equal(queuedCalls,1);
let recoverCalls=0;const originalFailure=Error('original failure'),recoverable=serializePreviewFetch(async()=>{if(++recoverCalls===1)throw originalFailure;return new Response('explicit next decision');});
await assert.rejects(recoverable(origin+'/api/mcp'),error=>error===originalFailure);assert.equal(await(await recoverable(origin+'/api/mcp')).text(),'explicit next decision');assert.equal(recoverCalls,2);
console.log(JSON.stringify({status:'PASS',exactOrigin:true,oneFetchPerAttempt:true,redirects:0,retries:0,secretsInMetadata:false,processes:0,boundedBytes:true,sdk202BackgroundGetSerialized:true,queuedAbortHasNoEffect:true,externalRequests:0}));
