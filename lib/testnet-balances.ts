import { Horizon, Keypair } from "@stellar/stellar-sdk";
import { decimalToAtomic } from "./operation-history-client.ts";
import type { AssetBalances } from "./payment-options.ts";
export const CIRCLE_TESTNET_ISSUER="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export function spendableTestnetBalances(account:any, baseReserveAtomic:string):AssetBalances {
  const native=account.balances.find((b:any)=>b.asset_type === "native");
  const units=2+Number(account.subentry_count)-Number(account.num_sponsored ?? 0)+Number(account.num_sponsoring ?? 0);
  if(!Number.isInteger(units)||units<0||!/^\d+$/.test(baseReserveAtomic)) throw Error("INVALID_RESERVE_DATA");
  const reserve=BigInt(baseReserveAtomic)*BigInt(units);
  const available=native ? BigInt(decimalToAtomic(native.balance))-BigInt(decimalToAtomic(native.selling_liabilities ?? "0"))-reserve : 0n;
  const usdc=account.balances.find((b:any)=>b.asset_type === "credit_alphanum4" && b.asset_code === "USDC" && b.asset_issuer === CIRCLE_TESTNET_ISSUER && b.is_authorized !== false);
  const dollars=usdc ? BigInt(decimalToAtomic(usdc.balance))-BigInt(decimalToAtomic(usdc.selling_liabilities ?? "0")) : 0n;
  return {XLM:(available>0n?available:0n).toString(),USDC:(dollars>0n?dollars:0n).toString()};
}
export async function readTestnetBalances(secret:string):Promise<AssetBalances> {
  const server=new Horizon.Server("https://horizon-testnet.stellar.org");
  const [account,ledgers]=await Promise.all([server.loadAccount(Keypair.fromSecret(secret).publicKey()),server.ledgers().order("desc").limit(1).call()]);
  return spendableTestnetBalances(account,String(ledgers.records[0].base_reserve_in_stroops));
}
