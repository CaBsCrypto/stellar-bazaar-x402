export const EXTERNAL_QUOTE_REPOSITORY="https://github.com/CaBsCrypto/stellar-defi-quote-service";
export const EXTERNAL_QUOTE_MANIFEST=`${EXTERNAL_QUOTE_REPOSITORY}/blob/main/bazaar-listing.json`;

export type ExternalProviderCard={
 version:"bazaar.external-provider/v1";id:string;title:{es:string;en:string};description:{es:string;en:string};
 kind:"http";provider:{name:string;repository:string;codeSharedWithBazaar:false};
 endpoint:{baseUrl:string|null;method:"POST";path:"/api/quote";publiclyReachable:boolean};
 input:{required:string[]};output:{mode:"DETERMINISTIC_FIXTURE";structured:true};
 payment:{enabled:false;status:"provider-not-x402-enabled";desiredNetwork:"stellar:testnet";desiredScheme:"exact"};
 mcp:{shapeDocumented:true;transportPublished:false;toolName:"get_swap_risk_quote"};
 status:"contract-only"|"reachable-read-only";trust:{metadataUntrusted:true;certified:false};
};

export function getExternalQuoteCard(baseUrl=process.env.EXTERNAL_QUOTE_BASE_URL?.trim()):ExternalProviderCard{
 let normalized:string|null=null;
 if(baseUrl){const url=new URL(baseUrl);if(url.protocol!=="https:"&&!(url.protocol==="http:"&&(url.hostname==="127.0.0.1"||url.hostname==="localhost")))throw new Error("EXTERNAL_PROVIDER_URL_REJECTED");normalized=url.origin}
 return {version:"bazaar.external-provider/v1",id:"stellar-defi-quote-service",title:{es:"Cotización y riesgo DeFi Stellar",en:"Stellar DeFi Quote & Risk"},description:{es:"Servicio externo determinista de solo lectura; actualmente gratuito y no desplegado por el proveedor.",en:"External deterministic read-only service; currently free and not deployed by the provider."},kind:"http",provider:{name:"Stellar DeFi Quote Service",repository:EXTERNAL_QUOTE_REPOSITORY,codeSharedWithBazaar:false},endpoint:{baseUrl:normalized,method:"POST",path:"/api/quote",publiclyReachable:!!normalized},input:{required:["sellAsset","buyAsset","amount"]},output:{mode:"DETERMINISTIC_FIXTURE",structured:true},payment:{enabled:false,status:"provider-not-x402-enabled",desiredNetwork:"stellar:testnet",desiredScheme:"exact"},mcp:{shapeDocumented:true,transportPublished:false,toolName:"get_swap_risk_quote"},status:normalized?"reachable-read-only":"contract-only",trust:{metadataUntrusted:true,certified:false}};
}
