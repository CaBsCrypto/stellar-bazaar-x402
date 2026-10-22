/** Isolated candidate. No HTTP route, credentials, environment flags, or default transport. */
import { createHash } from 'node:crypto';
import {decodeSuccessfulEnvelope,assertEnvelopeFeePolicy,pinFeeBumpSources} from './ledger-envelope.mjs';
import * as sdk from '@stellar/stellar-sdk';
import { assertPolicy, hashPolicy, toRouterIntent } from '../policy-router/fee-split-policy-v1.mjs';
export {sdk};
const { Address, StrKey, Networks, TransactionBuilder, FeeBumpTransaction, Keypair, xdr, nativeToScVal, scValToNative, hash } = sdk;
export const PROFILE = 'bazaar-split-exact-v1';
export const CHANNELS_TESTNET = 'https://channels.openzeppelin.com/testnet';
export const USDC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
export const TREASURY = 'GATWLYZ5KF4H4YEPBINI6DARECUCI5CIN5ZEOF7YN7XYJ22Z5TLRXZ2X';
const sha = value => createHash('sha256').update(value).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const need = (ok, code) => { if (!ok) throw new Error(code); };
const canonical = value => JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? v.toString() : v && !Array.isArray(v) && typeof v === 'object' && !Buffer.isBuffer(v) && !(v instanceof Uint8Array) ? Object.fromEntries(Object.entries(v).sort(([a],[b]) => a.localeCompare(b))) : v);
const same = (a,b) => canonical(a) === canonical(b);
const bytes32 = value => xdr.ScVal.scvBytes(Buffer.from(value, 'hex'));
const scalar = (value,type) => nativeToScVal(value,{type});
export const digest = value => sha(canonical(value));

export function validatePolicy(p, { nowSeconds, router, routerCodeHash } = {}) {
  assertPolicy(p,{nowSeconds});
  need(!['31c97193-be74-4b9d-b0a3-f3890b0a41e8','ed6c4530-e76f-49e0-8f39-5ec8578820e2'].includes(p.operationId),'LEGACY_OPERATION_EXCLUDED');
  need(p && typeof p === 'object' && !Array.isArray(p),'INVALID_POLICY');
  need(p.profile === PROFILE && p.version === 'bazaar.fee-split-policy/v1' && p.network === 'stellar:testnet','PROFILE_UNSUPPORTED');
  need(p.networkIdHash === sha(Networks.TESTNET) && p.asset === USDC && p.treasury === TREASURY,'NETWORK_ASSET_TREASURY_MISMATCH');
  need([p.payer,p.provider,p.treasury].every(a => typeof a === 'string' && StrKey.isValidEd25519PublicKey(a)) && new Set([p.payer,p.provider,p.treasury]).size === 3,'INVALID_ACCOUNTS');
  need(typeof p.router === 'string' && StrKey.isValidContract(p.router) && p.router !== p.asset && p.router === router && hex(p.routerCodeHash) && p.routerCodeHash === routerCodeHash,'ROUTER_NOT_PINNED');
  need(typeof p.operationId === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(p.operationId) && p.orderIdHash === sha(p.operationId) && hex(p.serviceCardHash) && hex(p.inputHash),'BINDING_MISMATCH');
  need(p.grossAtomic === '100000' && p.sellerNetAtomic === '98500' && p.feeAtomic === '1500' && p.feeBps === 150,'PILOT_ALLOCATION_MISMATCH');
  need(Number.isSafeInteger(nowSeconds) && Number.isSafeInteger(p.expiresAt) && p.expiresAt > nowSeconds && p.expiresAt <= nowSeconds + 300,'POLICY_EXPIRED');
  return true;
}

