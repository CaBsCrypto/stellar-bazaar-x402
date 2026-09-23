import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { paymentBinding, type PaymentJournalStore } from "./pilot-payment-store.ts";
/** Only the first durable claim may call settle. Unknown outcomes remain pending. */
export async function settlePilotOnce(store:PaymentJournalStore, operationId:string, payload:PaymentPayload, requirements:PaymentRequirements, settle:()=>Promise<SettleResponse>):Promise<SettleResponse> {
  const binding=paymentBinding({payload,requirements});
  return store.exclusive(operationId,async(read,save)=>{
    const prior=await read();
    if(prior){
      if(prior.binding !== binding)throw Error("OPERATION_CONFLICT");
      if(prior.phase === "completed" && prior.outcome)return prior.outcome as SettleResponse;
      throw Error("PAYMENT_PENDING");
    }
    await save({binding,phase:"started"});
    const outcome=await settle();
    await save({binding,phase:"completed",outcome});
    return outcome;
  });
}
