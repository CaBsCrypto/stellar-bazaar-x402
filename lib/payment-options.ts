import type { PaymentOption, ServiceCard, PaidService } from "./types.ts";
import { decimalToAtomic } from "./operation-history-client.ts";
export const TESTNET_ASSETS = {
  USDC: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  // Asset.native().contractId(Networks.TESTNET); verified by the pilot preflight.
  XLM: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
} as const;
export const xlmPilotEnabled = () => process.env.NEXT_PUBLIC_X402_XLM_PILOT === "true";
export function sandboxOptions(destination: string): PaymentOption[] {
  return (["USDC", "XLM"] as const).map(asset => ({scheme:"exact", asset, contract:TESTNET_ASSETS[asset], amount:asset === "USDC" ? "0.001" : "0.01", destination}));
}
export function assertPaymentOptions(card: ServiceCard) {
  if (!card.paymentOptions) return;
  if (card.network !== "stellar:testnet" || card.payment.scheme !== "exact" || !card.paymentOptions.length || card.paymentOptions.length > 2) throw Error("INVALID_PAYMENT_OPTIONS");
  const seen = new Set<string>();
  for (const o of card.paymentOptions) {
    if (o.scheme !== "exact" || !(o.asset in TESTNET_ASSETS) || o.contract !== TESTNET_ASSETS[o.asset] || !/^G[A-Z2-7]{55}$/.test(o.destination) || seen.has(o.asset) || BigInt(decimalToAtomic(o.amount)) <= 0n) throw Error("INVALID_PAYMENT_OPTIONS");
    seen.add(o.asset);
  }
  if (!card.paymentOptions.some(o => o.asset === card.payment.asset && o.amount === card.payment.amount && o.destination === card.payment.destination)) throw Error("PRIMARY_PAYMENT_OPTION_MISSING");
}
export function paymentLabel(service: Pick<PaidService,"payment"|"paymentOptions">) {
  return (service.paymentOptions ?? [service.payment]).map(o => `${o.amount.replace(".",",")} ${o.asset}`).join(" o ");
}
export type AssetBalances = Partial<Record<"USDC"|"XLM", string>>; // spendable base units, after reserves/liabilities
export function selectPaymentOption(card: ServiceCard, policy: {allowedAssets:string[]; budgets:Record<string,string>; balances:AssetBalances; preferredAsset?:string}): PaymentOption {
  assertPaymentOptions(card);
  const options = [...(card.paymentOptions ?? [])].sort((a,b)=>a.asset === b.asset ? 0 : a.asset === "USDC" ? -1 : 1);
  for (const option of options) {
    if (policy.preferredAsset && option.asset !== policy.preferredAsset) continue;
    const budget = policy.budgets[option.asset];
    const balance = policy.balances[option.asset];
    if (!policy.allowedAssets.includes(option.asset) || budget === undefined || balance === undefined) continue;
    const amount = BigInt(decimalToAtomic(option.amount));
    if (amount <= BigInt(decimalToAtomic(budget)) && amount <= BigInt(balance)) return option;
  }
  throw Error("NO_AUTHORIZED_FUNDED_OPTION: consulta la guía de fondos; no se ha iniciado un pago.");
}
