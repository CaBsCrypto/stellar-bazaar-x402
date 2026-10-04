import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Asset,Networks} from '@stellar/stellar-sdk';
import {assertProvisionRecovery} from './reconcile-usdc-counters.mjs';

// Public receipts only: no network, auth packet, DPAPI, transaction signing or mutation.
const directory='docs/evidence/sprint-marketplace';
const json=async name=>JSON.parse((await readFile(directory+'/'+name+'.json','utf8')).replace(/^\uFEFF/,''));
const [manifest,driver,receipt,provision,snapshotBytes]=await Promise.all([json('usdc-sale-manifest'),json('usdc-hosted-http'),json('usdc-sale-receipt'),json('usdc-wallet-provision'),readFile(directory+'/usdc-wallet-provision-before-recovery.json')]);
for(const value of [driver,receipt,provision]){assert.equal(value.planId,manifest.planId);assert.equal(value.sourceSha,manifest.sourceSha);}
assert.equal(provision.status,'PASS_PROVISIONED');assertProvisionRecovery(manifest,provision,snapshotBytes);
assert.equal(driver.status,'PASS_EXECUTED_PHASES');assert.equal(driver.automaticRetries,0);assert.equal(driver.facilitatorRequests,0);assert.ok(driver.attempts.every(value=>value.status==='CONFIRMED'));
assert.equal(receipt.status,'PASS_CONFIRMED_SALE_RECEIPT');assert.ok(receipt.completedPhases.includes('sale'));assert.equal(receipt.externalRequests,0);assert.equal(receipt.credentialFieldsExported,0);
assert.deepEqual(receipt.currentSaleHistoryCounts,{a:2,b:2});assert.equal(receipt.currentSaleStatesMatch,true);assert.equal(receipt.currentSaleStateHashes.a,receipt.currentSaleStateHashes.b);assert.match(receipt.currentSaleStateHashes.a,/^[a-f0-9]{64}$/);assert.deepEqual(receipt.perspectives,{a:'sale',b:'purchase'});
for(const phase of ['replacement','pause'])if(receipt.completedPhases.includes(phase))assert.ok(driver.phases.some(value=>value.phase===phase&&value.passed===true),'CONFIRMED_PHASE_RECEIPT_MISMATCH');
assert.equal(receipt.orders.length,2);assert.equal(driver.paymentSubmissionIntents,2);assert.equal(driver.paymentIntents.length,2);assert.equal(driver.external.provider,1);
const identity=manifest.config.identity;
assert.equal(identity.network,'stellar:testnet');assert.equal(identity.code,'USDC');assert.equal(identity.kind,'stellar-classic-credit');assert.equal(new Asset(identity.code,identity.issuer).contractId(Networks.TESTNET),identity.sacContract);
const uniqueTransactions=new Set();
for(const [index,order]of receipt.orders.entries()){
 const frozen=manifest.payloads.orders[index],payment=driver.paymentIntents[index];
 assert.equal(order.operationId,frozen.operationId);assert.equal(payment.operationId,order.operationId);
 assert.equal(order.serviceId,manifest.payloads.card.id);assert.equal(order.cardHash,manifest.payloads.cardHash);assert.equal(order.version,manifest.payloads.card.version);
 assert.equal(order.amount,'0.01');assert.deepEqual(order.identity,identity);assert.equal(order.destination,manifest.participants[0].wallet);assert.equal(order.payer,manifest.participants[1].wallet);assert.notEqual(order.payer,order.destination);
 assert.deepEqual(payment.identity,identity);assert.equal(payment.amount,order.amount);assert.equal(payment.destination,order.destination);assert.equal(payment.transactionHash,order.transactionHash);assert.equal(payment.feeStroops,'100');assert.ok(Number(payment.feeStroops)<=manifest.limits.maxFeeStroopsPerTransaction);
 for(const hash of [order.cardHash,order.memoHash,order.transactionHash,order.fullRecordHash,payment.signedXdrHash])assert.match(hash,/^[a-f0-9]{64}$/);
 uniqueTransactions.add(order.transactionHash);assert.ok(Number.isFinite(Date.parse(order.paymentVerifiedAt)));assert.ok(Date.parse(order.createdAt)<=Date.parse(order.paymentVerifiedAt));assert.ok(Date.parse(order.paymentVerifiedAt)<Number(payment.expiresAt)*1000);assert.ok(Date.parse(order.updatedAt)>=Date.parse(order.paymentVerifiedAt));
 if(index===0){assert.equal(order.phase,'delivered');assert.equal(order.failureReason,null);assert.match(order.delivery.textHash,/^[a-f0-9]{64}$/);assert.ok(order.delivery.characters>0&&order.delivery.characters<=2000);assert.ok(order.delivery.utf8Bytes>=order.delivery.characters&&order.delivery.utf8Bytes<=8000);assert.equal(order.delivery.reference,'bazaar-order:'+order.operationId);assert.ok(Date.parse(order.delivery.recordedAt)>=Date.parse(order.paymentVerifiedAt));}
 else{assert.equal(order.phase,'delivery-failed');assert.equal(order.delivery,null);assert.equal(order.failureReason,manifest.payloads.failureReason);}
}
assert.equal(uniqueTransactions.size,2);
const creates=driver.attempts.filter(value=>value.phase==='sale'&&value.path==='/api/market/orders'&&value.method==='POST');
assert.equal(creates.length,4);assert.equal(creates[0].httpStatus,201);assert.equal(creates[1].httpStatus,201);assert.equal(creates[0].payloadHash,creates[1].payloadHash);assert.equal(creates[2].httpStatus,409);assert.notEqual(creates[2].payloadHash,creates[0].payloadHash);assert.equal(creates[3].httpStatus,201);
const payAndReplay=driver.attempts.filter(value=>value.phase==='sale'&&value.path.endsWith('/'+receipt.orders[0].operationId)&&value.method==='POST'&&value.external.horizon!==3);
assert.equal(payAndReplay.length,2);assert.equal(payAndReplay[0].httpStatus,200);assert.equal(payAndReplay[1].httpStatus,409);assert.equal(payAndReplay[0].payloadHash,payAndReplay[1].payloadHash);assert.equal(payAndReplay[1].external.horizon,0);
assert.ok(driver.attempts.some(value=>value.phase==='sale'&&value.httpStatus===401),'THIRD_PARTY_DENIAL_MISSING');
console.log(JSON.stringify({status:'PASS_PUBLIC_BACKEND_SALE_AND_RECOVERY_RECEIPTS',planId:manifest.planId,sourceSha:manifest.sourceSha,provisionPriorAttempts:11,provisionNewAttempts:3,provisionClaims:1,payments:2,amountEach:'0.01',asset:'USDC',deliveredCharacters:receipt.orders[0].delivery.characters,declaredDeliveryFailure:true,currentSaleStatesMatch:true,ownerPerspectivesCorrect:true,identicalOrderReplay:true,conflictingOrderRejected:true,paymentReplayNoSecondHorizon:true,thirdPartyDenied:true,confirmedReplacement:receipt.completedPhases.includes('replacement'),confirmedPause:receipt.completedPhases.includes('pause'),externalRequests:0,secretReads:0,openingApproved:false,limitation:'Public stored assertions and frozen receipts; complete log/browser transport reconciliation and human opening gates are separate.'}));
