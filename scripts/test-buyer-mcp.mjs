import assert from 'node:assert/strict';
import {startReviewServer} from './serve-buyer-mcp-review.mjs';
import {reviewBuyerMcp,expectedTools} from './buyer-mcp-review.mjs';
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
  console.log(`PASS real SDK StreamableHTTP initialize/list/search/get: registry ${evidence.dynamicRegistry}; missing ${evidence.missingCode}; paymentOptions preserved; no payments`);
 }finally{await server.close();}
}
await assert.rejects(reviewBuyerMcp('https://example.com/api/mcp'));
console.log('PASS public endpoint rejected');
