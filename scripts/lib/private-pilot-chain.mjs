import {
  TransactionBuilder,
  Networks,
  Address,
  scValToNative,
} from "@stellar/stellar-sdk";
export function inspectPilotTransaction(transaction, run) {
  const envelope = TransactionBuilder.fromXDR(
      transaction.envelope_xdr,
      Networks.TESTNET,
    ),
    tx = "innerTransaction" in envelope ? envelope.innerTransaction : envelope;
  let transferMatches = false;
  if (tx.operations.length === 1) {
    const op = tx.operations[0];
    if (
      op.type === "invokeHostFunction" &&
      op.func.switch().name === "hostFunctionTypeInvokeContract"
    ) {
      const call = op.func.invokeContract(),
        args = call.args();
      transferMatches =
        call.functionName().toString() === "transfer" &&
        args.length === 3 &&
        Address.fromScAddress(call.contractAddress()).toString() ===
          run.expected.asset &&
        String(scValToNative(args[0])) === run.payer &&
        String(scValToNative(args[1])) === run.payTo &&
        BigInt(scValToNative(args[2])) === 10000n;
    }
  }
  const ledger =
    typeof transaction.ledger === "number"
      ? transaction.ledger
      : transaction.ledger_attr;
  const receiptLedgerMatches = ledger === run.receipt.ledger;
  const verifiedPayment =
    transaction.successful === true &&
    transaction.hash === run.transactionHash &&
    receiptLedgerMatches &&
    transferMatches;
  return {
    verifiedPayment,
    transactionSuccessful: transaction.successful === true,
    receiptLedgerMatches,
    transferMatches,
    transactionHash: run.transactionHash,
    ledger,
  };
}
