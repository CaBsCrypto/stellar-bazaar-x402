import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertCanRetireSynthetic,syntheticCleanupFunctionalChecks} from './usdc-synthetic-cleanup-guard.mjs';

function fixture() {
  const deployment={planId:'public-cleanup-double',sourceSha:'a'.repeat(40),payloadFingerprint:'b'.repeat(64),id:'dpl_publicreplacement',url:'https://stellar-bazaar-x402-public000-cabscryptocontacto-6028s-projects.vercel.app',readyState:'READY',target:'preview',protectionEnabled:null};
  const manifest={planId:deployment.planId,sourceSha:deployment.sourceSha,uploads:{bazaar:{payloadFingerprint:deployment.payloadFingerprint}},readiness:{canRetireSynthetic:true,hostedBrowserPassed:false,canOpen:false,openingApproved:false},deployments:{bazaarReplacement:structuredClone(deployment)},participants:[{role:'seller',ownerId:'owner-A',workspaceId:'workspace-A'},{role:'buyer',ownerId:'owner-B',workspaceId:'workspace-B'}],payloads:{serviceId:'guionista-algorithmic-text-pilot',submissionId:'public-submission',orders:[{operationId:'public-order-1'},{operationId:'public-order-2'}]}};
  const receipt={version:1,purpose:'synthetic-cleanup-only',status:'PASS_FUNCTIONAL_MANUAL_GATES_PENDING',planId:manifest.planId,sourceSha:manifest.sourceSha,deploymentId:deployment.id,origin:deployment.url,checks:Object.fromEntries(syntheticCleanupFunctionalChecks.map(key=>[key,'PASS'])),manual:{nativeZoom200:'PENDING_MANUAL',humanFreighter:'PENDING_MANUAL'},canOpen:false,hostedBrowserPassed:false,automaticRetries:0,expectedGeneration:3,serviceId:manifest.payloads.serviceId,submissionId:manifest.payloads.submissionId,sellerOwnerId:'owner-A',sellerWorkspaceId:'workspace-A',buyerOwnerId:'owner-B',buyerWorkspaceId:'workspace-B',orderIds:['public-order-1','public-order-2']};
  const workspaceReceipts=manifest.participants.map(({ownerId,workspaceId})=>({ownerId,workspaceId}));
  const value={manifest,deployment,receipt,workspaceReceipts,completedPhases:['probe','submit','activate','sale','replacement','pause']};
  value.freeze=()=>{value.receiptBytes=Buffer.from(JSON.stringify(value.receipt,null,2)+'\n');value.manifest.cleanupReceipt={sha256:createHash('sha256').update(value.receiptBytes).digest('hex')};};
  value.freeze();return value;
}

const allowed=fixture(),scope=assertCanRetireSynthetic(allowed);
assert.equal(scope.maximumApiRequests,5);assert.equal(scope.paymentRequests,0);assert.equal(scope.providerRequests,0);assert.equal(scope.openingApproved,false);assert.equal(scope.sellerWorkspaceId,'workspace-A');assert.equal(scope.buyerOwnerId,'owner-B');assert.equal(Object.isFrozen(scope),true);
assert.equal(allowed.manifest.readiness.hostedBrowserPassed,false);assert.equal(allowed.manifest.readiness.canOpen,false);assert.equal(allowed.receipt.manual.nativeZoom200,'PENDING_MANUAL');

function reject(mutate,{rebind=true,pattern=/SYNTHETIC_CLEANUP_/}={}) {
  const value=fixture();mutate(value);if(rebind)value.freeze();let dispatches=0;
  assert.throws(()=>{assertCanRetireSynthetic(value);dispatches++;},pattern);assert.equal(dispatches,0);
}
reject(value=>{value.manifest.readiness.canRetireSynthetic=false;});
reject(value=>{value.manifest.readiness.canOpen=true;});
reject(value=>{value.manifest.readiness.hostedBrowserPassed=true;});
reject(value=>{value.manifest.readiness.openingApproved=true;});
for(const phase of ['sale','replacement','pause'])reject(value=>{value.completedPhases=value.completedPhases.filter(item=>item!==phase);});
reject(value=>{value.completedPhases.push('retire');});
reject(value=>{value.deployment.id='dpl_different';});
reject(value=>{value.deployment.sourceSha='c'.repeat(40);});
reject(value=>{value.deployment.target='production';});
reject(value=>{value.deployment.url='https://different.example';});
reject(value=>{value.deployment.payloadFingerprint='d'.repeat(64);});
reject(value=>{value.receipt.sourceSha='e'.repeat(40);});
reject(value=>{value.receipt.planId='different-plan';});
reject(value=>{value.receipt.deploymentId='dpl_different';});
reject(value=>{value.receipt.origin='https://different.example';});
reject(value=>{value.receipt.purpose='opening';});
reject(value=>{value.receipt.status='PASS_BROWSER';});
for(const check of syntheticCleanupFunctionalChecks)reject(value=>{value.receipt.checks[check]='PENDING';});
for(const manual of ['nativeZoom200','humanFreighter'])reject(value=>{value.receipt.manual[manual]='PASS';});
reject(value=>{value.receipt.canOpen=true;});
reject(value=>{value.receipt.hostedBrowserPassed=true;});
reject(value=>{value.receipt.automaticRetries=1;});
reject(value=>{value.receipt.expectedGeneration=4;});
reject(value=>{value.receipt.sellerWorkspaceId='workspace-B';});
reject(value=>{value.receipt.submissionId='another-service';});
reject(value=>{delete value.manifest.payloads.submissionId;delete value.receipt.submissionId;});
reject(value=>{value.workspaceReceipts.reverse();});
reject(value=>{value.receipt.orderIds.reverse();});
reject(value=>{value.receipt.orderIds=['public-order-1','public-order-1'];});
reject(value=>{value.receiptBytes=Buffer.concat([value.receiptBytes,Buffer.from(' ')]);},{rebind:false,pattern:/RECEIPT_HASH_MISMATCH/});
reject(value=>{value.manifest.cleanupReceipt.sha256='f'.repeat(64);},{rebind:false,pattern:/RECEIPT_HASH_MISMATCH/});
reject(value=>{value.receiptBytes=Buffer.alloc(65537);},{rebind:false,pattern:/RECEIPT_BYTES_REQUIRED/});
console.log(JSON.stringify({status:'PASS',manualPendingPermitsCleanupOnly:true,receiptBytesAndDeploymentBound:true,phaseScopeOwnerAndOrderChecks:true,openingFlagsRemainFalse:true,invalidGateDispatches:0,networkRequests:0,secretReads:0}));
