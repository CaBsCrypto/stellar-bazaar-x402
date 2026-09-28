import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buyerAcceptanceCard} from './buyer-acceptance-fixture.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
export const expectedTools=['get_bazaar_capabilities','list_services','search_services','get_service','list_workflow_bundles','get_workflow_bundle','validate_service_card','get_operation_history'];
export async function reviewBuyerMcp(endpoint){
 const url=new URL(endpoint);
 assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/api/mcp');assert.ok(!url.username&&!url.password&&!url.search&&!url.hash,'Only uncredentialed loopback MCP review');
 const client=new Client({name:'bazaar-buyer-review',version:'1.0.0'});
 const transport=new StreamableHTTPClientTransport(url,{fetch:async(input,init)=>{assert.equal(new URL(typeof input==='string'?input:input.url??String(input)).origin,url.origin);return fetch(input,{...init,redirect:'error'});}});
 try{
  await client.connect(transport);
  assert.equal(client.getServerVersion().name,'stellar-bazaar-discovery');assert.ok(client.getServerCapabilities().tools);
  const listed=await client.listTools();assert.deepEqual(listed.tools.map(t=>t.name).sort(),[...expectedTools].sort());
  const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});return {error:r.isError===true,data:JSON.parse(r.content.find(c=>c.type==='text').text)};};
  const caps=await call('get_bazaar_capabilities');assert.equal(caps.error,false);assert.deepEqual(caps.data.writes,[]);assert.equal(caps.data.registry.mutationViaMcp,false);assert.equal(caps.data.registry.providerMetadataTrusted,false);assert.ok(Object.values(caps.data.paymentFlow.sideEffects).every(v=>v===false));
  const all=await call('list_services');assert.equal(all.error,false);assert.equal(all.data.services.length,2);
  const search=await call('search_services',{query:'sandbox',limit:1});assert.equal(search.error,false);assert.equal(search.data.partialResults,true);assert.ok(search.data.nextCursor);
  const next=await call('search_services',{query:'sandbox',limit:1,cursor:search.data.nextCursor});assert.equal(next.error,false);assert.notEqual(next.data.results[0].resource.id,search.data.results[0].resource.id);assert.equal(next.data.nextCursor,null);
  const card=search.data.results[0].resource,detail=await call('get_service',{id:card.id});assert.equal(detail.error,false);
  assert.deepEqual(detail.data.resource,card);assert.deepEqual(card,buyerAcceptanceCard());assert.deepEqual(all.data.services.find(s=>s.id===card.id).paymentOptions,card.paymentOptions);
  assert.equal(card.network,'stellar:testnet');assert.equal(card.payment.amount,'0.001');assert.equal(card.payment.destination,buyerAcceptanceCard().payment.destination);assert.equal(card.payment.asset,'USDC');
  assert.deepEqual(card.paymentOptions.map(o=>[o.asset,o.amount,o.contract,o.destination]),[['USDC','0.001','CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',card.payment.destination],['XLM','0.01','CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',card.payment.destination]]);
  const missing=await call('get_service',{id:'buyer-review-missing'});assert.equal(missing.error,true);assert.equal(missing.data.code,all.data.partialResults?'REGISTRY_UNAVAILABLE':'RESOURCE_NOT_FOUND');
  const history=await call('get_operation_history');assert.equal(history.error,true);
  return {server:client.getServerVersion(),tools:listed.tools.map(t=>t.name),dynamicRegistry:all.data.dynamicRegistry,partialResults:all.data.partialResults,missingCode:missing.data.code,paymentExecuted:false,contract:card};
 }finally{await client.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await reviewBuyerMcp((process.argv[2]==='--url'?process.argv[3]:process.argv[2])??'http://127.0.0.1:3214/api/mcp'),null,2));


