import { Keypair } from "@stellar/stellar-sdk";

// Public addresses only. Never place seeds in source, logs, docs, or errors.
const RETIRED_TESTNET_PAYER_ADDRESSES = new Set([
  "GC3CK5A4KCNE44LGMU6PYPEAAZVQOFATJCEMBAASGCXK5EKECTB2VDL4",
]);

export function assertActiveTestnetPayerSecret(secret: string): string {
  const publicKey = Keypair.fromSecret(secret).publicKey();
  if (RETIRED_TESTNET_PAYER_ADDRESSES.has(publicKey)) {
    throw new Error("RETIRED_TESTNET_PAYER_IDENTITY");
  }
  return publicKey;
}

export function isRetiredTestnetPayerAddress(publicKey: string): boolean {
  return RETIRED_TESTNET_PAYER_ADDRESSES.has(publicKey);
}
