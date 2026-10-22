import {readCostStages} from './read-cost-certificate.mjs';
import {splitWorkloadEnvelope,splitIngress} from '../../../split-ingress-policy.ts';
/** Bounded pilot sequence, including two recovery observations and four private
 * history reads. These are enforcement ceilings, never measured consumption.
 * If the HTTP ceilings change, this calculation and its digest change too. */
export const SPLIT_FLOW_PLAN=Object.freeze({context:2,terms:1,history:4,create:1,capacity:1,read:6,challenge:1,settle:1,reconcile:2,'delivery-read':1,'delivery-write':1});
const MiB=1048576;
let bytes=0,commands=0;const stages=[];
for(const [action,count] of Object.entries(SPLIT_FLOW_PLAN)){
 const e=splitWorkloadEnvelope('split-'+action);if(!e)throw Error('NATIVE_SPLIT_FLOW_ENVELOPE_MISSING');
 const path=action==='context'||action==='terms'||action==='history'?action:action==='capacity'?'seller-capacity':action==='create'?'orders':action==='read'?'orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa':action.startsWith('delivery-')?'orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/delivery':'orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/'+action;
 const method=['context','terms','history','read','delivery-read'].includes(action)?'GET':'POST',ingress=splitIngress('/api/market/split-v1/'+path,method);if(!ingress)throw Error('NATIVE_SPLIT_FLOW_ENVELOPE_MISSING');
 // continuousFreeReservation returns control.wireBytes + its HTTP allowance,
 // NOT inbound+outbound operational ceilings. Use the larger 768-KiB HTTP
 // allowance, then add independently bounded RPC/provider traffic once.
 const certifiedRead=readCostStages().find(s=>s.action===action);
 const maximumBytes=certifiedRead?certifiedRead.maximumBytes:ingress.control.wireBytes+786432+e.externalOutboundBytes+e.externalInboundBytes,maximumCommands=ingress.control.commands;
 stages.push(Object.freeze({action,maxCalls:count,maximumBytes,maximumCommands}));bytes+=count*maximumBytes;commands+=count*maximumCommands;
}
// Two bounded background/maintenance passes are additional; no renewal is
// automatically performed. Keep two MiB of protected safety after every call.
export const SPLIT_COST_BOUND=Object.freeze({version:'bazaar.split-cost-bound/v3',flowPlan:SPLIT_FLOW_PLAN,transferBytes:Math.ceil((bytes+16*MiB)/MiB)*MiB,recoveryCommands:Math.ceil((commands+2048)/1024)*1024,backgroundCommands:8192,safetyBytes:2*MiB,storageBytesPerOrder:262144,ledgerReservedBytes:2*MiB,maximumOrders:128});
export const SPLIT_STAGE_BOUNDS=Object.freeze(stages);


// Only these stages have a native executable read pipeline in this release.
// Every financial stage remains blocked regardless of the planning envelope.
export const SPLIT_EXECUTABLE_STAGES=Object.freeze(['context','terms','history']);
