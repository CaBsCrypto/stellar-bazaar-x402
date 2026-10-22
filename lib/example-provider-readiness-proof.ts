import {WorkspaceError} from './workspace-types.ts';

/** Reviewed server contract, deliberately independent of the provider bundle.
 * Tests compare this entire literal with its separately deployed transport.
 * Neither MCP arguments nor environment input can supply alternative limits. */
export const EXPECTED_EXAMPLE_PROVIDER_IO_LIMITS=Object.freeze({
 profile:'example-bounded-provider-v1',
 workerRedisRequests:178,runtimeHealthRedisRequests:2,runtimeExecuteRedisRequests:40,combinedRedisRequests:220,
 workerConservativeRedisCommands:900,runtimeHealthConservativeRedisCommands:6,runtimeExecuteConservativeRedisCommands:94,combinedConservativeRedisCommands:1000,
 redisRequestBytes:65536,redisResponseBytes:65536,redisCombinedHeaderBytes:4096,
 mcpHttpRequests:20,mcpRequestBytes:8192,mcpResponseBytes:131072,mcpCombinedHeaderBytes:8192,
 providerHttpRequests:2,providerRequestBytes:512,providerResponseBytes:1024,providerCombinedHeaderBytes:8192,
 maximumStorageLedgerBytes:65536,maximumStorageLedgerEntries:340,
 rawApplicationPacketUpperBytes:32706560,conservativeTransferBytes:40*1048576,
} as const);
export type ExampleProviderIoLimits=typeof EXPECTED_EXAMPLE_PROVIDER_IO_LIMITS;
const observationKeys=['profile','role','redisRequests','mcpRequests','providerRequests','requestBytes','responseBytes','combinedHeaders','conservativeRedisCommands'] as const;
function record(value:unknown):value is Record<string,unknown>{return Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)));}
/** Read data properties only. Diagnostic/test callers cannot execute accessors
 * or smuggle selectors through symbols or non-enumerable own properties. */
function data(value:Record<string,unknown>,key:string){const descriptor=Object.getOwnPropertyDescriptor(value,key);return descriptor?.enumerable&&'value' in descriptor?descriptor.value:undefined;}
function exactKeys(value:Record<string,unknown>,keys:readonly string[]){const own=Reflect.ownKeys(value);return own.length===keys.length&&own.every(key=>typeof key==='string'&&keys.includes(key)&&Boolean(Object.getOwnPropertyDescriptor(value,key)?.enumerable));}
export function isExactExampleProviderIoLimits(value:unknown):value is ExampleProviderIoLimits{
 if(!record(value)||!exactKeys(value,Object.keys(EXPECTED_EXAMPLE_PROVIDER_IO_LIMITS)))return false;
 return Object.entries(EXPECTED_EXAMPLE_PROVIDER_IO_LIMITS).every(([key,expected])=>data(value,key)===expected);
}
const failure=()=>new WorkspaceError('TEXT_SELLER_UNAVAILABLE',503,60);
export function assertExactExampleProviderIoLimits(value:unknown):asserts value is ExampleProviderIoLimits{if(!isExactExampleProviderIoLimits(value))throw failure();}
function validWorkerObservation(value:unknown){
 if(!record(value)||!exactKeys(value,observationKeys)||data(value,'profile')!==EXPECTED_EXAMPLE_PROVIDER_IO_LIMITS.profile||data(value,'role')!=='worker')return false;
 const counts=Object.fromEntries(observationKeys.filter(key=>key!=='profile'&&key!=='role').map(key=>[key,data(value,key)])) as Record<string,number>;
 if(Object.values(counts).some(count=>!Number.isSafeInteger(count)||count<0))return false;
 const limits=EXPECTED_EXAMPLE_PROVIDER_IO_LIMITS;
 return counts.redisRequests<=limits.workerRedisRequests&&counts.conservativeRedisCommands<=limits.workerConservativeRedisCommands&&counts.mcpRequests<=limits.mcpHttpRequests&&counts.providerRequests<=limits.providerHttpRequests&&counts.requestBytes+counts.responseBytes+counts.combinedHeaders<=limits.conservativeTransferBytes;
}
/** Only the already authenticated fixed example binding may use this check.
 * This validates a transport contract, not a payment or cryptographic receipt.
 * Readiness can perform a provider health HTTP request while executing zero
 * services; those two separate counters must not be conflated. */
export function assertExampleProviderReadinessProof(value:unknown):void{
 if(!record(value)||data(value,'reason')!=='ready'||data(value,'reportedCapacityReady')!==true||data(value,'executed')!==0||data(value,'providerRequests')!==0||data(value,'paymentSubmissions')!==0)throw failure();
 const io=data(value,'providerIo');if(!record(io)||!exactKeys(io,['limits','observed']))throw failure();
 assertExactExampleProviderIoLimits(data(io,'limits'));
 if(!validWorkerObservation(data(io,'observed')))throw failure();
}
