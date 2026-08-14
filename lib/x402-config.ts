import {USDC_TESTNET_ADDRESS} from "@x402/stellar";

export const X402_NETWORK="stellar:testnet" as const;
export const X402_SCHEME="exact" as const;
export const X402_USDC_CONTRACT=USDC_TESTNET_ADDRESS;
export const X402_QUOTE_AMOUNT="10000"; // 0.0010000 USDC, 7 decimals
export const X402_QUOTE_PRICE="0.001 USDC";
export const X402_MAX_TIMEOUT_SECONDS=60;
export const X402_TESTNET_FACILITATOR_URL="https://channels.openzeppelin.com/x402/testnet";
export const X402_FACILITATOR_URL=process.env.STELLAR_X402_FACILITATOR_URL??X402_TESTNET_FACILITATOR_URL;

export function requireLocalResourceBaseUrl(){
 const value=process.env.X402_RESOURCE_BASE_URL??"http://127.0.0.1:3210";
 const url=new URL(value);
 if(url.protocol!=="http:"||!(url.hostname==="127.0.0.1"||url.hostname==="localhost"))throw new Error("X402_LOCAL_BASE_URL_REQUIRED");
 return url.origin;
}

export function requireServerX402Config(){
 const apiKey=process.env.STELLAR_X402_FACILITATOR_API_KEY?.trim();const seller=process.env.X402_SELLER_ADDRESS?.trim();
 if(!apiKey||!seller)throw new Error("X402_SERVER_NOT_CONFIGURED");
 if(X402_FACILITATOR_URL!==X402_TESTNET_FACILITATOR_URL)throw new Error("X402_TESTNET_FACILITATOR_REQUIRED");
 if(!/^G[A-Z2-7]{55}$/.test(seller))throw new Error("X402_INVALID_SELLER_ADDRESS");
 return {apiKey,seller};
}
