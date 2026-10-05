import {createHash} from 'node:crypto';

export const X402_ACCEPTANCE_RUNTIME_PROOF_HEADER='x-bazaar-runtime-proof-sha256';
export const X402_RUNTIME_PUBLIC_FLAG_KEYS=[
 'NEXT_PUBLIC_BAZAAR_MARKETPLACE','BAZAAR_ENABLE_OPEN_WORKSPACES','BAZAAR_ENABLE_MARKETPLACE','BAZAAR_ENABLE_MARKET_PURCHASES','BAZAAR_X402_MARKETPLACE_ENABLED',
 'BAZAAR_ENABLE_SELF_LISTING_INTAKE','BAZAAR_ENABLE_PROVIDER_ACTIVATION','BAZAAR_ACCEPTANCE_METER','BAZAAR_ACCEPTANCE_SALE','BAZAAR_ACCEPTANCE_X402',
 'BAZAAR_ACCEPTANCE_STORAGE_CAPS_JSON','BAZAAR_ACCEPTANCE_CATALOG_VALUE_CAPS_JSON','BAZAAR_ACCEPTANCE_SETTLEMENT_KEY','BAZAAR_ACCEPTANCE_CATALOG_CARD_ID',
 'BAZAAR_WORKSPACE_CREATION_PAUSED','BAZAAR_WORKSPACE_ADMISSION','BAZAAR_WORKSPACE_PUBLIC_ORIGIN','BAZAAR_WORKSPACE_BACKEND','BAZAAR_PROVIDER_REVIEW_BACKEND',
 'BAZAAR_WORKSPACE_PREFIX','BAZAAR_MARKET_PREFIX','BAZAAR_REVIEW_PREFIX','BAZAAR_DYNAMIC_PREFIX','BAZAAR_WORKSPACE_INVITE_HASHES_JSON',
 'BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE','BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY','BAZAAR_MARKET_OPERATOR_HASH','BAZAAR_PROVIDER_PREVIEW_HOST',
 'BAZAAR_ENABLE_PROVIDER_REVIEW_ADMIN','BAZAAR_ENABLE_PUBLIC_PROVIDER_REVIEW','BAZAAR_ENABLE_REGISTRY_MUTATIONS',
 'X402_PILOT_PAYMENTS_ENABLED','X402_LEGACY_PAYMENTS_ENABLED','X402_ENABLE_LOCAL_PAYER','NEXT_PUBLIC_X402_XLM_PILOT','STELLAR_X402_FACILITATOR_URL','STELLAR_X402_RPC_URL',
] as const;
export const X402_RUNTIME_SECRET_PRESENCE_KEYS=[
 'BAZAAR_WORKSPACE_REDIS_REST_URL','BAZAAR_WORKSPACE_REDIS_REST_TOKEN','BAZAAR_REVIEW_REDIS_REST_URL','BAZAAR_REVIEW_REDIS_REST_TOKEN',
 'BAZAAR_MARKET_REVIEW_SECRET','BAZAAR_PROVIDER_PREVIEW_BYPASS','STELLAR_X402_FACILITATOR_API_KEY',
 'UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN',
] as const;
type Environment=Record<string,string|undefined>;
export type X402AcceptanceRuntimeProof={version:1;publicFlags:Record<string,string>;secretPresence:Record<string,boolean>;redisOriginHashes:{workspace:string;review:string};deploymentOrigin:string};
const expectedRedisOrigin='https://smooth-dory-323957.upstash.io';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');

/** The complete schema is sorted recursively; env maps are read at request time. */
export function canonicalX402AcceptanceRuntimeProof(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonicalX402AcceptanceRuntimeProof).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalX402AcceptanceRuntimeProof((value as Record<string,unknown>)[k])).join(',')+'}';
 const scalar=JSON.stringify(value);if(scalar===undefined)throw Error('INVALID_RUNTIME_PROOF_VALUE');return scalar;
}

/** Private values are never included or hashed. Redis URLs permit only the frozen public origin. */
export function buildX402AcceptanceRuntimeProof(environment:Environment):X402AcceptanceRuntimeProof|undefined{
 try{
  if(environment.VERCEL_ENV!=='preview')return;
  const host=environment.VERCEL_URL??'';
  if(!/^stellar-bazaar-x402-[a-z0-9]+-cabscryptocontacto-6028s-projects\.vercel\.app$/.test(host))return;
  const redisOrigin=(key:string)=>{const u=new URL(environment[key]??'');if(u.origin!==expectedRedisOrigin||u.protocol!=='https:'||u.pathname!=='/'||u.username||u.password||u.search||u.hash)return;return u.origin;};
  const workspace=redisOrigin('BAZAAR_WORKSPACE_REDIS_REST_URL'),review=redisOrigin('BAZAAR_REVIEW_REDIS_REST_URL');if(!workspace||!review)return;
  const publicFlags:Record<string,string>={};
  for(const key of X402_RUNTIME_PUBLIC_FLAG_KEYS){const value=environment[key]??'';if(typeof value!=='string'||value.length>8192||/\bS[A-Z2-7]{55}\b|-----BEGIN .*PRIVATE KEY-----|\b(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}\b|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/.test(value))return;publicFlags[key]=value;}
  // These two plan URLs are public literals. A URL carrying credentials or query secrets is never digested.
  if(!['','https://channels.openzeppelin.com/x402/testnet'].includes(publicFlags.STELLAR_X402_FACILITATOR_URL)||!['','https://soroban-testnet.stellar.org'].includes(publicFlags.STELLAR_X402_RPC_URL))return;
  return {version:1,publicFlags,secretPresence:Object.fromEntries(X402_RUNTIME_SECRET_PRESENCE_KEYS.map(key=>[key,typeof environment[key]==='string'&&environment[key]!.length>0])),redisOriginHashes:{workspace:digest(workspace),review:digest(review)},deploymentOrigin:'https://'+host};
 }catch{return;}
}

/** Call only after the existing private orders handler has authenticated and completed. */
export function withX402AcceptanceRuntimeProof(request:Request,response:Response,environment:Environment=process.env):Response{
 try{
  const headers=new Headers(response.headers);headers.delete(X402_ACCEPTANCE_RUNTIME_PROOF_HEADER);
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/api/market/orders'&&!url.search&&!url.hash&&/^Bearer [A-Za-z0-9_-]{43}$/.test(request.headers.get('authorization')??'')&&response.status===200&&response.headers.get('x-bazaar-acceptance-meter')==='v2'&&environment.BAZAAR_ACCEPTANCE_METER==='true'&&environment.BAZAAR_ACCEPTANCE_X402==='true'){
   const proof=buildX402AcceptanceRuntimeProof(environment);if(proof)headers.set(X402_ACCEPTANCE_RUNTIME_PROOF_HEADER,digest(canonicalX402AcceptanceRuntimeProof(proof)));
  }
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 }catch{return response;}
}
