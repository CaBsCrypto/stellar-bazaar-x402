import {createHash} from 'node:crypto';
import {StrKey} from '@stellar/stellar-sdk';

export const SELLER_MARKET_PROTOCOL='x402-stellar-exact-v2';
export const SELLER_MARKET_RESOURCE='/api/market/orders/{operationId}/x402';
export const SELLER_USDC_IDENTITY=Object.freeze({kind:'stellar-classic-credit',network:'stellar:testnet',code:'USDC',issuer:'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',sacContract:'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'});
export const sellerHash=value=>createHash('sha256').update(value).digest('hex');
// Mirrors canonical-service-card.ts: sorted object keys, original array order.
export const sellerCanonical=value=>Array.isArray(value)?'['+value.map(sellerCanonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+sellerCanonical(value[key])).join(',')+'}':JSON.stringify(value);
export function sellerHttpsOrigin(raw){
 const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||(url.port&&url.port!=='443'))throw Error('OWNED_HTTPS_ORIGIN_REQUIRED');return url.origin;
}
export function sellerRoute(raw){if(typeof raw!=='string'||!/^\/[a-zA-Z0-9/_-]+$/.test(raw)||raw.includes('//'))throw Error('INVALID_RUNTIME_ROUTE');return raw;}
export function assertSellerCard(card){
 if(!card||card.version!=='bazaar.service-card/v0'||!/^([a-z0-9]+-)*[a-z0-9]+$/.test(card.id??'')||!card.name||!card.description||!card.provider?.name||card.kind!=='http'||sellerHttpsOrigin(card.url)!==card.url||!sellerRoute(card.routeTemplate)||card.network!=='stellar:testnet'||card.payment?.scheme!=='exact'||card.payment.asset!=='USDC'||card.payment.amount!=='0.01'||!StrKey.isValidEd25519PublicKey(card.payment.destination??'')||sellerCanonical(card.payment.identity)!==sellerCanonical(SELLER_USDC_IDENTITY)||card.payment.marketplace?.protocol!==SELLER_MARKET_PROTOCOL||card.payment.marketplace.resourceTemplate!==SELLER_MARKET_RESOURCE||card.paymentOptions!==undefined||card.delivery?.result?.contentType!=='text/plain'||!card.delivery.idempotency?.required||card.delivery.retry?.maxAttempts!==1||card.delivery.retry.retryable!==false||!Array.isArray(card.input)||card.input.some(v=>!v.name||!['string','number','boolean'].includes(v.type)||typeof v.required!=='boolean')||new Set(card.input.map(v=>v.name)).size!==card.input.length)throw Error('INVALID_NATIVE_SELLER_CARD');return card;
}
/** A public native marketplace card; no provider-kit split payment or top-level hash. */
export function createSellerCard({id,name,description,providerName,providerOrigin,route='/v1/marketplace-text',destination,input=[{name:'prompt',type:'string',required:true}],tags=['text','x402']}){
 const card={version:'bazaar.service-card/v0',id,name,description,kind:'http',url:sellerHttpsOrigin(providerOrigin),routeTemplate:sellerRoute(route),input,network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',amount:'0.01',destination,identity:{...SELLER_USDC_IDENTITY},marketplace:{protocol:SELLER_MARKET_PROTOCOL,resourceTemplate:SELLER_MARKET_RESOURCE}},provider:{name:providerName},tags,delivery:{mode:'async',estimatedDurationMs:1000,result:{schemaVersion:'seller-text/v1',contentType:'text/plain',terminalStatuses:['delivered','delivery-failed'],hash:{algorithm:'sha256',required:true,scope:'canonical-result'}},status:{required:true,urlTemplate:'/api/market/orders/{operationId}',pollAfterMs:60000},callback:{supported:false,required:false,authentication:'none'},retention:{resultTtlHours:0,durable:true},idempotency:{required:true,key:'Idempotency-Key',replay:'return-original'},retry:{retryable:false,maxAttempts:1,failureSemantics:'terminal-error'}}};
 assertSellerCard(card);return {card,cardHash:sellerHash(sellerCanonical(card))};
}
