import {SELLER_STORAGE_READ_LUA,SELLER_STORAGE_WRITE_LUA} from './seller-redis-secret-store.mjs';
import {sellerCanonical,sellerHash} from './seller-service-card.mjs';

export const EXAMPLE_PROVIDER_IO_PROFILE='example-bounded-provider-v1';
export const EXAMPLE_PROVIDER_IO_LIMITS=Object.freeze({profile:EXAMPLE_PROVIDER_IO_PROFILE,workerRedisRequests:178,runtimeHealthRedisRequests:2,runtimeExecuteRedisRequests:40,combinedRedisRequests:220,workerConservativeRedisCommands:900,runtimeHealthConservativeRedisCommands:6,runtimeExecuteConservativeRedisCommands:94,combinedConservativeRedisCommands:1000,redisRequestBytes:65536,redisResponseBytes:65536,redisCombinedHeaderBytes:4096,mcpHttpRequests:20,mcpRequestBytes:8192,mcpResponseBytes:131072,mcpCombinedHeaderBytes:8192,providerHttpRequests:2,providerRequestBytes:512,providerResponseBytes:1024,providerCombinedHeaderBytes:8192,maximumStorageLedgerBytes:65536,maximumStorageLedgerEntries:340,rawApplicationPacketUpperBytes:32706560,conservativeTransferBytes:40*1048576});
const headerBytes=raw=>{let bytes=0;for(const [name,value]of new Headers(raw))bytes+=Buffer.byteLength(name+': '+value+'\r\n');return bytes;};
const keyPattern=/^[A-Za-z0-9_-]{43}$/;
export function exampleProviderIoEnabled(environment,config){
 if(environment.BAZAAR_EXAMPLE_PROVIDER_IO_PROFILE===undefined)return false;
 if(environment.BAZAAR_EXAMPLE_PROVIDER_IO_PROFILE!==EXAMPLE_PROVIDER_IO_PROFILE||!config||Buffer.byteLength(JSON.stringify(config))>8192||config.card?.id!=='bazaar-recovery-example-text-v1'||config.card?.routeTemplate!=='/v1/bazaar-recovery-example'||config.cardHash!==sellerHash(sellerCanonical(config.card))||!/^ow_[a-f0-9]{32}$/.test(config.ownerId??'')||!/^agent_[a-f0-9]{32}$/.test(config.agentId??'')||!keyPattern.test(config.agentAccess??'')||!keyPattern.test(config.providerAccess??'')||!keyPattern.test(environment.BAZAAR_HOSTED_SELLER_KEY??'')||!sameOrigins(config.allowedOrigins,config.card.url)||!/^[a-f0-9]{64}$/.test(environment.BAZAAR_HOSTED_SELLER_BINDING_HASH??''))throw Error('EXAMPLE_BOUNDED_PROVIDER_CONFIGURATION_REQUIRED');
 const key=Buffer.from(environment.BAZAAR_HOSTED_SELLER_KEY,'base64url');if(key.length!==32||key.toString('base64url')!==environment.BAZAAR_HOSTED_SELLER_KEY)throw Error('EXAMPLE_BOUNDED_PROVIDER_CONFIGURATION_REQUIRED');key.fill(0);return true;
}
function sameOrigins(origins,origin){return Array.isArray(origins)&&origins.length===1&&origins[0]===origin;}
export const EXAMPLE_BOUNDED_STORAGE_READ_LUA=SELLER_STORAGE_READ_LUA.replace('if string.len(raw)>1000000','if string.len(raw)>65536').replace('for id,entry in pairs(ledger.entries) do',"local entryCount=0\n for id,entry in pairs(ledger.entries) do\n  entryCount=entryCount+1;if entryCount>340 then return nil,-3 end");
if(EXAMPLE_BOUNDED_STORAGE_READ_LUA===SELLER_STORAGE_READ_LUA||!EXAMPLE_BOUNDED_STORAGE_READ_LUA.includes('entryCount>340'))throw Error('EXAMPLE_STORAGE_GUARD_REQUIRED');
const LEASE_READ_LUA="for i=1,#KEYS do\n if redis.call('GET',KEYS[i]) ~= ARGV[i] then return 0 end\nend\nreturn 1";
const LEASE_RELEASE_LUA="if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end\nreturn 0";
/** Includes EVAL itself and every bounded redis.call. Projection loops contain
 * no Redis calls. The write script has at most two held-lease GETs and ten
 * other calls including EVAL, regardless of whether its branches finish. */
