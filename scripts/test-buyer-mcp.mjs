import assert from 'node:assert/strict';
import {startReviewServer} from './serve-buyer-mcp-review.mjs';
import {reviewBuyerMcp,expectedTools} from './buyer-mcp-review.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function readPrivateHistory(endpoint,token){
 const client=new Client({name:'bazaar-owner-review',version:'1.0.0'});
 const url=new URL(endpoint);
 const transport=new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${token}`}},fetch:async(input,init)=>{
  assert.equal(new URL(typeof input==='string'?input:input.url??String(input)).origin,url.origin);
  return fetch(input,{...init,redirect:'error'});
 }});
 try{
  await client.connect(transport);
  const response=await client.callTool({name:'get_operation_history',arguments:{}});
  return {error:response.isError===true,data:JSON.parse(response.content.find(item=>item.type==='text').text)};
 }finally{await client.close();}
}
for(const available of [true,false]){
 const server=await startReviewServer({available});
 try{
  const evidence=await reviewBuyerMcp(server.url);
  assert.equal(evidence.partialResults,!available);
  assert.equal(evidence.dynamicRegistry,available?'available':'unavailable');
  assert.equal(evidence.missingCode,available?'RESOURCE_NOT_FOUND':'REGISTRY_UNAVAILABLE');
  assert.ok(server.requests.some(r=>r.rpc?.method==='initialize'));
  assert.ok(server.requests.some(r=>r.rpc?.method==='notifications/initialized'));
  assert.ok(server.requests.some(r=>r.rpc?.method==='tools/list'));
  assert.ok(server.requests.filter(r=>r.rpc?.method==='tools/call').every(r=>expectedTools.includes(r.rpc.params.name)));
  assert.ok(server.requests.every(r=>['GET','POST'].includes(r.method)));
  const fixture=server.historyFixture;
  const [owner,other,unknown]=await Promise.all([
   readPrivateHistory(server.url,fixture.readToken),
   readPrivateHistory(server.url,fixture.otherReadToken),
   readPrivateHistory(server.url,fixture.unknownToken),
  ]);
  assert.equal(owner.error,false);assert.deepEqual(owner.data.records,[fixture.record]);
  assert.equal(other.error,false);assert.deepEqual(other.data.records,[],'Another registered owner cannot see this delivery');
  assert.equal(unknown.error,true);assert.equal(unknown.data.error.code,'UNAUTHORIZED');
  const recovered=await readPrivateHistory(server.url,fixture.readToken);
  assert.deepEqual(recovered,owner,'A fresh MCP client recovers the same owner record');
  assert.ok(server.requests.filter(r=>r.rpc?.params?.name==='get_operation_history').every(r=>Object.keys(r.rpc.params.arguments??{}).length===0),'Credentials belong only in Authorization, never tool arguments');
  console.log('PASS authenticated MCP owner read, concurrent owner isolation, unknown credential rejection and fresh-client recovery; synthetic in-memory history only');
  console.log(`PASS real SDK StreamableHTTP initialize/list/search/get: registry ${evidence.dynamicRegistry}; missing ${evidence.missingCode}; paymentOptions preserved; no payments`);
 }finally{await server.close();}
}
await assert.rejects(reviewBuyerMcp('https://example.com/api/mcp'));
console.log('PASS public endpoint rejected');
