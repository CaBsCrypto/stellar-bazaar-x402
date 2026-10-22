// Offline arithmetic only; never modifies a ledger or opens private access.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const MiB=1048576;
function safe(value){assert.ok(Number.isSafeInteger(value)&&value>=0);return value;}
function sum(...values){return safe(values.reduce((n,v)=>n+safe(v),0));}
export function projectTransferAdmission({remainingBytes,buyerPreflightBytes,creationBytes,readinessBytes,holdBytes}){
 const peak=sum(buyerPreflightBytes,creationBytes,readinessBytes,holdBytes);return {peakBytes:peak,fits:peak<=safe(remainingBytes),remainingAfterPeakBytes:Math.max(0,remainingBytes-peak),insufficientByBytes:Math.max(0,peak-remainingBytes)};
}
export function deriveTextHold({recoveryRequestBytes,backgroundInvocationBytes,financialRequests=2,sellerRecoveryRequests=6,buyerRecoveryReads=0,wakeInvocations=2}){
 const requests=sum(financialRequests,sellerRecoveryRequests,buyerRecoveryReads);return {recoveryRequests:requests,bytes:sum(safe(requests*safe(recoveryRequestBytes)),safe(wakeInvocations*safe(backgroundInvocationBytes)))};
}
const report=JSON.parse(await readFile('docs/evidence/current-production-free-budget-2026-10-12.json','utf8'));
assert.equal(report.status,'PASS_READ_ONLY_CURRENT_PRODUCTION_FREE_BUDGET');
assert.equal(report.budget.originalOperationHoldPresent,true);
assert.equal(report.commandLedgerReset,false);
assert.equal(report.budget.remainingTransferBytes,1216395776);
assert.equal(report.budget.transferLimitBytes,8000000000);
const remaining=report.budget.remainingTransferBytes;
const metadata=12*MiB+262144,light=32*MiB+262144;
const background=100_000_000+4096;
const coldReadiness=sum(3*metadata,light,light,background);
const warmReadiness=sum(3*metadata,light,background);
const legacyCreation=176*MiB+1048576;
const legacyRecovery=136*MiB+1900544;
let checks=5;
assert.equal(coldReadiness,206172416);assert.equal(warmReadiness,172355840);checks+=2;
const rawHold=JSON.stringify(report.budget.reservedCommandsByProfile);
const originalHoldBytes=report.budget.reservedTransferBytes;
assert.equal(projectTransferAdmission({remainingBytes:remaining,buyerPreflightBytes:0,creationBytes:0,readinessBytes:0,holdBytes:2_000_000_000}).fits,false);checks++;
const legacyMinimal=projectTransferAdmission({remainingBytes:remaining,buyerPreflightBytes:0,creationBytes:legacyCreation,readinessBytes:coldReadiness,holdBytes:800_000_000});
assert.equal(legacyMinimal.fits,true);assert.equal(legacyMinimal.remainingAfterPeakBytes,24625408);checks+=2;
const legacyPreflight=sum(2*light,134*MiB+262144);
assert.equal(projectTransferAdmission({remainingBytes:remaining,buyerPreflightBytes:legacyPreflight,creationBytes:legacyCreation,readinessBytes:coldReadiness,holdBytes:800_000_000}).fits,false);checks++;
const proposed64Happy=deriveTextHold({recoveryRequestBytes:64*MiB,backgroundInvocationBytes:background});
assert.equal(proposed64Happy.bytes,736879104);assert.ok(proposed64Happy.bytes<800_000_000);checks+=2;
const proposed64Read=deriveTextHold({recoveryRequestBytes:64*MiB,backgroundInvocationBytes:background,buyerRecoveryReads:1});
assert.equal(proposed64Read.bytes,803987968);assert.ok(proposed64Read.bytes>800_000_000);checks+=2;
assert.ok(deriveTextHold({recoveryRequestBytes:legacyRecovery,backgroundInvocationBytes:background}).bytes>remaining);checks++;
// Hypothetical bounds never prove a runtime envelope. A projection must still
// include the actual preflight and any extra wake/recovery requested.
const hypothetical48=deriveTextHold({recoveryRequestBytes:48*MiB,backgroundInvocationBytes:background,buyerRecoveryReads:2});
assert.ok(hypothetical48.bytes<800_000_000);checks++;
const hypotheticalExtraWake=deriveTextHold({recoveryRequestBytes:48*MiB,backgroundInvocationBytes:background,buyerRecoveryReads:2,wakeInvocations:3});
assert.ok(hypotheticalExtraWake.bytes>800_000_000);checks++;
assert.equal(report.budget.reservedTransferBytes,originalHoldBytes);assert.equal(JSON.stringify(report.budget.reservedCommandsByProfile),rawHold);checks+=2;
console.log(JSON.stringify({status:'PASS_OFFLINE_TEXT_RECOVERY_TRANSFER_PROJECTION',checks,remainingFromActualReadBytes:remaining,coldReadinessCurrentLedgerBytes:coldReadiness,warmReadinessCurrentLedgerBytes:warmReadiness,legacyMinimalPeak:legacyMinimal,legacyBuyerPreflightBytes:legacyPreflight,proposed64MiBHappyHoldBytes:proposed64Happy.bytes,proposed64MiBWithOneBuyerReadBytes:proposed64Read.bytes,hypotheticalBoundsAreNotRuntimeEvidence:true,originalHoldChanged:false,networkRequests:0,dpapiReads:0,ledgerWrites:0,newOrders:0,newPayments:0}));