export function exampleRedisCommandUpper(command){
 if(!Array.isArray(command))throw Error('EXAMPLE_PRIVATE_REDIS_COMMAND_REQUIRED');
 if(command[0]==='GET'||command[0]==='SET')return 1;
 if(command[0]!=='EVAL'||!Number.isInteger(command[2]))throw Error('EXAMPLE_PRIVATE_REDIS_SCRIPT_REQUIRED');
 if(command[1]===EXAMPLE_BOUNDED_STORAGE_READ_LUA&&command[2]===1)return 3;
 if(command[1]===LEASE_READ_LUA&&[1,2].includes(command[2]))return 1+command[2];
 if(command[1]===LEASE_RELEASE_LUA&&command[2]===1)return 3;
 if(command[1]===SELLER_STORAGE_WRITE_LUA&&[4,5].includes(command[2])&&command[3+command[2]]===command[2]-3)return 10+command[2]-3;
 throw Error('EXAMPLE_PRIVATE_REDIS_SCRIPT_REQUIRED');
}

/** These caps wrap the actual private transport, including both encrypted
 * stores. The worker can call health once and execute once: 178 + 2 + 40.
 * Oversized storage closes readiness before a new order can authorize payment.
 * No upstream request is repeated, and no root/Guion budget is modified. */
