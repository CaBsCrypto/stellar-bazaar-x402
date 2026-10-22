import { assertPolicy, reconcileReceipt, hashPolicy } from '../policy-router/fee-split-policy-v1.mjs';
import { orderKey, validateHistoryRecord } from './private-history.mjs';

// Server-internal projection only. Call after the trusted RPC adapter has verified
// ledger XDR and CAS has persisted settlement; normalized receipt flags are not
// cryptographic proof and must NEVER be accepted from an HTTP/MCP client.
export function makeSettledHistoryRecord({ policy, verifiedReceipt, owners, phase, createdAt, delivery }) {
  assertPolicy(policy);
  const errors = reconcileReceipt(policy, verifiedReceipt);
  if (errors.length) throw Error('INVALID_SETTLED_HISTORY_RECEIPT:' + errors.join(','));
  if (!['paid', 'executing', 'execution-uncertain', 'delivered', 'delivery-failed'].includes(phase)) throw Error('INVALID_SETTLED_HISTORY_PHASE');
  const record = {
    version: 'bazaar.split-order/v1', profile: policy.profile, operationId: policy.operationId,
    key: orderKey(policy.operationId), network: policy.network, asset: policy.asset, treasury: policy.treasury,
    buyerOwnerId: owners.buyerOwnerId, sellerOwnerId: owners.sellerOwnerId, treasuryOwnerId: owners.treasuryOwnerId,
    phase, createdAt, grossAtomic: policy.grossAtomic, sellerNetAtomic: policy.sellerNetAtomic,
    feeAtomic: policy.feeAtomic, feeBps: policy.feeBps, policyHash: hashPolicy(policy),
    paymentProof: { status: 'confirmed', transactionHash: verifiedReceipt.transactionHash,
      ledger: verifiedReceipt.ledger, atomicAllocationsVerified: true },
    ...(delivery ? { delivery: { sha256: delivery.sha256 } } : {}),
  };
  return validateHistoryRecord(record);
}
