import {createHash} from 'node:crypto';
import {SPLIT_READ_PIPELINE_LIMITS} from '../../../split-ingress-policy.ts';
import {READ_ARGUMENT_BOUNDS,READ_MAXIMUM_OUTBOUND_BYTES,READ_MAXIMUM_INBOUND_BYTES} from '../../../split-read-wire-bounds.mjs';
export {READ_ARGUMENT_BOUNDS,READ_MAXIMUM_OUTBOUND_BYTES,READ_MAXIMUM_INBOUND_BYTES};
const MiB=1048576,hash=x=>createHash('sha256').update(x).digest('hex'),need=(v,c)=>{if(!v)throw Error(c);},actions=['context','terms','history'];
/** Source caps of native quota writers, at most one attempt each in continuous
 * mode. Sixfold encoding is used even though validated JSON normally needs2x.
 * The native hard middleware also enforces total commands, requests and wire.
 * Constants below are conservative proof inputs, not a provider measurement. */
// Exact descriptor sums for the native pipeline: initial native owner proof,
// budget debit, ingress read/maintenance/CAS, owner proof/quota CAS and final
// fresh registry authentication. History adds native permission identity and
// the two-row64KiB bounded index reader. Legacy responses are charged6x.
export const READ_CERTIFIED_CONFIGURATION=Object.freeze({backend:'redis',freeMode:'continuous',transport:'compact-registry-v2',operationalBudget:false,perRequestOwnerQuotaCharges:1,finalNativeRegistryProof:true,automaticRetries:0,financialActionsEnabled:false});
export const READ_CALL_PLAN=Object.freeze({context:2,terms:1,history:4});
export function readCostStages(){return actions.map(action=>{const hard=SPLIT_READ_PIPELINE_LIMITS[action];need(READ_MAXIMUM_OUTBOUND_BYTES+READ_MAXIMUM_INBOUND_BYTES[action]<=hard.wireBytes,'SPLIT_READ_BOUND_INSUFFICIENT');return {action,maxCalls:READ_CALL_PLAN[action],requests:hard.requests,commands:hard.commands,redisWireBytes:hard.wireBytes,httpAllowanceBytes:hard.httpAllowanceBytes,responseBytes:hard.responseBytes,externalRequests:0,maximumBytes:hard.wireBytes+hard.httpAllowanceBytes,sourceMaximumOutboundBytes:READ_MAXIMUM_OUTBOUND_BYTES,sourceMaximumInboundBytes:READ_MAXIMUM_INBOUND_BYTES[action]};});}
export const READ_COST_DIGEST=hash(JSON.stringify({configuration:READ_CERTIFIED_CONFIGURATION,arguments:READ_ARGUMENT_BOUNDS,stages:readCostStages()}));
/** Local/reviewer attestation only. It never substitutes for the native budget,
 * current provider usage, owner quota, seller acceptance or fee authority. */
export function createReadCostCertificate({sourceDigest,observedAtMs,expiresAtMs,evidenceDigests}={}){
 need(/^[a-f0-9]{64}$/.test(sourceDigest??'')&&Number.isSafeInteger(observedAtMs)&&observedAtMs>0&&Number.isSafeInteger(expiresAtMs)&&expiresAtMs>observedAtMs&&expiresAtMs-observedAtMs<=300000,'SPLIT_READ_CERTIFICATE_INVALID');
 need(evidenceDigests&&Object.keys(evidenceDigests).sort().join(',')==='context,history,terms'&&Object.values(evidenceDigests).every(v=>/^[a-f0-9]{64}$/.test(v)),'SPLIT_READ_EVIDENCE_REQUIRED');
 return {version:'bazaar.read-cost-certificate/v1',profile:'bazaar-split-exact-v1',mode:'source-bounded-offline',sourceDigest,costDigest:READ_COST_DIGEST,observedAtMs,expiresAtMs,configuration:READ_CERTIFIED_CONFIGURATION,stages:readCostStages().map(s=>({...s,evidenceDigest:evidenceDigests[s.action]})),safetyBytes:2*MiB,physicalUsageMeasured:false,financialExecutionCertified:false,productionAdmissionCertified:false};
}
export function validateReadCostCertificate(value,{sourceDigest,action,nowMs,configuration}={}){
 need(actions.includes(action),'FINANCIAL_EXECUTION_NOT_CERTIFIED');
 need(/^[a-f0-9]{64}$/.test(sourceDigest??'')&&value?.profile==='bazaar-split-exact-v1'&&value?.version==='bazaar.read-cost-certificate/v1'&&value.mode==='source-bounded-offline'&&value.sourceDigest===sourceDigest&&value.costDigest===READ_COST_DIGEST&&value.physicalUsageMeasured===false&&value.financialExecutionCertified===false&&value.productionAdmissionCertified===false,'SPLIT_READ_CERTIFICATE_INVALID');
 need(Number.isSafeInteger(nowMs)&&nowMs>0&&Number.isSafeInteger(value.observedAtMs)&&value.observedAtMs>0&&value.observedAtMs<=nowMs&&Number.isSafeInteger(value.expiresAtMs)&&value.expiresAtMs>nowMs&&value.expiresAtMs-value.observedAtMs<=300000&&value.expiresAtMs>value.observedAtMs,'SPLIT_READ_CERTIFICATE_STALE');
 need(JSON.stringify(configuration)===JSON.stringify(READ_CERTIFIED_CONFIGURATION)&&JSON.stringify(value.configuration)===JSON.stringify(READ_CERTIFIED_CONFIGURATION),'SPLIT_READ_CONFIGURATION_MISMATCH');
 need(Array.isArray(value.stages)&&value.stages.length===3&&value.safetyBytes===2*MiB,'SPLIT_READ_CERTIFICATE_INVALID');
 for(const expected of readCostStages()){const rows=value.stages.filter(s=>s.action===expected.action);need(rows.length===1&&Object.entries(expected).every(([k,v])=>rows[0][k]===v)&&/^[a-f0-9]{64}$/.test(rows[0].evidenceDigest??''),'SPLIT_READ_CERTIFICATE_INVALID');}
 return {structuralBoundsValid:true,physicalUsageMeasured:false,productionAdmissionCertified:false,financialExecutionCertified:false};
}
