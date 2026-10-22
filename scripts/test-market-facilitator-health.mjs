import assert from 'node:assert/strict';
import {inspectMarketFacilitatorConfiguration} from '../lib/market-facilitator-health.ts';
const key='synthetic-unit-test-key-only',endpoint='https://channels.openzeppelin.com/x402/testnet/supported';
let calls=0;
const observed=async(response,extra={})=>inspectMarketFacilitatorConfiguration({apiKey:key,now:()=>0,fetcher:async(url,init)=>{calls++;assert.equal(url,endpoint);assert.equal(init.method,'GET');assert.equal(init.headers.authorization,'Bearer '+key);assert.equal(init.redirect,'manual');assert.equal(init.credentials,'omit');assert.equal(init.body,undefined);return response;},...extra});
for(const invalid of ['', 'a\nb', 'x'.repeat(1025)]){const before=calls;const r=await observed(new Response('{}'),{apiKey:invalid});assert.equal(r.status,'configuration-incomplete');assert.equal(calls,before);}
{const before=calls;assert.equal((await observed(new Response('{}'),{url:'https://attacker.example'})).status,'configuration-incomplete');assert.equal(calls,before);}
for(const status of [401,403,429,500]){const r=await observed(new Response(key,{status,headers:{'retry-after':'60'}}));assert.equal(r.status,'unavailable');assert.equal(r.httpStatus,status);assert.equal(r.retryAfter,60);assert.ok(!JSON.stringify(r).includes(key));}
for(const body of ['invalid','{}',JSON.stringify({kinds:[{x402Version:2,network:'stellar:pubnet',scheme:'exact'}]}),'x'.repeat(32769)]){const r=await observed(new Response(body));assert.equal(r.protocolAdvertised,false);assert.equal(r.credentialValidated,false);assert.ok(!JSON.stringify(r).includes(key));}
const success=await observed(Response.json({kinds:[{x402Version:2,network:'stellar:testnet',scheme:'exact'}],private:key}));assert.equal(success.status,'available');assert.equal(success.protocolAdvertised,true);assert.equal(success.credentialValidated,false);assert.ok(!JSON.stringify(success).includes(key));
assert.equal((await observed(new Response(null,{status:302,headers:{location:'https://attacker.example'}}))).status,'unknown');
assert.equal((await observed(Response.json({kinds:[]}),{fetcher:async()=>{throw Error(key);}})).status,'unknown');
console.log(JSON.stringify({status:'PASS_PRIVATE_FACILITATOR_READ_ONLY_HEALTH',cases:15,networkRequests:0,payments:0,secretValuesReturned:false}));
