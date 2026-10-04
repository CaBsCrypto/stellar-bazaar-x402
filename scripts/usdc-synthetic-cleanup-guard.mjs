import {createHash} from 'node:crypto';

export const syntheticCleanupFunctionalChecks = ['magicLinkA','magicLinkB','lockClearsView','keyboard','mobile390','readsSameRecords','privacy'];
const requireValue = (condition, code) => { if (!condition) throw Error(code); };

/** Pure policy check. Existing effect, quota, uncertainty and replay guards remain required. */
export function assertCanRetireSynthetic({manifest, deployment, receiptBytes, completedPhases, workspaceReceipts}) {
  requireValue(manifest?.readiness?.canRetireSynthetic === true, 'SYNTHETIC_CLEANUP_GATE_CLOSED');
  requireValue(manifest.readiness.hostedBrowserPassed === false && manifest.readiness.canOpen === false && manifest.readiness.openingApproved !== true, 'SYNTHETIC_CLEANUP_IS_NOT_OPENING');
  requireValue(Array.isArray(completedPhases) && ['sale','replacement','pause'].every(phase => completedPhases.includes(phase)), 'SYNTHETIC_CLEANUP_CONFIRMED_PHASES_REQUIRED');
  requireValue(!completedPhases.includes('retire'), 'SYNTHETIC_CLEANUP_ALREADY_COMPLETED');
  requireValue(/^[a-f0-9]{40}$/.test(manifest.sourceSha ?? ''), 'SYNTHETIC_CLEANUP_SOURCE_REQUIRED');
  const replacement = manifest.deployments?.bazaarReplacement;
  requireValue(replacement && deployment?.id === replacement.id && /^dpl_[A-Za-z0-9]+$/.test(deployment.id), 'SYNTHETIC_CLEANUP_EXACT_REPLACEMENT_REQUIRED');
  requireValue(deployment.planId === manifest.planId && deployment.sourceSha === manifest.sourceSha && replacement.sourceSha === manifest.sourceSha, 'SYNTHETIC_CLEANUP_DEPLOYMENT_BINDING_REQUIRED');
  requireValue(deployment.readyState === 'READY' && deployment.target === 'preview', 'SYNTHETIC_CLEANUP_READY_PREVIEW_REQUIRED');
  requireValue(deployment.payloadFingerprint === manifest.uploads?.bazaar?.payloadFingerprint && replacement.payloadFingerprint === deployment.payloadFingerprint && /^[a-f0-9]{64}$/.test(deployment.payloadFingerprint ?? ''), 'SYNTHETIC_CLEANUP_PAYLOAD_BINDING_REQUIRED');
  let target, expectedTarget;
  try { target = new URL(deployment.url); expectedTarget = new URL(replacement.url); }
  catch { throw Error('SYNTHETIC_CLEANUP_ORIGIN_INVALID'); }
  requireValue(target.href === target.origin + '/' && expectedTarget.href === expectedTarget.origin + '/' && target.origin === expectedTarget.origin, 'SYNTHETIC_CLEANUP_EXACT_ORIGIN_REQUIRED');
  requireValue(/^https:\/\/stellar-bazaar-x402-[a-z0-9]+-cabscryptocontacto-6028s-projects\.vercel\.app$/.test(target.origin), 'SYNTHETIC_CLEANUP_AUTHORIZED_ORIGIN_REQUIRED');

  requireValue((Buffer.isBuffer(receiptBytes) || typeof receiptBytes === 'string') && Buffer.byteLength(receiptBytes) > 0 && Buffer.byteLength(receiptBytes) <= 65536, 'SYNTHETIC_CLEANUP_RECEIPT_BYTES_REQUIRED');
  requireValue(/^[a-f0-9]{64}$/.test(manifest.cleanupReceipt?.sha256 ?? ''), 'SYNTHETIC_CLEANUP_RECEIPT_HASH_REQUIRED');
  requireValue(createHash('sha256').update(receiptBytes).digest('hex') === manifest.cleanupReceipt.sha256, 'SYNTHETIC_CLEANUP_RECEIPT_HASH_MISMATCH');
  let receipt;
  try { receipt = JSON.parse(receiptBytes.toString('utf8').replace(/^\uFEFF/, '')); }
  catch { throw Error('SYNTHETIC_CLEANUP_RECEIPT_INVALID_JSON'); }
  requireValue(receipt && typeof receipt === 'object' && !Array.isArray(receipt) && receipt.version === 1, 'SYNTHETIC_CLEANUP_RECEIPT_VERSION_REQUIRED');
  requireValue(receipt.status === 'PASS_FUNCTIONAL_MANUAL_GATES_PENDING' && receipt.purpose === 'synthetic-cleanup-only', 'SYNTHETIC_CLEANUP_RECEIPT_SCOPE_REQUIRED');
  requireValue(receipt.planId === manifest.planId && receipt.sourceSha === manifest.sourceSha && receipt.deploymentId === deployment.id && receipt.origin === target.origin, 'SYNTHETIC_CLEANUP_RECEIPT_BINDING_REQUIRED');
  requireValue(syntheticCleanupFunctionalChecks.every(check => receipt.checks?.[check] === 'PASS'), 'SYNTHETIC_CLEANUP_FUNCTIONAL_EVIDENCE_REQUIRED');
  requireValue(receipt.manual?.nativeZoom200 === 'PENDING_MANUAL' && receipt.manual?.humanFreighter === 'PENDING_MANUAL', 'SYNTHETIC_CLEANUP_MANUAL_GATES_MUST_REMAIN_PENDING');
  requireValue(receipt.canOpen === false && receipt.hostedBrowserPassed === false, 'SYNTHETIC_CLEANUP_RECEIPT_IS_NOT_OPENING');
  requireValue(receipt.automaticRetries === 0 && receipt.expectedGeneration === 3, 'SYNTHETIC_CLEANUP_FROZEN_EXECUTION_REQUIRED');

  const seller = manifest.participants?.[0], buyer = manifest.participants?.[1];
  requireValue(seller?.role === 'seller' && buyer?.role === 'buyer' && [seller.ownerId,seller.workspaceId,buyer.ownerId,buyer.workspaceId].every(id => typeof id === 'string' && id.length > 0) && seller.ownerId !== buyer.ownerId, 'SYNTHETIC_CLEANUP_DISTINCT_OWNERS_REQUIRED');
  requireValue(Array.isArray(workspaceReceipts) && workspaceReceipts.length === 2 && workspaceReceipts[0]?.ownerId === seller.ownerId && workspaceReceipts[0]?.workspaceId === seller.workspaceId && workspaceReceipts[1]?.ownerId === buyer.ownerId && workspaceReceipts[1]?.workspaceId === buyer.workspaceId, 'SYNTHETIC_CLEANUP_PRESERVED_OWNER_BINDING_REQUIRED');
  requireValue([manifest.payloads?.serviceId,manifest.payloads?.submissionId].every(id => typeof id === 'string' && id.length > 0), 'SYNTHETIC_CLEANUP_FROZEN_SERVICE_REQUIRED');
  requireValue(receipt.serviceId === manifest.payloads?.serviceId && receipt.submissionId === manifest.payloads?.submissionId && receipt.sellerOwnerId === seller.ownerId && receipt.sellerWorkspaceId === seller.workspaceId && receipt.buyerOwnerId === buyer.ownerId && receipt.buyerWorkspaceId === buyer.workspaceId, 'SYNTHETIC_CLEANUP_EXACT_SCOPE_REQUIRED');
  const orderIds = manifest.payloads?.orders?.map(order => order.operationId);
  requireValue(Array.isArray(orderIds) && orderIds.length === 2 && orderIds.every(id => typeof id === 'string' && id.length > 0) && new Set(orderIds).size === 2 && Array.isArray(receipt.orderIds) && receipt.orderIds.length === 2 && orderIds.every((id,index) => id === receipt.orderIds[index]), 'SYNTHETIC_CLEANUP_PRESERVED_ORDERS_REQUIRED');
  return Object.freeze({purpose:'synthetic-cleanup-only',deploymentId:deployment.id,submissionId:receipt.submissionId,sellerOwnerId:seller.ownerId,sellerWorkspaceId:seller.workspaceId,buyerOwnerId:buyer.ownerId,expectedGeneration:3,maximumApiRequests:5,paymentRequests:0,providerRequests:0,openingApproved:false});
}
