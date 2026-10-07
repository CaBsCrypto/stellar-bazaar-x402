import {resolve,dirname,basename} from 'node:path';
import {Keypair,Networks} from '@stellar/stellar-sdk';
import {basicNodeSigner} from '@stellar/stellar-sdk/contract';
import {createBuyerSpendBudget,buyerIdentity} from '../examples/marketplace-x402-buyer.mjs';
import {assertOpenExecutionGate,openAssert,openCanonical,openHash} from './open-acceptance-plan.mjs';

const hashPattern=/^[a-f0-9]{64}$/;
export function existingBuyerStoreDirectory(historicalPacketPath,ownerId,wallet){
  openAssert(basename(historicalPacketPath)==='workspace-v1.dpapi'&&/^ow_[a-f0-9]{32}$/.test(ownerId)&&/^G[A-Z2-7]{55}$/.test(wallet),'EXISTING_OWNER_STORE_BINDING_REQUIRED');
  return resolve(dirname(historicalPacketPath),'open-existing-buyer-'+openHash({ownerId,wallet}).slice(0,32));
}

/** One owner/wallet store across plans, including all old uncertain reservations.
 * The caller holds this deterministic store's common lock until close. No old
 * packet is written and no receipt is used to recreate available spending. */
export async function openExistingBuyerSpendLedger({store,storeDirectory,historicalPacketPath,plan,consent,loadBase}){
  const ownerId=plan.participants[1].ownerId,wallet=plan.participants[1].wallet;
  openAssert(resolve(storeDirectory)===existingBuyerStoreDirectory(historicalPacketPath,ownerId,wallet)&&typeof loadBase==='function','SINGLE_OWNER_LEDGER_DIRECTORY_REQUIRED');
  openAssert(consent.authorization==='OWNER_AUTHORIZED_TWO_NEW_TESTNET_PAYMENTS'&&consent.planHash===plan.planHash&&consent.sourceSha===plan.sourceSha&&consent.maximumPayments===2&&consent.totalAtomic==='200000'&&openCanonical(consent.operationIds)===openCanonical(plan.orders.map(o=>o.operationId)),'EXACT_EXISTING_OWNER_INCREASE_REQUIRED');
  const name='spend.'+openHash({ownerId,wallet}),release=await store.acquireLock(name);let stopped=false;
  try{
    const base=await loadBase();
    openAssert(hashPattern.test(base.sha256??'')&&Array.isArray(base.reservations)&&base.reservations.length===2&&base.reservations.every(r=>r.payer===wallet&&r.asset===buyerIdentity.sacContract&&r.amount==='100000')&&new Set(base.reservations.map(r=>r.operationId)).size===2,'ALL_HISTORICAL_RESERVATIONS_REQUIRED');
    const oldBudget=createBuyerSpendBudget({maximumAtomic:'200000',reservations:base.reservations,persistReservations:async()=>{throw Error('HISTORICAL_LEDGER_READ_ONLY');}});
    const baseHash=openHash(oldBudget.snapshot()),marker={planHash:plan.planHash,sourceSha:plan.sourceSha,consentHash:openHash(consent),increaseAtomic:'200000',operationIds:consent.operationIds};
    let state=await store.read(name);
    if(state===undefined){state={version:1,ownerId,wallet,basePacketHash:base.sha256,baseReservationsHash:baseHash,oldMaximumAtomic:'200000',maximumAtomic:'400000',increases:[marker],reservations:oldBudget.snapshot()};await store.write(name,state,{createOnly:true});}
    openAssert(state.version===1&&state.ownerId===ownerId&&state.wallet===wallet&&state.basePacketHash===base.sha256&&state.baseReservationsHash===baseHash&&state.oldMaximumAtomic==='200000'&&state.maximumAtomic==='400000'&&openCanonical(state.increases)===openCanonical([marker])&&openHash(state.reservations?.slice(0,base.reservations.length))===baseHash,'EXISTING_SPEND_LEDGER_CHANGED');
    openAssert(state.reservations.slice(2).every(r=>marker.operationIds.includes(r.operationId)),'UNAUTHORIZED_NEW_RESERVATION');
    const budget=createBuyerSpendBudget({maximumAtomic:state.maximumAtomic,reservations:state.reservations,persistReservations:async reservations=>{
      const current=await loadBase();openAssert(current.sha256===state.basePacketHash&&openHash(current.reservations)===baseHash,'HISTORICAL_PACKET_CHANGED');
      const durable=await store.read(name);openAssert(openCanonical(durable)===openCanonical(state),'OWNER_SPEND_LEDGER_CONCURRENT_CHANGE');
      openAssert(reservations.length===state.reservations.length+1&&openCanonical(reservations.slice(0,-1))===openCanonical(state.reservations)&&marker.operationIds.includes(reservations.at(-1).operationId),'SPEND_RESERVATIONS_MUST_ONLY_APPEND');
      const next={...state,reservations};await store.write(name,next);state=next;
    }});
    return {async reserve(value){openAssert(!stopped&&marker.operationIds.includes(value.operationId)&&value.payer===wallet,'FROZEN_NEW_OWNER_ORDER_REQUIRED');await budget.reserve(value);},
      snapshot:()=>({ownerId,wallet,maximumAtomic:state.maximumAtomic,reservations:budget.snapshot(),increaseHash:openHash(marker)}),
      async close(){if(!stopped){stopped=true;await release();}}};
  }catch(error){await release();throw error;}
}

