import { setTimeout as delay } from 'node:timers/promises';
// Recovery has deliberately no purchase/signing dependency.
export async function recoverRecordedPurchase(run, io) {
 if (!run.paymentAttempted) throw Error('NO_PAYMENT_ATTEMPT_TO_RECOVER');
 if (run.status === 'stored' && run.result !== undefined) return {ok:true,storage:'stored',operationId:run.operationId,paymentAttempted:false};
 const checkpoint = async (status) => {
  run.status=status;
  run.recovery={...run.recovery,updatedAt:new Date().toISOString(),state:status};
  await io.persist(run);
  try { await io.report?.(run); } catch { /* Local state survives unavailable history. */ }
 };
 if (run.result === undefined) {
  try { const backup=await io.loadBackup?.(); if(backup!==undefined) await io.accept(backup,run); } catch {}
 }
 if (run.result === undefined) {
  for(let attempt=0;attempt<3;attempt++) {
   if(attempt) await (io.wait??delay)([2000,5000][attempt-1]);
   run.recovery={...run.recovery,queries:(run.recovery?.queries??0)+1};
   await checkpoint('recovery-pending');
   try {
    const body=await io.requestRecovery(run);
    await io.accept(body,run);
    if(run.result===undefined) throw Error('RECOVERY_RESULT_MISSING');
    break;
   } catch(error) {
    if(error?.retryable===false) {run.recovery.reason='access-or-request-rejected';break;}
   }
  }
 }
 if(run.result===undefined) {await checkpoint('recovery-pending');return {ok:false,storage:'pending-recovery',operationId:run.operationId,paymentAttempted:false};}
 // Acceptance must already have durably retained the response before storage begins.
 await checkpoint('storage-pending');
 try {
  const saved=await io.store(run);
  if(saved.status==='stored') return {ok:true,storage:'stored',operationId:run.operationId,paymentAttempted:false};
 } catch {}
 await checkpoint('storage-pending');
 return {ok:false,storage:'pending-storage',operationId:run.operationId,paymentAttempted:false};
}
