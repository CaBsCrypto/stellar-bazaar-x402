/** Stellar classic credit amounts use seven decimal places and a signed int64. */
export const MARKET_AMOUNT_SCALE = 10_000_000n;
export const MAX_MARKET_AMOUNT_ATOMIC = 9_223_372_036_854_775_807n;

export function marketAmountAtomic(value: string): string {
  if (typeof value !== 'string' || value.length > 28 || !/^(0|[1-9]\d*)(\.\d{1,7})?$/.test(value)) throw Error('INVALID_MARKET_AMOUNT');
  const [whole, fraction = ''] = value.split('.');
  const atomic = BigInt(whole) * MARKET_AMOUNT_SCALE + BigInt(fraction.padEnd(7, '0'));
  if (atomic <= 0n || atomic > MAX_MARKET_AMOUNT_ATOMIC) throw Error('INVALID_MARKET_AMOUNT');
  return atomic.toString();
}

export function isMarketAmount(value: string): boolean {
  try { marketAmountAtomic(value); return true; } catch { return false; }
}