/** No import-time effects, wallet reads or packet writes. Existing secrets are
 * loaded only after source/review/consent/deployment/root/catalog checks. */
export async function createExistingOpenPrivateRuntime({plan,authorization,controller,index,readOnly=false,ownerStore,ownerStoreDirectory,historicalPacketPath,loadHistoricalPacket,readHistoricalFileHash}){
  await assertOpenExecutionGate({plan,...authorization,readOnly});
  const publicState=controller.snapshot();
  if(!readOnly)openAssert(!publicState.uncertain&&publicState.rootTransports.some(t=>t.profile==='root:deployment'&&t.status==='ROOT_TRANSPORT_CAPTURE_VERIFIED')&&publicState.rootTransports.every(t=>t.status==='ROOT_TRANSPORT_CAPTURE_VERIFIED')&&publicState.hostedPreflight?.verified===true&&publicState.hostedPreflight.deploymentId===authorization.deployment.id,'ROOT_AND_CATALOG_CAPTURE_REQUIRED_BEFORE_WALLET');
  openAssert(index===0||index===1,'FROZEN_ORDER_INDEX_REQUIRED');
  const before=await readHistoricalFileHash();openAssert(hashPattern.test(before),'HISTORICAL_PACKET_HASH_REQUIRED');
  const packet=await loadHistoricalPacket();openAssert(await readHistoricalFileHash()===before,'HISTORICAL_PACKET_CHANGED');
  const sellerAccess=packet.identities?.[0]?.rotatedAgent,buyerAccess=packet.identities?.[1]?.agent;
  openAssert(packet.receipt?.[1]?.ownerId===plan.participants[1].ownerId&&packet.receipt?.[0]?.ownerId===plan.participants[0].ownerId&&packet.sale?.providerOrigin===plan.providerOrigin&&[sellerAccess,buyerAccess,packet.sale.worker].every(v=>/^[A-Za-z0-9_-]{43}$/.test(v??'')),'EXISTING_PARTICIPANT_ACCESS_REQUIRED');
  let ledger,key,releaseRecovery;
  try{
    if(readOnly)releaseRecovery=await ownerStore.acquireLock('spend.'+openHash({ownerId:plan.participants[1].ownerId,wallet:plan.participants[1].wallet}));
    if(!readOnly){ledger=await openExistingBuyerSpendLedger({store:ownerStore,storeDirectory:ownerStoreDirectory,historicalPacketPath,plan,consent:authorization.consent,
      loadBase:async()=>({sha256:await readHistoricalFileHash(),reservations:packet.x402.spendReservations})});
      key=Keypair.fromSecret(packet.sale.wallets[1].secret);openAssert(key.publicKey()===plan.participants[1].wallet,'EXISTING_FUNDED_WALLET_BINDING_REQUIRED');}
    const operationId=plan.orders[index].operationId;
    const buyer={journal:ownerStore.journal('buyer.'+operationId),options:{agentToken:buyerAccess,rpcUrl:'https://soroban-testnet.stellar.org',
      signer:readOnly?{address:plan.participants[1].wallet,signAuthEntry:async()=>{throw Error('READ_RECOVERY_SIGNING_FORBIDDEN');}}:{address:key.publicKey(),...basicNodeSigner(key,Networks.TESTNET)},
      reserveSpend:readOnly?async()=>{throw Error('READ_RECOVERY_SPENDING_FORBIDDEN');}:value=>ledger.reserve(value)}};
    return {buyer,seller:{agentAccess:sellerAccess,providerAccess:packet.sale.worker,providerProtectionAccess:packet.sale.providerBypass,journal:ownerStore.journal('seller.'+operationId)},
      async dispose(){key?._secretKey?.fill(0);if(packet.sale.wallets?.[1])delete packet.sale.wallets[1].secret;await ledger?.close();await releaseRecovery?.();}};
  }catch(error){key?._secretKey?.fill(0);await ledger?.close();await releaseRecovery?.();throw error;}
}
