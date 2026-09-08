import assert from 'node:assert/strict';
import { BazaarAgentClient } from '../lib/bazaar-agent-client.ts';
import { decimalToAtomic } from '../lib/operation-history-client.ts';
const card = {id:'external-fixture',name:'Fixture',url:'https://provider.example',provider:{name:'Provider'},network:'stellar:testnet',payment:{amount:'0.001',asset:'USDC',destination:'GAHOZFSDG2DW32FOUUP6XA4SMN3OCR7NOUXHAPYFN47BLJX56GJ3WCSM'}};
const writes=[];
const original=globalThis.fetch;
let status=201, calls=0;
globalThis.fetch=async(url,options)=>{writes.push({url:String(url),options,body:JSON.parse(options.body)});return new Response('{}',{status});};
try {
  const client=new BazaarAgentClient({baseUrl:'https://bazaar.example',history:{writeToken:'test-only-history-credential',agentId:'agent-1',includeResult:true}});
  // Inject a completed provider outcome; no signer/facilitator/payment exists in this test.
  client.executeServiceCore=async()=>{calls++;return {ok:true,data:{report:'fixture'},payment:{transactionHash:'a'.repeat(64)},delivery:{resultAvailable:true}};};
  const first=await client.executeService(card,{});
  assert.equal(first.history.status,'recorded');
  assert.equal(writes[0].body.service.url,card.url);
  assert.equal(writes[0].body.payment.recipient,card.payment.destination);
  assert.equal(writes[0].body.payment.amountAtomic,'10000');
  assert.equal(writes[0].body.payment.status,'reported-unverified');
  assert.deepEqual(writes[0].body.delivery.result,{report:'fixture'});
  assert.equal(writes[0].options.redirect,'error');
  status=503;
  const second=await client.executeService(card,{});
  assert.equal(second.ok,true);
  assert.equal(second.history.status,'failed');
  assert.equal(calls,2,'History failure must not repeat provider call');
  client.executeServiceCore=async()=>{throw new Error('provider transport interrupted');};
  await assert.rejects(client.executeService(card,{}),/provider transport interrupted/);
  assert.equal(writes.at(-1).body.payment.status,'unknown');
  assert.equal(writes.at(-1).body.delivery.status,'unknown');
  assert.ok(!JSON.stringify(writes.at(-1).body).includes('transport interrupted'));
  assert.equal(decimalToAtomic('0.0000001'),'1');
  assert.throws(()=>decimalToAtomic('1e-3'));
  console.log('Agent history integration: success reporting, private result opt-in, interruption uncertainty, no payment retry passed. Simulated outcomes only.');
} finally {globalThis.fetch=original;}