/** Canonical Soroban ABI shared with the isolated router candidate. */
export function intentScVal(p) {
  const entries = {
    asset: new Address(p.asset).toScVal(), payer: new Address(p.payer).toScVal(), provider: new Address(p.provider).toScVal(),
    treasury: new Address(p.treasury).toScVal(), router: new Address(p.router).toScVal(),
    gross: scalar(BigInt(p.grossAtomic),'i128'), fee_bps: scalar(p.feeBps,'u32'), network_id: bytes32(p.networkIdHash),
    order_id: bytes32(p.orderIdHash), card_hash: bytes32(p.serviceCardHash), input_hash: bytes32(p.inputHash), expires_at: scalar(BigInt(p.expiresAt),'u64'),
  };
  return xdr.ScVal.scvMap(Object.entries(entries).sort(([a],[b])=>a.localeCompare(b)).map(([key,val]) => new xdr.ScMapEntry({key:xdr.ScVal.scvSymbol(key),val})));
}
export function expectedCall(p) {
  return new xdr.InvokeContractArgs({contractAddress:new Address(p.router).toScAddress(),functionName:'split_payment',args:[intentScVal(p)]});
}
export function expectedFunc(p) { return xdr.HostFunction.hostFunctionTypeInvokeContract(expectedCall(p)).toXDR('base64'); }
function canonicalXdr(value,kind,maxBytes) {
  need(typeof value === 'string' && value.length <= Math.ceil(maxBytes/3)*4 && /^[A-Za-z0-9+/]+={0,2}$/.test(value),'XDR_INVALID');
  let parsed; try { parsed=kind.fromXDR(value,'base64'); } catch { throw new Error('XDR_INVALID'); }
  need(parsed.toXDR('base64') === value,'XDR_NONCANONICAL'); return parsed;
}
function transferInvocation(inv,p,destination,amount) {
  need(inv.function().switch().name === 'sorobanAuthorizedFunctionTypeContractFn' && inv.subInvocations().length === 0,'AUTH_TREE_MISMATCH');
  const fn=inv.function().contractFn(), args=fn.args();
  need(Address.fromScAddress(fn.contractAddress()).toString() === p.asset && fn.functionName().toString() === 'transfer' && args.length === 3,'AUTH_TREE_MISMATCH');
  need(args[0].switch().name === 'scvAddress' && args[1].switch().name === 'scvAddress' && args[2].switch().name === 'scvI128' && scValToNative(args[0]) === p.payer && scValToNative(args[1]) === destination && scValToNative(args[2]) === BigInt(amount),'AUTH_TREE_MISMATCH');
}
/** Only classic single-key Ed25519 payer credentials supported. Other account/auth modes fail closed. */
export function validateAuthorization(p, packet, context) {
  validatePolicy(p,context);
  need(packet && Object.keys(packet).sort().join(',') === 'auth,func' && Array.isArray(packet.auth) && packet.auth.length === 1,'PACKET_INVALID');
  const func=canonicalXdr(packet.func,xdr.HostFunction,16384);
  need(func.switch().name === 'hostFunctionTypeInvokeContract' && func.toXDR('base64') === expectedFunc(p),'FUNCTION_MISMATCH');
  const auth=canonicalXdr(packet.auth[0],xdr.SorobanAuthorizationEntry,24000), root=auth.rootInvocation();
  need(auth.credentials().switch().name === 'sorobanCredentialsAddress' && root.function().switch().name === 'sorobanAuthorizedFunctionTypeContractFn' && root.function().contractFn().toXDR('base64') === expectedCall(p).toXDR('base64'),'AUTH_ROOT_MISMATCH');
  const children=root.subInvocations(); need(children.length === 2,'AUTH_TREE_MISMATCH');
  transferInvocation(children[0],p,p.provider,p.sellerNetAtomic); transferInvocation(children[1],p,p.treasury,p.feeAtomic);
  const credential=auth.credentials().address();
  need(Address.fromScAddress(credential.address()).toString() === p.payer && credential.nonce().toBigInt() >= 0n,'AUTH_PAYER_MISMATCH');
  need(Number.isSafeInteger(context.currentLedger) && context.currentLedger > 0 && credential.signatureExpirationLedger() > context.currentLedger && credential.signatureExpirationLedger() <= context.currentLedger+15,'AUTH_LEDGER_EXPIRED');
  const sigs=scValToNative(credential.signature());
  need(Array.isArray(sigs) && sigs.length === 1 && sigs[0] && Object.keys(sigs[0]).sort().join(',') === 'public_key,signature' && sigs[0].public_key?.length === 32 && sigs[0].signature?.length === 64 && StrKey.encodeEd25519PublicKey(Buffer.from(sigs[0].public_key)) === p.payer,'AUTH_SIGNER_UNSUPPORTED');
  const preimage=xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(new xdr.HashIdPreimageSorobanAuthorization({networkId:hash(Buffer.from(Networks.TESTNET)),nonce:credential.nonce(),invocation:root,signatureExpirationLedger:credential.signatureExpirationLedger()}));
  need(Keypair.fromPublicKey(p.payer).verify(hash(preimage.toXDR()),Buffer.from(sigs[0].signature)),'AUTH_SIGNATURE_INVALID');
  return {packetHash:digest(packet),policyHash:hashPolicy(p),authorizationHash:sha(preimage.toXDR()),nonce:credential.nonce().toString()};
}