export function boundExampleProviderFetcher({environment,config,role,fetcher=fetch}){
 if(!['worker','runtime-health','runtime-execute'].includes(role)||typeof fetcher!=='function')throw Error('EXAMPLE_IO_ROLE_REQUIRED');
 const redis=new URL(environment.BAZAAR_HOSTED_SELLER_REDIS_REST_URL).origin,mcp=config.bazaarOrigin+'/api/mcp',provider=new URL(config.card.routeTemplate,config.card.url).href,health=provider+'/availability';
 const limits=EXAMPLE_PROVIDER_IO_LIMITS,maximumRedis=role==='worker'?limits.workerRedisRequests:role==='runtime-health'?limits.runtimeHealthRedisRequests:limits.runtimeExecuteRedisRequests,maximumCommands=role==='worker'?limits.workerConservativeRedisCommands:role==='runtime-health'?limits.runtimeHealthConservativeRedisCommands:limits.runtimeExecuteConservativeRedisCommands;
 let redisRequests=0,mcpRequests=0,providerRequests=0,requestBytes=0,responseBytes=0,combinedHeaders=0,conservativeRedisCommands=0;
 const snapshot=()=>({profile:EXAMPLE_PROVIDER_IO_PROFILE,role,redisRequests,mcpRequests,providerRequests,requestBytes,responseBytes,combinedHeaders,conservativeRedisCommands});
 const send=async(raw,init={})=>{
  const target=new URL(raw instanceof Request?raw.url:String(raw));let kind,maximumRequest,maximumResponse,maximumHeaders,body=init.body;
  if(target.origin===redis&&target.pathname==='/'&&!target.search&&!target.hash&&init.method==='POST'){
   kind='redis';if(++redisRequests>maximumRedis)throw Error('EXAMPLE_REDIS_REQUEST_BOUND');maximumRequest=limits.redisRequestBytes;maximumResponse=limits.redisResponseBytes;maximumHeaders=limits.redisCombinedHeaderBytes;
   if(typeof body!=='string')throw Error('EXAMPLE_REDIS_PACKET_REQUIRED');if(Buffer.byteLength(body)>maximumRequest)throw Error('EXAMPLE_PRIVATE_IO_REQUEST_TOO_LARGE');
   let command;try{command=JSON.parse(body);}catch{throw Error('EXAMPLE_REDIS_PACKET_REQUIRED');}
   if(command?.[0]==='EVAL'&&command[1]===SELLER_STORAGE_READ_LUA){command[1]=EXAMPLE_BOUNDED_STORAGE_READ_LUA;body=JSON.stringify(command);}
   conservativeRedisCommands+=exampleRedisCommandUpper(command);if(conservativeRedisCommands>maximumCommands)throw Error('EXAMPLE_PRIVATE_REDIS_COMMAND_BOUND');
  }else if(role==='worker'&&target.href===mcp&&['GET','POST','DELETE'].includes(init.method??'GET')){
   kind='mcp';if(++mcpRequests>limits.mcpHttpRequests)throw Error('EXAMPLE_MCP_HTTP_BOUND');maximumRequest=limits.mcpRequestBytes;maximumResponse=limits.mcpResponseBytes;maximumHeaders=limits.mcpCombinedHeaderBytes;
  }else if(role==='worker'&&(target.href===health&&init.method==='GET'||target.href===provider&&init.method==='POST')){
   kind='provider';if(++providerRequests>limits.providerHttpRequests)throw Error('EXAMPLE_PROVIDER_HTTP_BOUND');maximumRequest=limits.providerRequestBytes;maximumResponse=limits.providerResponseBytes;maximumHeaders=limits.providerCombinedHeaderBytes;
  }else throw Error('EXAMPLE_FIXED_PRIVATE_IO_ENDPOINT_REQUIRED');
  if(target.username||target.password||body!==undefined&&typeof body!=='string')throw Error('EXAMPLE_PRIVATE_IO_PACKET_REQUIRED');
  const outgoing=Buffer.byteLength(body??''),outgoingHeaders=headerBytes(init.headers);if(outgoing>maximumRequest||outgoingHeaders>maximumHeaders)throw Error('EXAMPLE_PRIVATE_IO_REQUEST_TOO_LARGE');
  requestBytes+=outgoing;
  const result=await fetcher(raw,{...init,body,redirect:'error'});
  if(result.redirected||result.url&&result.url!==target.href||result.status>=300&&result.status<400){await result.body?.cancel().catch(()=>{});throw Error('EXAMPLE_PRIVATE_IO_REDIRECT_DENIED');}
  const incomingHeaders=headerBytes(result.headers);if(outgoingHeaders+incomingHeaders>maximumHeaders){await result.body?.cancel().catch(()=>{});throw Error('EXAMPLE_PRIVATE_IO_HEADERS_TOO_LARGE');}combinedHeaders+=outgoingHeaders+incomingHeaders;
  const reader=result.body?.getReader(),parts=[];let size=0,timer;const deadline=Date.now()+5000;
  try{if(reader)for(;;){const remaining=deadline-Date.now();if(remaining<=0)throw Error('EXAMPLE_PRIVATE_IO_RESPONSE_TIMEOUT');const next=await Promise.race([reader.read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('EXAMPLE_PRIVATE_IO_RESPONSE_TIMEOUT')),remaining);})]);clearTimeout(timer);if(next.done)break;size+=next.value.byteLength;responseBytes+=next.value.byteLength;if(size>maximumResponse)throw Error('EXAMPLE_PRIVATE_IO_RESPONSE_TOO_LARGE');parts.push(Buffer.from(next.value));}}
  catch(error){reader?.cancel().catch(()=>{});throw error;}finally{clearTimeout(timer);reader?.releaseLock();}
  // All counts are conservative upper envelopes, not an upstream invoice.
  if(requestBytes+responseBytes+combinedHeaders>limits.conservativeTransferBytes)throw Error('EXAMPLE_PRIVATE_IO_TOTAL_BOUND');
  return new Response([204,205,304].includes(result.status)?null:Buffer.concat(parts),{status:result.status,headers:result.headers});
 };
 return {send,snapshot};
}
