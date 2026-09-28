import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { assertPaymentJournal, paymentBinding, type PaymentJournalStore } from "./pilot-payment-store.ts";
export function assertSettlementOutcome(value: unknown, requirements: PaymentRequirements): asserts value is SettleResponse {
  const outcome = value as SettleResponse;
  if (!outcome || typeof outcome !== "object" || Array.isArray(outcome) || typeof outcome.success !== "boolean" || outcome.network !== requirements.network || typeof outcome.transaction !== "string" || (outcome.success && !/^[a-fA-F0-9]{64}$/.test(outcome.transaction)) || (outcome.payer !== undefined && (typeof outcome.payer !== "string" || !/^G[A-Z2-7]{55}$/.test(outcome.payer)))) throw Error("PAYMENT_JOURNAL_INVALID: settlement outcome");
}
/** Only the first durable claim may call settle. Unknown outcomes remain pending. */
export async function settlePilotOnce(store:PaymentJournalStore, operationId:string, payload:PaymentPayload, requirements:PaymentRequirements, settle:()=>Promise<SettleResponse>):Promise<SettleResponse> {
  const binding=paymentBinding({payload,requirements});
  return store.exclusive(operationId,async(read,save)=>{
    const prior=await read();
    if(prior !== undefined){
      assertPaymentJournal(prior);
      if(prior.binding !== binding)throw Error("OPERATION_CONFLICT");
      if(prior.phase === "completed" && prior.outcome){
        assertSettlementOutcome(prior.outcome, requirements);
        return prior.outcome;
      }
      throw Error("PAYMENT_PENDING");
    }
    await save({binding,phase:"started"});
    const outcome=await settle();
    assertSettlementOutcome(outcome, requirements);
    await save({binding,phase:"completed",outcome});
    return outcome;
  });
}