/** Ledger response must come from a separately trusted Testnet RPC reader, never Channels response fields. */
export function reconcileLedger(p, packet, transactionHash, evidence, { maximumFeeStroops, feeBump } = {}) {
  need(hex(transactionHash) && evidence && evidence.status === 'SUCCESS' && evidence.network === 'stellar:testnet' && evidence.transactionHash === transactionHash && Number.isSafeInteger(evidence.ledger) && evidence.ledger > 0,'LEDGER_UNCONFIRMED');
  need(typeof maximumFeeStroops === 'string' && /^[1-9][0-9]*$/.test(maximumFeeStroops),'FEE_CAP_REQUIRED');
  const decoded=decodeSuccessfulEnvelope(evidence.envelopeXdr,evidence.resultXdr,transactionHash);
  assertEnvelopeFeePolicy(decoded,{payer:p.payer,maximumFeeStroops,feeBump});
  const tx=decoded.transaction;
  need(tx.operations.length === 1 && tx.operations[0].type === 'invokeHostFunction','LEDGER_OPERATION_MISMATCH');
  const op=tx.operations[0]; need(op.func.toXDR('base64') === packet.func && op.auth?.length === 1 && op.auth[0].toXDR('base64') === packet.auth[0],'LEDGER_OPERATION_MISMATCH');
  const result=decoded.executionResult;
  // Derive raw events from the returned transaction metadata, and bind them to the op result hash.
  const meta=canonicalXdr(evidence.resultMetaXdr,xdr.TransactionMeta,131072);
  need([3,4].includes(meta.switch()) && meta.value().operations().length === 1 && meta.value().sorobanMeta(),'LEDGER_META_UNSUPPORTED');
  const events=meta.switch() === 3 ? meta.v3().sorobanMeta().events() : meta.v4().operations()[0].events();
  const returnValue=meta.value().sorobanMeta().returnValue();
  const expectedReturn=xdr.ScVal.scvVec([scalar(BigInt(p.sellerNetAtomic),'i128'),scalar(BigInt(p.feeAtomic),'i128')]);
  need(events.length === 3 && returnValue.toXDR('base64') === expectedReturn.toXDR('base64'),'LEDGER_EVENTS_MISMATCH');
  const opResults=result.result().results();
  need(opResults.length === 1 && opResults[0].switch().name === 'opInner' && opResults[0].tr().switch().name === 'invokeHostFunction' && opResults[0].tr().invokeHostFunctionResult().switch().name === 'invokeHostFunctionSuccess','LEDGER_RESULT_INVALID');
  const preimage=new xdr.InvokeHostFunctionSuccessPreImage({returnValue,events});
  need(opResults[0].tr().invokeHostFunctionResult().success().equals(hash(preimage.toXDR())),'LEDGER_EVENT_HASH_MISMATCH');
  const wanted=[
    {contract:p.asset,topics:['transfer',p.payer,p.provider,p.asset],value:BigInt(p.sellerNetAtomic)},
    {contract:p.asset,topics:['transfer',p.payer,p.treasury,p.asset],value:BigInt(p.feeAtomic)},
  ];
  // SAC token event's fourth topic is token_name (e.g. USDC:<issuer>), not the SAC address.
  const tokenName='USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  for(let i=0;i<2;i++) {
    const event=events[i],body=event.body().v0(),topics=body.topics();
    need(event.type().name === 'contract' && event.contractId()?.toString('hex') === new Address(wanted[i].contract).toBuffer().toString('hex') && topics.length === 4,'LEDGER_EVENTS_MISMATCH');
    need(same(topics.slice(0,3).map(scValToNative),wanted[i].topics.slice(0,3)) && ['scvString','scvSymbol'].includes(topics[3].switch().name) && scValToNative(topics[3]) === tokenName && body.data().switch().name === 'scvI128' && scValToNative(body.data()) === wanted[i].value,'LEDGER_EVENTS_MISMATCH');
  }
  const split=events[2],body=split.body().v0(),topics=body.topics(),data=body.data();
  const receipt=xdr.ScVal.scvMap([
    ['fee',scalar(BigInt(p.feeAtomic),'i128')],['intent',intentScVal(p)],['net',scalar(BigInt(p.sellerNetAtomic),'i128')],
  ].map(([key,val])=>new xdr.ScMapEntry({key:xdr.ScVal.scvSymbol(key),val})));
  need(split.type().name === 'contract' && split.contractId()?.toString('hex') === new Address(p.router).toBuffer().toString('hex') && topics.length === 2 && topics[0].switch().name === 'scvSymbol' && scValToNative(topics[0]) === 'split_v1' && topics[1].toXDR('base64') === bytes32(p.orderIdHash).toXDR('base64') && data.toXDR('base64') === receipt.toXDR('base64'),'LEDGER_SPLIT_BINDING_MISMATCH');
  return Object.freeze({version:'bazaar.fee-split-receipt/v1',profile:PROFILE,policyHash:hashPolicy(p),status:'SUCCESS',atomic:true,routerRetainedFunds:false,verifiedLedgerMeta:true,transactionHash,ledger:evidence.ledger,routerCodeHash:p.routerCodeHash,intent:toRouterIntent(p),transfers:[{from:p.payer,to:p.provider,asset:p.asset,amountAtomic:p.sellerNetAtomic},{from:p.payer,to:p.treasury,asset:p.asset,amountAtomic:p.feeAtomic}]});
}

