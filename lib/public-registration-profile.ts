import {AsyncLocalStorage} from 'node:async_hooks';
import {WorkspaceError} from './workspace-types.ts';
import type {OperationalRequestClass} from './operational-pressure.ts';

type Environment=Readonly<Record<string,string|undefined>>;
export const PUBLIC_STARTER_PROFILE='starter-v1';
const MiB=1048576;
/** Enrollment is deliberately not a promise to buy or publish. The existing
 * native order CAS must independently fund every future financial obligation.
 * The diagnostic/retained-history floors are retained, not released or spent. */
export const PUBLIC_STARTER_BUDGET=Object.freeze({
 version:PUBLIC_STARTER_PROFILE,maximumNewOwners:3,ownerControlCeiling:48,
 bootstrapCommands:160,bootstrapRedisWireBytes:3*MiB,
 httpAllowanceBytes:256*1024,
 sharedDiagnosticBytes:24*MiB,sharedHistoryBytes:2359296,
 futureControls:'just-in-time-global-predebit',futureControlCapacityPromised:false,
 activationReady:false,financialReady:false,completeLifecycleCertified:false,
});
export type StarterAction='registration';
const controls=new AsyncLocalStorage<{request:Request;action:StarterAction;bootstrapDebitConfirmed?:boolean;bootstrapDebitConsumed?:boolean}>();
export function publicStarterAction(){return controls.getStore()?.action;}
export function noteStarterBootstrapDebit(kind:OperationalRequestClass){const c=controls.getStore();if(c?.action==='registration'&&kind.bootstrapCreation)c.bootstrapDebitConfirmed=true;}
export function consumeStarterBootstrapDebit(){const c=controls.getStore();if(!c||c.action!=='registration'||!c.bootstrapDebitConfirmed||c.bootstrapDebitConsumed)throw new WorkspaceError('PUBLIC_STARTER_INGRESS_DEBIT_REQUIRED',503);c.bootstrapDebitConsumed=true;}
export function starterRegistrationMarker(ownerId:string){if(!/^ow_[a-f0-9]{32}$/.test(ownerId))throw new WorkspaceError('PUBLIC_STARTER_CONFIGURATION_INCOMPLETE',503);return 'starter-registration:'+ownerId;}
export function publicStarterProfile(environment:Environment=process.env){
 const value=environment.BAZAAR_PUBLIC_REGISTRATION_BUDGET_PROFILE;
 if(value===undefined)return undefined;
 let p;try{p=JSON.parse(environment.BAZAAR_PUBLIC_BUYER_ADMISSION_JSON??'null');}catch{}
 if(value!==PUBLIC_STARTER_PROFILE||p?.version!==2||p.resourceProfile!=='compact-registry-v2'||environment.BAZAAR_FREE_DEMO_MODE!=='continuous'||environment.BAZAAR_WORKSPACE_BACKEND!=='redis'||environment.BAZAAR_FREE_PLAN_TRANSPORT_PROFILE!=='compact-registry-v2'||environment.BAZAAR_PILOT_REVIEW_TRANSPORT!=='bounded-v1'||environment.VERCEL_ENV!=='production')throw new WorkspaceError('PUBLIC_STARTER_CONFIGURATION_INCOMPLETE',503);
 return PUBLIC_STARTER_BUDGET;
}
/** Only the outer measured native route installs this context. JSON arguments
 * cannot declare a class, owner, hold or budget credit. Legacy operation paths
 * are intentionally absent and retain their native recovery accounting. */
export async function starterActionForRequest(kind:OperationalRequestClass,request:Request|undefined){
 if(!publicStarterProfile()||!request)return undefined;
 const u=new URL(request.url);if(u.search||u.hash)return undefined;
 if(kind.bootstrapCreation&&request.method==='POST'&&u.pathname==='/api/workspaces')return 'registration' as const;
 if(request.method!=='POST'||u.pathname!=='/api/mcp')return undefined;
 const reader=request.clone().body?.getReader();if(!reader)return undefined;
 let size=0;const parts:Uint8Array[]=[];
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536){void reader.cancel();return undefined;}parts.push(part.value);}
  const body=JSON.parse(Buffer.concat(parts).toString('utf8'));
  if(body?.method!=='tools/call')return undefined;
  if(body.params?.name==='create_bazaar_workspace'&&kind.bootstrapCreation)return 'registration' as const;
 }catch{}finally{reader.releaseLock();}
 return undefined;
}
export function withPublicStarterAction<T>(request:Request|undefined,action:StarterAction|undefined,handler:()=>Promise<T>):Promise<T>{return request&&action?controls.run({request,action},handler):handler();}
export function starterEnrollmentForecast(ownerCount:number){
 const p=PUBLIC_STARTER_BUDGET;
 if(!Number.isSafeInteger(ownerCount)||ownerCount<1||ownerCount>p.maximumNewOwners)throw new WorkspaceError('PUBLIC_STARTER_OWNER_LIMIT',429,3600);
 const perOwnerBytes=p.bootstrapRedisWireBytes+p.httpAllowanceBytes;
 return Object.freeze({profile:p.version,ownerCount,perOwnerBytes,maximumTransferBytes:ownerCount*perOwnerBytes+p.sharedDiagnosticBytes+p.sharedHistoryBytes,maximumAuthenticatedCommands:ownerCount*p.bootstrapCommands,maximumRecoveryCommands:0,maximumBackgroundCommands:0,sharedDiagnosticBytes:p.sharedDiagnosticBytes,sharedHistoryBytes:p.sharedHistoryBytes,protectedHoldCreated:false,futureControlCapacityPromised:false,completeLifecycleCertified:false,financialReady:false});
}
