import {AsyncLocalStorage} from 'node:async_hooks';
import {compactTransportV2} from './free-plan-transport-profile.ts';
import {WorkspaceError} from './workspace-types.ts';
const scope=new AsyncLocalStorage<boolean>();
export const PILOT_REVIEW_MAX_BYTES=131072;
export const PILOT_REVIEW_READ_LUA=`-- bazaar-pilot-review-bounded-read-v1
local raw=redis.call('GET',KEYS[1])
if not raw then return false end
if #raw>131072 then return -26 end
return raw`;
/** Explicit server opt-in; does not change the normal 1-MiB review store. */
export function pilotReviewProfile(){const v=process.env.BAZAAR_PILOT_REVIEW_TRANSPORT;if(v===undefined)return false;if(v!=='bounded-v1'||!compactTransportV2())throw new WorkspaceError('PILOT_REVIEW_PROFILE_UNAVAILABLE',503);return true;}
export function withPilotReviewBudget<T>(enabled:boolean,run:()=>Promise<T>){return enabled?scope.run(true,run):run();}
export async function readPilotReview(redis:{get(key:string):Promise<unknown>;eval(script:string,keys:string[],args:string[]):Promise<unknown>},key:string){
 if(scope.getStore()!==true)return redis.get(key);
 if(!pilotReviewProfile()||key!==process.env.BAZAAR_REVIEW_PREFIX+':state'||!/^bazaar-review:pilot-[a-f0-9]{32}:state$/.test(key))throw new WorkspaceError('PILOT_REVIEW_PROFILE_UNAVAILABLE',503);
 const raw=await redis.eval(PILOT_REVIEW_READ_LUA,[key],[]);
 if(raw===-26)throw new WorkspaceError('PILOT_REVIEW_CAPACITY',503);
 if(raw!==null&&(typeof raw!=='string'||Buffer.byteLength(raw)>PILOT_REVIEW_MAX_BYTES))throw new WorkspaceError('PILOT_REVIEW_UNCONFIRMED',503);
 return raw;
}
