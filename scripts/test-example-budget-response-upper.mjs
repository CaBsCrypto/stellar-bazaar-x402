// Real locked SDK decoder, synthetic HTTP only. No credentials or network.
import assert from 'node:assert/strict';
import {Redis} from '@upstash/redis';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {exampleBudgetRedisResponseUpperBytes} from '../lib/example-budget-wire.ts';
const cases=[null,0,1,400000,'','OK','simple ascii','"\\'.repeat(8192),'\0\b\f\n\r\t'.repeat(1024),'ñ漢🙂'.repeat(8192),JSON.stringify({field:'"\\\n🙂'.repeat(1024)}),['a','"\\\n','🙂漢',0,null],['a',['ñ',[0,'"\\',null]],1],JSON.stringify({value:'x'.repeat(1048400)})];
const encode=value=>typeof value==='string'?Buffer.from(value,'utf8').toString('base64'):Array.isArray(value)?value.map(encode):value;
let checks=0,httpSimulated=0,maximumPhysicalBody=0,maximumReconstructedUpper=0;
const savedFetch=globalThis.fetch;
try{
 for(const responseEncoding of ['base64',false])for(const result of cases){
  let decoded,physicalBody;
  globalThis.fetch=async(url,options)=>{
   assert.equal(new URL(url).origin,'https://sdk-response.invalid');checks++;
   const header=new Headers(options.headers).get('upstash-encoding');assert.equal(header,responseEncoding==='base64'?'base64':null);checks++;
   const raw=responseEncoding==='base64'?encode(result):result;
   physicalBody=JSON.stringify({result:raw});httpSimulated++;
   return new Response(physicalBody,{status:200,headers:{'content-type':'application/json'}});
  };
  const redis=new Redis({url:'https://sdk-response.invalid',token:'synthetic-local-only',automaticDeserialization:false,retry:false,enableAutoPipelining:false,responseEncoding});
  redis.use(async(request,next)=>{const response=await next(request);decoded=response;return response;});
  await redis.eval('return 1',[],[]);
  assert.deepEqual(decoded.result,result);checks++;
  const actual=Buffer.byteLength(physicalBody),upper=exampleBudgetRedisResponseUpperBytes(decoded);
  assert.ok(upper>=actual+4096,'reconstruction covers actual base64 or plain JSON bytes plus framing');checks++;
  assert.equal(upper,Math.max(Buffer.byteLength(JSON.stringify(decoded)),Buffer.byteLength(JSON.stringify({...decoded,result:encode(decoded.result)})))+4096);checks++;
  maximumPhysicalBody=Math.max(maximumPhysicalBody,actual);maximumReconstructedUpper=Math.max(maximumReconstructedUpper,upper);
 }
}finally{globalThis.fetch=savedFetch;}
for(const bad of [undefined,()=>1,1n]){assert.throws(()=>exampleBudgetRedisResponseUpperBytes(bad));checks++;}
const sdkSource=await readFile('node_modules/@upstash/redis/chunk-K7RP6Y36.mjs');
assert.match(sdkSource.toString(),/responseEncoding: config\.responseEncoding \?\? "base64"/);checks++;
console.log(JSON.stringify({status:'PASS_LOCAL_LOCKED_SDK_RESPONSE_UPPER',checks,syntheticHttpRequests:httpSimulated,networkRequests:0,credentialReads:0,ledgerWrites:0,payments:0,maximumPhysicalBody,maximumReconstructedUpper,sdkSourceSha256:createHash('sha256').update(sdkSource).digest('hex'),covers:['UTF-8','quote-heavy JSON','escaped controls','nested Redis arrays','near-one-MiB JSON','base64 and plain SDK decoding'],limitations:['Body plus a fixed framing allowance is a conservative transport model, not a measured Upstash invoice.','The reviewed native GET/EVAL scripts return UTF-8 strings, arrays, numbers or null. This model does not promise bounds for binary payloads or unreviewed scripts.']}));
