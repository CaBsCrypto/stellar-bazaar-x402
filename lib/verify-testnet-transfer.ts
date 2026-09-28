import { Address, FeeBumpTransaction, Horizon, Networks, TransactionBuilder, scValToNative } from "@stellar/stellar-sdk";
import type { SettlementReceiptContext } from "./bazaar-agent-client.ts";
import { decimalToAtomic } from "./operation-history-client.ts";
import { TESTNET_ASSETS } from "./payment-options.ts";
export function matchesTestnetTransfer(record:{successful:boolean;hash:string;envelope_xdr:string}, context:SettlementReceiptContext, payer:string):boolean {
  try {
    const {receipt,expected}=context;
    if(!record.successful || record.hash !== receipt.transaction || !receipt.success || receipt.network !== "stellar:testnet" || expected.network !== "stellar:testnet" || receipt.payer !== payer || expected.scheme !== "exact")return false;
    if(!expected.contract || expected.contract !== TESTNET_ASSETS[expected.asset as keyof typeof TESTNET_ASSETS])return false;
    const decoded=TransactionBuilder.fromXDR(record.envelope_xdr,Networks.TESTNET);
    if(decoded.hash().toString("hex") !== record.hash)return false;
    const transaction=decoded instanceof FeeBumpTransaction ? decoded.innerTransaction : decoded;
    if(transaction.operations.length !== 1)return false;
    const operation=transaction.operations[0];
    if(operation.type !== "invokeHostFunction" || operation.func.switch().name !== "hostFunctionTypeInvokeContract")return false;
    const invocation=operation.func.invokeContract(), args=invocation.args();
    return invocation.functionName().toString() === "transfer" && args.length === 3 &&
      Address.fromScAddress(invocation.contractAddress()).toString() === expected.contract &&
      String(scValToNative(args[0])) === payer && String(scValToNative(args[1])) === expected.destination &&
      BigInt(scValToNative(args[2])) === BigInt(decimalToAtomic(expected.amount));
  } catch {return false;}
}
/** Read-only Horizon evidence. A missing/uncertain record fails closed and may be reconciled later. */
export async function verifyTestnetTransfer(context:SettlementReceiptContext,payer:string):Promise<boolean> {
  if(!context.receipt.transaction || !/^[a-f0-9]{64}$/i.test(context.receipt.transaction))return false;
  try {
    const record=await new Horizon.Server("https://horizon-testnet.stellar.org").transactions().transaction(context.receipt.transaction).call();
    return matchesTestnetTransfer(record,context,payer);
  } catch {return false;}
}
