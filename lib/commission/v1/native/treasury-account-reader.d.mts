export const TREASURY_ACCOUNT_URL:string;
export const USDC_ISSUER:string;
export interface TreasuryObservation {version:'bazaar.treasury-account-observation/v1';account:string;network:'stellar:testnet';issuer:string;asset:'USDC';observedAt:number;availableToReceiveAtomic:string;accountDataHash:string;source:string;consensusProofVerified:false;}
export function createTreasuryAccountReader(options?:{enabled?:boolean;fetcher?:typeof fetch;now?:()=>number;timeoutMs?:number}):()=>Promise<TreasuryObservation>;
