// Portable equivalent of lib/market-price.ts. No remote calls or floating point.
export const MAX_MARKET_AMOUNT_ATOMIC = 9223372036854775807n;
export function marketAmountAtomic(value) {
 if(typeof value!=='string'||value.length>28||!/^(0|[1-9]\d*)(\.\d{1,7})?$/.test(value))throw Error('INVALID_MARKET_AMOUNT');
 const [whole,fraction='']=value.split('.'),atomic=BigInt(whole)*10000000n+BigInt(fraction.padEnd(7,'0'));
 if(atomic<=0n||atomic>MAX_MARKET_AMOUNT_ATOMIC)throw Error('INVALID_MARKET_AMOUNT');return atomic.toString();
}
export function marketAtomicValid(value){return typeof value==='string'&&/^[1-9]\d{0,18}$/.test(value)&&BigInt(value)<=MAX_MARKET_AMOUNT_ATOMIC;}
export function isMarketAmount(value){try{marketAmountAtomic(value);return true;}catch{return false;}}
