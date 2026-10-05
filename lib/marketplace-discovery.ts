import type {ServiceCard} from './types.ts';
import {isCanonicalUsdcTestnet} from './payment-assets.ts';

/** The provider origin stays in the reviewed card; purchase URLs use the authenticated Bazaar origin. */
export function marketplacePurchaseDescriptor(card:ServiceCard,origin:string) {
  if(!card.payment.marketplace)return undefined;
  const url=new URL(origin);
  if(url.origin!==origin||url.username||url.password||url.search||url.hash||
    (url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))))throw Error('INVALID_MARKETPLACE_ORIGIN');
  if(card.payment.marketplace.protocol!=='x402-stellar-exact-v2'||
    card.payment.marketplace.resourceTemplate!=='/api/market/orders/{operationId}/x402'||
    card.payment.scheme!=='exact'||card.payment.asset!=='USDC'||!isCanonicalUsdcTestnet(card.payment.identity))throw Error('INVALID_MARKETPLACE_PAYMENT');
  return {
    protocol:card.payment.marketplace.protocol,
    orderCreateUrl:origin+'/api/market/orders',
    paymentUrlTemplate:origin+card.payment.marketplace.resourceTemplate,
    statusUrlTemplate:origin+'/api/market/orders/{operationId}',
    authentication:'workspace-agent' as const,
    delivery:'recoverable-order' as const,
  };
}