/** Required journal: linearizable durable insert-if-absent and CAS transitions; no TTL/reset/retry path. */
export function createSplitAdapter({ enabled=false, journal, transport, rpc, context, maximumFeeStroops, feeBump } = {}) {
  const pinnedFeeBump=pinFeeBumpSources(feeBump);
  return Object.freeze({
    async submit({policy,packet}) {
      need(enabled === true,'SPLIT_DISABLED');
      need(journal && transport && rpc && typeof context === 'function','DEPENDENCIES_REQUIRED');
      const frozenPolicy=structuredClone(policy), frozenPacket=structuredClone(packet);
      const checked=validateAuthorization(frozenPolicy,frozenPacket,await context());
      const key=`${PROFILE}:${frozenPolicy.payer}:${frozenPolicy.orderIdHash}`;
      const record={version:PROFILE,key,policyHash:checked.policyHash,packetHash:checked.packetHash,authorizationHash:checked.authorizationHash,state:'dispatch-claimed'};
      // A lost acknowledgement of this durable claim MUST throw or return false. No dispatch either way.
      need(await journal.claim(key,record) === true,'SUBMIT_ALREADY_CLAIMED');
      let acknowledgement;
      try {
        validateAuthorization(frozenPolicy,frozenPacket,await context()); // immediately before one possible dispatch
        acknowledgement=await transport.submitSorobanTransaction(structuredClone(frozenPacket));
        need(acknowledgement && typeof acknowledgement.transactionId === 'string' && acknowledgement.transactionId.length > 0 && acknowledgement.transactionId.length <= 128 && hex(acknowledgement.hash),'CHANNELS_ACK_INVALID');
        need(await journal.transition(key,'dispatch-claimed',{state:'submitted-unconfirmed',transactionId:acknowledgement.transactionId,transactionHash:acknowledgement.hash}) === true,'ACK_WRITE_UNCONFIRMED');
      } catch {
        // Claim remains durable even if writing uncertainty itself fails. There is no resend API.
        try { await journal.transition(key,'dispatch-claimed',{state:'uncertain'}); } catch { /* retain claim */ }
        return {state:'uncertain',key};
      }
      try {
        const evidence=await rpc.transaction(acknowledgement.hash);
        const receipt=reconcileLedger(frozenPolicy,frozenPacket,acknowledgement.hash,evidence,{maximumFeeStroops,feeBump:pinnedFeeBump});
        need(await journal.transition(key,'submitted-unconfirmed',{state:'confirmed',receipt}) === true,'RECEIPT_WRITE_UNCONFIRMED');
        return {state:'confirmed',receipt};
      } catch { return {state:'submitted-unconfirmed',key,transactionHash:acknowledgement.hash}; }
    },
  });
}
