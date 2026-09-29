// Real MCP client/transport/handlers; synthetic registry and no external network.
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {startReviewServer} from './serve-buyer-mcp-review.mjs';
import {buyerAcceptanceCard} from './buyer-acceptance-fixture.mjs';

const server=await startReviewServer();
const client=new Client({name:'seller-cold-entry',version:'1.0.0'});
const transport=new StreamableHTTPClientTransport(new URL(server.url), {fetch:async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input.url??String(input));
  assert.equal(url.origin,new URL(server.url).origin);
  return fetch(input,{...init,redirect:'error'});
}});
const unpack=result=>result.structuredContent??JSON.parse(result.content.find(item=>item.type==='text').text);
try {
  await client.connect(transport);
  const listed=await client.listTools();
  assert(listed.tools.some(tool=>tool.name==='validate_service_card'));
  assert(!listed.tools.some(tool=>/publish|ingest|execute_service/.test(tool.name)));
  const cap=unpack(await client.callTool({name:'get_bazaar_capabilities',arguments:{}}));
  assert.equal(cap.providerOnboarding.guide,'/PROVIDER_ONBOARDING.md');
  assert.equal(cap.providerOnboarding.intakeEnabled,false);
  assert.equal(cap.providerOnboarding.automaticPublication,false);
  assert.equal(cap.providerOnboarding.providerUsesOperatorSecret,false);
  assert.equal(cap.providerOnboarding.submissionStorage,'local-file-pilot');
  assert.equal(cap.providerOnboarding.publicIntakeEnabled,false);
  const card=buyerAcceptanceCard();
  const valid=unpack(await client.callTool({name:'validate_service_card',arguments:{card}}));
  assert.equal(valid.valid,true);
  const invalid=unpack(await client.callTool({name:'validate_service_card',arguments:{card:{...card,payment:{...card.payment,amount:'-1'}}}}));
  assert.equal(invalid.valid,false);
  assert(server.requests.every(r=>!r.rpc?.params?.name || ['get_bazaar_capabilities','validate_service_card'].includes(r.rpc.params.name)));
  console.log('PASS seller initialize/list/capabilities/valid+invalid card using real MCP transport; no submission, provider call or payment.');
} finally {await client.close();await server.close();}
