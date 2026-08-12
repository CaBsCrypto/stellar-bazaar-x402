export type SwapSide = "buy" | "sell";
export interface SwapRiskResult { pair:string; amount:number; side:SwapSide; routeRisk:"low"|"moderate"|"elevated"; priceImpactPct:number; liquidityBand:"deep"|"standard"|"thin"; factors:string[]; methodology:"deterministic-reference-v1"; informationalOnly:true }
const SUPPORTED_PAIRS = new Set(["XLM/USDC","AQUA/USDC","EURC/USDC"]);
export function calculateSwapRisk(pairInput:string, amount:number, side:SwapSide):SwapRiskResult {
  const pair=pairInput.trim().toUpperCase();
  if(!SUPPORTED_PAIRS.has(pair)) throw new Error("UNSUPPORTED_PAIR");
  if(!Number.isFinite(amount)||amount<=0||amount>1_000_000) throw new Error("INVALID_AMOUNT");
  if(side!=="buy"&&side!=="sell") throw new Error("INVALID_SIDE");
  const pairFactor=pair==="XLM/USDC"?.65:pair==="EURC/USDC"?.9:1.35;
  const priceImpactPct=Number(Math.min(4.5,pairFactor*(Math.log10(amount+1)/10)*(side==="buy"?1:1.08)).toFixed(3));
  return {pair,amount,side,routeRisk:priceImpactPct<.25?"low":priceImpactPct<.8?"moderate":"elevated",priceImpactPct,liquidityBand:pair==="XLM/USDC"?"deep":pair==="EURC/USDC"?"standard":"thin",factors:[`pair:${pair}`,`size_bucket:${amount<1000?"small":amount<50000?"medium":"large"}`,`side:${side}`],methodology:"deterministic-reference-v1",informationalOnly:true};
}
