import assert from 'node:assert/strict';
import { credentials,reserve,ownedEnvelope,canResumePreflight,KEY,HOST } from './validate-provider-review-redis.mjs';
assert.equal(credentials(`UPSTASH_REDIS_REST_URL=https://${HOST}\nUPSTASH_REDIS_REST_TOKEN=synthetic`).url,`https://${HOST}`);
for(const u of ['https://other.upstash.io',`https://${HOST}/evil`,`https://${HOST}?secret=x`,`http://${HOST}`])assert.throws(()=>credentials(`UPSTASH_REDIS_REST_URL=${u}\nUPSTASH_REDIS_REST_TOKEN=x`));
const j={requests:0,commands:0,bytes:0};reserve(j,['GET',KEY]);assert.equal(j.requests,1);assert.equal(j.commands,1);
for(const c of [['DEL',KEY],['GET','historical'],['SCAN','0'],['EVAL','return 1',1,KEY,'missing','','x']])assert.throws(()=>reserve(j,c));
assert.equal(j.requests,1);assert.throws(()=>reserve({...j,requests:200},['GET',KEY]));assert.throws(()=>reserve({...j,commands:200},['GET',KEY]));assert.throws(()=>reserve({...j,bytes:102400},['GET',KEY]));
const envelope=id=>JSON.stringify({version:1,state:{version:1,records:[{submission:{submissionId:id}}]}});
ownedEnvelope(envelope('synthetic'),'synthetic');assert.throws(()=>ownedEnvelope(envelope('foreign'),'synthetic'));assert.throws(()=>ownedEnvelope('{bad','synthetic'));
const script=`local old=redis.call('GET',KEYS[1])
if ARGV[1]=='missing' then
  if old then return 0 end
else
  if not old or old~=ARGV[2] then return 0 end
end
redis.call('SET',KEYS[1],ARGV[3])
return 1`;
assert.throws(()=>reserve(j,['EVAL',script+"\nredis.call('DEL','foreign')",1,KEY,'missing','','{}']));
reserve(j,['EVAL',script,1,KEY,'missing','','{}']);assert.equal(j.commands,4);
const interrupted={version:1,status:'started',requests:1,commands:1,bytes:Buffer.byteLength(JSON.stringify(['GET',KEY])),checks:{},lastCommand:{name:'GET',reserved:true}};
assert.equal(canResumePreflight(interrupted),true);
for(const changed of [{requests:2},{commands:3},{status:'prepared'},{bytes:0},{checks:{written:true}},{lastCommand:{name:'EVAL',reserved:true}},{lastCommand:{name:'GET',reserved:true,confirmed:true}}])assert.equal(canResumePreflight({...interrupted,...changed}),false);
console.log(JSON.stringify({ok:true,network:false,exactHost:true,exactKey:true,budgets:true,destructiveCommandsRejected:true}));
