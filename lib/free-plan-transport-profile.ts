import {WorkspaceError} from './workspace-types.ts';
import {canonical} from './marketplace-identity.ts';

type Environment=Readonly<Record<string,string|undefined>>;
export const COMPACT_TRANSPORT_V2='compact-registry-v2';
export const COMPACT_TRANSPORT_V2_MARKET_MAX_BYTES=131072;
export const COMPACT_TRANSPORT_V2_ORDER_INPUT_MAX_BYTES=1024;
/** New admission only: callers must resolve existing intents before this guard.
 * The encoded input bound never rewrites an already reserved order or promise. */
export function assertCompactV2NewOrderInput(input:Record<string,unknown>,environment:Environment=process.env){
 if(compactTransportV2(environment)&&Buffer.byteLength(canonical(input),'utf8')>COMPACT_TRANSPORT_V2_ORDER_INPUT_MAX_BYTES)throw new WorkspaceError('ORDER_INPUT_TOO_LARGE',400);
}
/** A server-only opt-in. Existing data and completion promises are never
 * rewritten: activation must first prove their complete projected inventory. */
export function freePlanTransportProfile(environment:Environment=process.env){
 const profile=environment.BAZAAR_FREE_PLAN_TRANSPORT_PROFILE;
 if(profile===undefined)return undefined;
 if(!['compact-registry-v1',COMPACT_TRANSPORT_V2].includes(profile)||environment.BAZAAR_FREE_DEMO_MODE!=='continuous'||!['production','preview'].includes(environment.VERCEL_ENV??''))throw new WorkspaceError('FREE_PLAN_TRANSPORT_UNAVAILABLE',503);
 return profile;
}
export function compactTransportV2(environment:Environment=process.env){return freePlanTransportProfile(environment)===COMPACT_TRANSPORT_V2;}
export function marketTransportMaximum(environment:Environment=process.env){return compactTransportV2(environment)?COMPACT_TRANSPORT_V2_MARKET_MAX_BYTES:524288;}

export const READ_BOUNDED_MARKET_VALUE_LUA=`-- bazaar-bounded-market-read-v2
local value=redis.call('GET',KEYS[1])
if not value then return false end
local maximum=tonumber(ARGV[1])
if not maximum or maximum<1 or maximum%1~=0 or #value>maximum then return -26 end
return value`;
/** The key and maximum are selected by the native store, never HTTP input. */
export async function readMarketTransportValue(redis:{get(key:string):Promise<unknown>;eval(script:string,keys:string[],args:string[]):Promise<unknown>},key:string,maximum:number){
 if(!compactTransportV2())return redis.get(key);
 if(![131072,65536,512].includes(maximum)||!/^bazaar-market:pilot-[a-f0-9]{32}:(?:state|x402-settlements:state|capacity-reservations:v1|maintenance-index:v1)$/.test(key))throw new WorkspaceError('FREE_PLAN_TRANSPORT_UNAVAILABLE',503);
 const value=await redis.eval(READ_BOUNDED_MARKET_VALUE_LUA,[key],[String(maximum)]);
 if(value===-26)throw new WorkspaceError('FREE_PLAN_TRANSPORT_CAPACITY',503);
 if(value!==null&&(typeof value!=='string'||Buffer.byteLength(value)>maximum))throw new WorkspaceError('FREE_PLAN_TRANSPORT_UNAVAILABLE',503);
 return value;
}
