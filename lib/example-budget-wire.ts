import {AsyncLocalStorage} from 'node:async_hooks';
import {meteredFiniteGuardianRedis} from './guardian-finite-budget.ts';
import type {Redis} from '@upstash/redis';
import {WorkspaceError} from './workspace-types.ts';
import {exampleBudgetCommandWeight} from './example-budget-command-weight.ts';
import {exampleBudgetRedisResponseAllocation} from './example-budget-response-allocation.ts';
import {validateContinuousExampleBudgetProof,continuousExampleBudgetWireLimits,type ContinuousExampleBudgetProof,type ContinuousExampleWireContext} from './continuous-free-budget.ts';

type Observation={redisRequests:number;redisCommands:number;unsupportedCommand:boolean;outboundUpperBytes:number;inboundUpperBytes:number;pendingInboundUpperBytes:number;uncertain:boolean;proof?:ContinuousExampleBudgetProof;kind?:ContinuousExampleWireContext};
const scope=new AsyncLocalStorage<Observation>();
type Middleware=Parameters<Redis['use']>[0];
type TransportRequest=Parameters<Middleware>[0];
type TransportNext=Parameters<Middleware>[1];
const failed=()=>new WorkspaceError('EXAMPLE_TEXT_WIRE_CAPACITY',503,60);
/** Native clients use Upstash's base64 response encoding. The middleware sees
 * decoded UTF-8 results; reconstruct both documented encodings conservatively
 * instead of counting every decoded snapshot twice. Values never leave scope. */
export function exampleBudgetRedisResponseUpperBytes(response:unknown){
 const encode=(value:unknown):unknown=>typeof value==='string'?Buffer.from(value,'utf8').toString('base64'):Array.isArray(value)?value.map(encode):value;
 const plain=JSON.stringify(response);
 if(typeof plain!=='string')throw failed();
 const encoded=response&&typeof response==='object'&&!Array.isArray(response)&&'result' in response?JSON.stringify({...response,result:encode(response.result)}):plain;
 return Math.max(Buffer.byteLength(plain),Buffer.byteLength(encoded))+4096;
}
function bounds(counts:Observation){
 if(!counts.proof)return;
 const limits=continuousExampleBudgetWireLimits(counts.proof,counts.kind);
 if(counts.unsupportedCommand||counts.redisRequests>limits.maximumRedisRequests||counts.redisCommands>limits.maximumRedisCommands||counts.outboundUpperBytes>limits.maximumOutboundBytes||counts.inboundUpperBytes+counts.pendingInboundUpperBytes>limits.maximumInboundBytes||counts.outboundUpperBytes+counts.inboundUpperBytes+counts.pendingInboundUpperBytes>limits.maximumCombinedBytes)throw failed();
}
/** Passive counting starts before authentication. A server-minted proof alone
 * activates lower bounds. No argument, header or JSON object can enable them. */
export async function withExampleBudgetWireScope<T>(action:()=>T|Promise<T>,options:{fresh?:boolean}={}):Promise<T>{
 if(scope.getStore()&&!options.fresh||process.env.BAZAAR_FREE_DEMO_MODE!=='continuous')return action();
 return scope.run({redisRequests:0,redisCommands:0,unsupportedCommand:false,outboundUpperBytes:0,inboundUpperBytes:0,pendingInboundUpperBytes:0,uncertain:false},action);
}
export function activateExampleBudgetWireProof(proof:ContinuousExampleBudgetProof|undefined,kind?:ContinuousExampleWireContext){
 if(!proof)return;
 validateContinuousExampleBudgetProof(proof);const counts=scope.getStore();
 // Direct background work gets its own explicit scope at its caller. A proof
 // without the transport guard cannot receive an optimized request price.
 if(!counts)throw new WorkspaceError('EXAMPLE_TEXT_WIRE_SCOPE_REQUIRED',503);
 counts.proof=proof;counts.kind=kind;bounds(counts);
}
export function currentExampleBudgetWireObservation(){
 const counts=scope.getStore();return counts?{redisRequests:counts.redisRequests,redisCommandsUpper:counts.redisCommands,unsupportedCommand:counts.unsupportedCommand,outboundUpperBytes:counts.outboundUpperBytes,inboundUpperBytes:counts.inboundUpperBytes,uncertain:counts.uncertain,protectedProfile:counts.proof?.version??null}:undefined;
}
async function transport(request:TransportRequest,next:TransportNext){
 const counts=scope.getStore();if(!counts)return next(request);
 const body=JSON.stringify(request.body);if(typeof body!=='string')throw failed();
 try{counts.redisCommands+=exampleBudgetCommandWeight(request.body);}catch{counts.unsupportedCommand=true;}
 counts.redisRequests++;counts.outboundUpperBytes+=Buffer.byteLength(body)+4096;
 bounds(counts); // Before another Redis action, including native CAS writes.
 // The exact script catalog distinguishes bounded snapshot reads from scalar
 // CAS acknowledgments. Allocate the next response BEFORE issuing Redis;
 // unknown GET keys retain the widest previously reviewed response bound.
 const maximumResponseBytes=counts.proof?exampleBudgetRedisResponseAllocation(request.body):4*1048576+8192;
 if(counts.proof)bounds({...counts,pendingInboundUpperBytes:counts.pendingInboundUpperBytes+maximumResponseBytes});
 counts.pendingInboundUpperBytes+=maximumResponseBytes;let pending=true;
 try{
  const response=await next(request);
  const responseBytes=exampleBudgetRedisResponseUpperBytes(response);
  counts.pendingInboundUpperBytes-=maximumResponseBytes;pending=false;
  counts.inboundUpperBytes+=responseBytes;
  if(counts.proof&&responseBytes>maximumResponseBytes)throw failed();
  bounds(counts);
  return response;
 }catch(error){counts.uncertain=true;throw error;}
 finally{if(pending)counts.pendingInboundUpperBytes-=maximumResponseBytes;}
}
const hooked=new WeakSet<object>();
export function meteredExampleBudgetRedis(redis:Redis):Redis{
 meteredFiniteGuardianRedis(redis);
 if(!hooked.has(redis)){redis.use(transport);hooked.add(redis);}return redis;
}
