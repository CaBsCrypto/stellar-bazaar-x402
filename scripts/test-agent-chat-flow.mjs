import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateHistoryKeypair, authenticateHistory } from '../lib/operation-history-auth.ts';
import { createHistoryHandlers } from '../lib/operation-history-http.ts';
import { createHistoryStore } from '../lib/operation-history-store.ts';
import { formatHumanHistoryUrl } from '../lib/operation-history-client.ts';
const alice = generateHistoryKeypair();
const bob = generateHistoryKeypair();
const config = JSON.stringify([alice,bob].map(({ownerId,readTokenHash,writeTokenHash})=>({ownerId,readTokenHash,writeTokenHash})));
const auth = (authorization, write=false) => authenticateHistory(authorization,write,config);
assert.equal(auth(`Bearer ${alice.readToken}`).ownerId,auth(`Bearer ${alice.writeToken}`,true).ownerId);
assert.throws(()=>auth(`Bearer ${alice.readToken}`,true),{code:'FORBIDDEN'});
for(const prefix of ['bz_read_','bz_write_','review-reader-','review-writer-']) assert.throws(()=>auth(`Bearer ${prefix}${'a'.repeat(48)}`),{code:'UNAUTHORIZED'});
assert.throws(()=>authenticateHistory(`Bearer ${alice.readToken}`,false,undefined),{code:'UNAUTHORIZED'});
const hashes = new Map(), lists = new Map();
const redis = {
 async eval(_script,[recordKey,indexKey],[id,digest,entry]) {
  const records=hashes.get(recordKey)??new Map();
  if(records.has(id)) return [JSON.parse(records.get(id)).digest===digest?'existing':'conflict',records.get(id)];
  records.set(id,entry); hashes.set(recordKey,records); lists.set(indexKey,[id,...(lists.get(indexKey)??[])]); return ['created',entry];
 },
 async lrange(key,start,stop){return (lists.get(key)??[]).slice(start,stop+1)},
 async hmget(key,...fields){return Object.fromEntries(fields.map(field=>[field,hashes.get(key)?.get(field)]))}
};
const handlers=()=>createHistoryHandlers({authenticate:auth,store:()=>createHistoryStore(redis)});
const input={clientOperationId:'chat-fixture-1',mode:'fixture',agentId:'test-agent',service:{id:'demo',title:'Example',provider:'Fixture',url:'https://example.com'},payment:{status:'unknown',network:'stellar:testnet',asset:'USDC',amountAtomic:'10000',recipient:'G'+'A'.repeat(55)},delivery:{status:'reported-delivered',result:{text:'Synthetic result'}}};
const post=(token,body=input)=>new Request('https://example.com/api/operations',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
const get=token=>new Request('https://example.com/api/operations',{headers:{Authorization:`Bearer ${token}`}});
const response=await handlers().POST(post(alice.writeToken)); assert.equal(response.status,201); const original=(await response.json()).record;
assert.equal((await handlers().POST(post(alice.readToken))).status,403);
assert.equal((await handlers().POST(post(alice.writeToken,{...input,ownerId:bob.ownerId}))).status,400);
assert.deepEqual((await (await handlers().GET(get(bob.readToken))).json()).records,[]);
assert.equal((await handlers().GET(get('bz_read_'+'b'.repeat(48)))).status,401);
assert.equal((await handlers().GET(get(''))).status,401);
assert.deepEqual((await (await handlers().GET(get(alice.readToken))).json()).records,[original]);
const retry=await handlers().POST(post(alice.writeToken)); assert.equal(retry.status,200); assert.deepEqual((await retry.json()).record,original);
assert.equal(formatHumanHistoryUrl('https://example.com',alice.readToken),`https://example.com/history#token=${alice.readToken}`);
const chat=readFileSync(new URL('../components/AgentChatDemo.tsx',import.meta.url),'utf8');
assert(!chat.includes('generateHistoryKeypair')); assert(!chat.includes('localStorage.setItem')); assert(chat.includes('/history/review')); assert(chat.includes('respuestas de ejemplo'));
console.log('PASS registered pair -> authenticated write -> read -> fresh handlers recovery, least privilege, owner isolation, idempotency and unknown-token rejection. Local Redis double; no payments or network.');
