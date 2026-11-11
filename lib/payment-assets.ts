/** Code alone never identifies a Stellar credit asset. The network also binds its SAC. */
export interface StellarCreditIdentity {
  kind:'stellar-classic-credit';
  network:'stellar:testnet'|'stellar:mainnet';
  code:string;
  issuer:string;
  sacContract:string;
}
export const USDC_TESTNET_PAYMENT_IDENTITY:Readonly<StellarCreditIdentity>=Object.freeze({
  kind:'stellar-classic-credit',network:'stellar:testnet',code:'USDC',
  issuer:'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  sacContract:'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
});
export const USDT0_MAINNET_PAYMENT_IDENTITY:Readonly<StellarCreditIdentity>=Object.freeze({
  kind:'stellar-classic-credit',network:'stellar:mainnet',code:'USDT0',
  issuer:'GATISXX6BZ6NC7IKQBY37CJD4SOZL3CYZJWXEDG6JVIY4WBS6KXJHN6Q',
  sacContract:'CBSJZEIO5C7KC2SF3MKSNXXJSW5G3VTNBX4ATMKUI3B2MR4JKM4R26YF',
});
export const USDT0_MAINNET_DESCRIPTOR=Object.freeze({identity:USDT0_MAINNET_PAYMENT_IDENTITY,decimals:7,paymentsEnabled:false,
  source:'https://developers.stellar.org/docs/tools/cli/agent-cli/guides/usdt0-on-mainnet'});
export function sameCreditIdentity(left:unknown,right:StellarCreditIdentity):left is StellarCreditIdentity {
  if(!left||typeof left!=='object'||Array.isArray(left))return false;
  const candidate=left as Record<string,unknown>;
  return Object.keys(candidate).sort().join(',')==='code,issuer,kind,network,sacContract'&&
    (Object.keys(right) as Array<keyof StellarCreditIdentity>).every(key=>candidate[key]===right[key]);
}
export function isCanonicalUsdcTestnet(identity:unknown):identity is StellarCreditIdentity {
  return sameCreditIdentity(identity,USDC_TESTNET_PAYMENT_IDENTITY);
}
