import {finitePilotProfile,FINITE_WORKSPACE_COMMANDS} from './finite-pilot-budget.ts';
import {PILOT_WORKSPACE_WIRE_BYTES,workspaceMaintenanceProfile} from './pilot-maintenance-profile.ts';
import {AsyncLocalStorage} from 'node:async_hooks';
import type {Redis} from '@upstash/redis';
import {nativeRedisDescriptor} from './catalog-budget.ts';
import {workspaceRegistryTransportMaximum} from './quota-registry-patch.ts';
import {compactTransportV2} from './free-plan-transport-profile.ts';
import {WorkspaceError} from './workspace-types.ts';

export const COMPACT_GUARDIAN_BUDGET=Object.freeze({commands:1100,wireBytes:8*1048576,httpAllowanceBytes:262144,workspaces:1,reconciliations:1,expiredOrders:1});
type Context={commands:number,allocatedBytes:number,requests:number,failed:boolean;wireLimit:number;commandLimit:number};
const scope=new AsyncLocalStorage<Context>();
const failure=()=>new WorkspaceError('GUARDIAN_TRANSPORT_BUDGET',503,60);
export function compactGuardianBudgetEnabled(){return process.env.BAZAAR_FREE_DEMO_MODE==='continuous'&&compactTransportV2();}
/** Native full-pass boundary only. Request parameters cannot select this scope. */
export async function withCompactGuardianBudget<T>(handler:()=>Promise<T>):Promise<T>{
 if(!compactGuardianBudgetEnabled())return handler();
 if(scope.getStore())return handler();
 return scope.run({commands:0,allocatedBytes:0,requests:0,failed:false,wireLimit:COMPACT_GUARDIAN_BUDGET.wireBytes,commandLimit:COMPACT_GUARDIAN_BUDGET.commands},async()=>{try{return await handler();}catch(e){scope.getStore()!.failed=true;throw e;}});
}
/** Text wakes retain their own independent debit and transport scopes.
 * Reconciliation stays inside the maintenance allowance. */
export function outsideGuardianBudget<T>(handler:()=>Promise<T>):Promise<T>{return scope.exit(handler);}
export function guardianBudgetObservation(){const c=scope.getStore();return c?{...c,commandLimit:c.commandLimit,wireLimit:c.wireLimit}:undefined;}
type Middleware=Parameters<Redis['use']>[0];
export async function guardianRedisRequest(request:Parameters<Middleware>[0],next:Parameters<Middleware>[1]){
 const c=scope.getStore();if(!c)return next(request);if(c.failed)throw failure();
 try{
  const d=await nativeRedisDescriptor(request.body),outbound=Buffer.byteLength(JSON.stringify(request.body));
  if(d.registryMaximumBytes!==undefined&&d.registryMaximumBytes!==workspaceRegistryTransportMaximum()||c.commands+d.commands>c.commandLimit||c.allocatedBytes+outbound+d.responseBytes>c.wireLimit)throw failure();
  c.commands+=d.commands;c.allocatedBytes+=outbound+d.responseBytes;c.requests++;
  const result=await next(request);
  if(Buffer.byteLength(JSON.stringify(result)??'')>d.responseBytes||result&&typeof result==='object'&&'error' in result&&result.error)throw failure();
  return result;
 }catch{c.failed=true;throw failure();}
}
const wrapped=new WeakSet<object>();
export function guardianBudgetRedis(redis:Redis):Redis{if(!wrapped.has(redis)){wrapped.add(redis);redis.use(guardianRedisRequest);}return redis;}

/** Narrow only an already authenticated maintenance scope. Never reset its
 * counters or use this scope for reconciliation, delivery or bootstrap. */
export async function withWorkspaceMaintenanceBudget<T>(handler:()=>Promise<T>):Promise<T>{
 const c=scope.getStore();if(!c||!workspaceMaintenanceProfile()||c.failed||c.allocatedBytes>PILOT_WORKSPACE_WIRE_BYTES)throw failure();
 const previous=c.wireLimit,previousCommands=c.commandLimit;c.wireLimit=PILOT_WORKSPACE_WIRE_BYTES;if(finitePilotProfile()){if(c.commands>FINITE_WORKSPACE_COMMANDS)throw failure();c.commandLimit=FINITE_WORKSPACE_COMMANDS;}
 try{return await handler();}catch(e){c.failed=true;throw e;}finally{c.wireLimit=previous;c.commandLimit=previousCommands;}
}
