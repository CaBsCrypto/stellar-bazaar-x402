import {AsyncLocalStorage} from 'node:async_hooks';
import type {PaymentPayload,PaymentRequirements,SettleResponse,VerifyResponse} from '@x402/core/types';
import {WorkspaceError} from './workspace-types.ts';
import {createPerOrderProductionPaymentTransports,readPerOrderProductionPaymentConfiguration,perOrderProductionPaymentsConfigured} from './per-order-production-payment.ts';
export {perOrderProductionPaymentsConfigured} from './per-order-production-payment.ts';

const original='31c97193-be74-4b9d-b0a3-f3890b0a41e8';
const operation=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
type Environment=Readonly<Record<string,string|undefined>>;
export type PerOrderPaymentSimulationDependencies={
 facilitator:{verify(payload:PaymentPayload,requirements:PaymentRequirements):Promise<VerifyResponse>;settle(payload:PaymentPayload,requirements:PaymentRequirements):Promise<SettleResponse>};
 rpc:{transaction(hash:string):Promise<{status:string;envelopeXdr?:string;resultXdr?:string;ledger?:number}>};
};
type Capability={active:boolean;kind:'simulation'|'production';operationId?:string;dependencies:PerOrderPaymentSimulationDependencies};
const simulations=new AsyncLocalStorage<Capability>();
const disabled=()=>new WorkspaceError('PER_ORDER_PAYMENTS_NOT_ENABLED',503);
function configured(value:PerOrderPaymentSimulationDependencies|undefined):value is PerOrderPaymentSimulationDependencies{return Boolean(value&&typeof value.facilitator?.verify==='function'&&typeof value.facilitator?.settle==='function'&&typeof value.rpc?.transaction==='function');}

/** The simulation capability is established by an offline test before it
 * emulates the production budget environment. Environment variables and request
 * arguments cannot establish this test-only capability. */
export async function withPerOrderX402Simulation<T>(dependencies:PerOrderPaymentSimulationDependencies,handler:()=>Promise<T>):Promise<T>{
 if(process.env.NODE_ENV!=='test'||process.env.VERCEL!==undefined||!configured(dependencies)||typeof handler!=='function'||simulations.getStore())throw disabled();
 const simulation:Capability={active:true,kind:'simulation',dependencies:Object.freeze({facilitator:dependencies.facilitator,rpc:dependencies.rpc})};
 try{return await simulations.run(simulation,handler);}finally{simulation.active=false;}
}
export function isPerOrderPaymentSimulation(operationId:string){return operationId!==original&&operation.test(operationId)&&simulations.getStore()?.active===true&&simulations.getStore()?.kind==='simulation';}
export function isPerOrderPaymentEnabled(operationId:string){
 if(operationId===original||!operation.test(operationId))return false;
 const capability=simulations.getStore();return capability?.active===true&&(capability.kind==='simulation'||capability.operationId===operationId&&perOrderProductionPaymentsConfigured());
}
export function perOrderPaymentCapabilityKind(operationId:string){return isPerOrderPaymentEnabled(operationId)?simulations.getStore()!.kind:undefined;}
/** A boolean-only budget selector. It exposes no operation, key or endpoint. */
export function hasPerOrderProductionPaymentCapability(){const capability=simulations.getStore();return capability?.kind==='production'&&capability.operationId!==undefined&&isPerOrderPaymentEnabled(capability.operationId);}
export function perOrderPaymentDependencies(operationId:string){if(!isPerOrderPaymentEnabled(operationId))throw disabled();return simulations.getStore()!.dependencies;}
export function assertPerOrderPaymentCapability(operationId:string,dependencies:PerOrderPaymentSimulationDependencies){
 const expected=perOrderPaymentDependencies(operationId);if(!configured(dependencies)||dependencies.facilitator!==expected.facilitator||dependencies.rpc!==expected.rpc)throw disabled();
}
/** Only this reviewed factory establishes a deployed capability. It accepts no
 * dependency, origin or credential supplied by the HTTP/MCP caller. A production
 * context belongs to one operation and is revoked when its callback finishes. */
export async function withPerOrderX402Production<T>(operationId:string,handler:()=>Promise<T>):Promise<T>{
 if(operationId===original||!operation.test(operationId)||typeof handler!=='function')throw disabled();
 const current=simulations.getStore();if(current?.active){if(current.kind==='production'&&isPerOrderPaymentEnabled(operationId))return handler();throw disabled();}
 const configuration=readPerOrderProductionPaymentConfiguration();if(!configuration)throw disabled();
 const transports=createPerOrderProductionPaymentTransports(configuration,{},()=>assertPerOrderPaymentCapability(operationId,dependencies));
 // Retained transport references are subject to the same operation, lifetime
 // and configuration checks as the state machine that originally received them.
 const dependencies:PerOrderPaymentSimulationDependencies=Object.freeze({
  facilitator:Object.freeze({verify:async(payload:PaymentPayload,requirements:PaymentRequirements)=>{assertPerOrderPaymentCapability(operationId,dependencies);return transports.facilitator.verify(payload,requirements);},settle:async(payload:PaymentPayload,requirements:PaymentRequirements)=>{assertPerOrderPaymentCapability(operationId,dependencies);return transports.facilitator.settle(payload,requirements);}}),
  rpc:Object.freeze({transaction:async(hash:string)=>{assertPerOrderPaymentCapability(operationId,dependencies);return transports.rpc.transaction(hash);}}),
 }),capability:Capability={active:true,kind:'production',operationId,dependencies};
 try{return await simulations.run(capability,handler);}finally{capability.active=false;}
}
export function perOrderPaymentSimulationDependencies(operationId:string){
 if(!isPerOrderPaymentSimulation(operationId))throw disabled();
 return simulations.getStore()!.dependencies;
}
export function assertPerOrderPaymentSimulation(operationId:string,dependencies:PerOrderPaymentSimulationDependencies){
 const expected=perOrderPaymentSimulationDependencies(operationId);
 if(!configured(dependencies)||dependencies.facilitator!==expected.facilitator||dependencies.rpc!==expected.rpc)throw disabled();
}
export function perOrderPaymentPreparationMetadata(environment:Environment=process.env){const mode=environment.BAZAAR_PER_ORDER_X402_MODE;return {version:'bazaar.per-order-x402-production-adapters/v1',protocol:'x402-stellar-exact-v2',network:'stellar:testnet',preparedForOfflineSimulation:true,productionAdaptersPrepared:true,productionPaymentsEnabled:perOrderProductionPaymentsConfigured(environment),activationMode:mode===undefined||mode==='disabled'?'disabled':mode==='stellar-testnet-v1'?mode:'invalid',providerProtocol:'bazaar.per-order-provider/v1',providerCompatibilityRequiredBeforePayment:true,environmentToggleCanEnablePayments:true,activationRequiresReviewedRelease:true,liveBudgetAndCapacityAdmissionRequired:true,originalOperationExcluded:true};}
