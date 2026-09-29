import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { getReviewRedis, getReviewPrefix } from "./provider-review-runtime.ts";

export type ReviewLimit = {ok:true}|{ok:false;status:429|503;code:string;retryAfter:number};
// Only counters/reservations expire. Submission records and activation evidence never do.
export const REVIEW_LIMIT_SCRIPT = `-- bazaar-review-limits-v1
local limits=cjson.decode(ARGV[1]); local ttls=cjson.decode(ARGV[2]);
if #KEYS>#limits and redis.call('EXISTS',KEYS[#KEYS])==1 then return {1,0} end
for i=1,#limits do
 local count=tonumber(redis.call('GET',KEYS[i]) or '0')
 if not count then return redis.error_reply('Corrupt rate counter') end
 if count>=limits[i] then return {0,math.max(redis.call('TTL',KEYS[i]),1)} end
end
for i=1,#limits do
 local count=redis.call('INCR',KEYS[i]); if count==1 then redis.call('EXPIRE',KEYS[i],ttls[i]) end
end
if #KEYS>#limits then redis.call('SET',KEYS[#KEYS],'1','EX',86400) end
return {1,0}`;

function digest(value:string):string {
  const secret=process.env.BAZAAR_REVIEW_RATE_SECRET;
  if(!secret||secret.length<32)throw Error("Rate secret missing");
  return createHmac('sha256',secret).update(value).digest('hex');
}
function requester(request:Request):string {
  if(process.env.VERCEL==='1'){
    // Vercel overwrites this header. Do not trust it on arbitrary self-hosted servers.
    const ip=request.headers.get('x-forwarded-for')?.trim()??'';
    if(!isIP(ip))throw Error('Trusted single client IP missing');
    return ip;
  }
  if(['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname))return 'loopback';
  throw Error('Untrusted runtime');
}
async function consume(keys:string[],limits:number[],ttls:number[]):Promise<ReviewLimit>{
  try{
    const redis=getReviewRedis();if(!redis)throw Error('Store missing');
    const result=await redis.eval(REVIEW_LIMIT_SCRIPT,keys,[JSON.stringify(limits),JSON.stringify(ttls)]);
    if(!Array.isArray(result)||result.length!==2||![0,1].includes(result[0])||!Number.isFinite(result[1]))throw Error('Unknown limiter result');
    return result[0]===1?{ok:true}:{ok:false,status:429,code:'RATE_LIMITED',retryAfter:Math.max(1,Math.ceil(result[1]))};
  }catch{return {ok:false,status:503,code:'LIMIT_STORE_UNAVAILABLE',retryAfter:60};}
}
export async function limitReviewRequest(request:Request,access:string):Promise<ReviewLimit>{
  try{
    const prefix=getReviewPrefix();const ip=digest('ip:'+requester(request));
    return await consume([`${prefix}:rate:requests:ip:${ip}`,`${prefix}:rate:requests:access:${digest(access||'missing')}`],[60,60],[60,60]);
  }catch{return {ok:false,status:503,code:'LIMIT_CONFIG_UNAVAILABLE',retryAfter:60};}
}
export async function limitNewReviewRequest(request:Request,intentDigest:string):Promise<ReviewLimit>{
  try{
    const prefix=getReviewPrefix();const ip=digest('ip:'+requester(request));
    return await consume([`${prefix}:rate:new:ip:${ip}`,`${prefix}:rate:new:global`,`${prefix}:rate:intent:${digest(intentDigest)}`],[10,50],[3600,86400]);
  }catch{return {ok:false,status:503,code:'LIMIT_CONFIG_UNAVAILABLE',retryAfter:60};}
}
export async function limitReviewAdminRequest(request:Request,identity:string,maximum=50,windowSeconds=60):Promise<ReviewLimit>{
  try{
    const prefix=getReviewPrefix();const ip=digest('ip:'+requester(request));
    return await consume([`${prefix}:rate:admin:ip:${maximum}:${ip}`,`${prefix}:rate:admin:identity:${digest(identity)}`],[maximum,maximum],[windowSeconds,windowSeconds]);
  }catch{return {ok:false,status:503,code:'LIMIT_CONFIG_UNAVAILABLE',retryAfter:60};}
}
