import {z} from 'zod';
import {stellarCreditIdentitySchema} from './service-card-schema.ts';
import {canonical,sha} from './marketplace-identity.ts';
import type {MarketOrder} from './marketplace-store.ts';
import type {MarketX402Settlement} from './marketplace-x402-store.ts';

const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const MARKET_RECOVERY_CAPACITY_BYTES=131072;
/** Content-free controls survive visible history, including uncertain payments. */
export const marketRecoverySchema=z.object({
 operationId:z.string().uuid(),buyerOwnerId:z.string(),sellerOwnerId:z.string(),
 intentHash:digest,cardHash:digest,inputHash:digest,orderBinding:digest,
 payer:z.string().regex(/^G[A-Z2-7]{55}$/),destination:z.string().regex(/^G[A-Z2-7]{55}$/),
 amount:z.string(),settlement:stellarCreditIdentitySchema.optional(),
 paymentProtocol:z.literal('x402-stellar-exact-v2').optional(),
 paymentPhase:z.enum(['unpaid','rejected','uncertain','confirmed']),
 authorizationFingerprint:digest.optional(),transactionHash:digest.optional(),
 paymentVerifiedAt:z.string().datetime().optional(),archivedAt:z.string().datetime(),
}).strict();
export type MarketRecovery=z.infer<typeof marketRecoverySchema>;
export function marketIntentHash(input:{operationId:string;serviceId:string;cardHash:string;payer:string;input:unknown;paymentProtocol?:string}){
 return sha(canonical({operationId:input.operationId,serviceId:input.serviceId,cardHash:input.cardHash,payer:input.payer,input:input.input,paymentProtocol:input.paymentProtocol}));
}
export function marketRecoveryRecord(order:MarketOrder,record:MarketX402Settlement|undefined,now=Date.now()):MarketRecovery{
 return {operationId:order.operationId,buyerOwnerId:order.buyerOwnerId,sellerOwnerId:order.sellerOwnerId,
  intentHash:marketIntentHash(order),cardHash:order.cardHash,inputHash:order.inputHash??sha(canonical(order.input)),
  orderBinding:sha(canonical({operationId:order.operationId,owner:order.buyerOwnerId,protocol:order.paymentProtocol,cardHash:order.cardHash,inputHash:order.inputHash,payer:order.payer,destination:order.destination,amount:order.amount,settlement:order.settlement})),
  payer:order.payer,destination:order.destination,amount:order.amount,...(order.settlement?{settlement:order.settlement}:{}),
  ...(order.paymentProtocol?{paymentProtocol:order.paymentProtocol}:{}),
  paymentPhase:order.paymentVerifiedAt?'confirmed':record?.phase==='rejected'?'rejected':record&&record.phase!=='challenged'?'uncertain':'unpaid',
  ...(record?.authorizationFingerprint?{authorizationFingerprint:record.authorizationFingerprint}:{}),
  ...(order.transactionHash??record?.transactionHash??record?.outcome?.transaction?{transactionHash:order.transactionHash??record?.transactionHash??record?.outcome?.transaction}:{}),
  ...(order.paymentVerifiedAt?{paymentVerifiedAt:order.paymentVerifiedAt}:{}),archivedAt:new Date(now).toISOString()};
}
export function maximumMarketRecoveryBytes(order:MarketOrder){
 return Buffer.byteLength(JSON.stringify({...marketRecoveryRecord(order,undefined),paymentPhase:'confirmed',authorizationFingerprint:'f'.repeat(64),transactionHash:'f'.repeat(64),paymentVerifiedAt:'9999-12-31T23:59:59.999Z',archivedAt:'9999-12-31T23:59:59.999Z'}),'utf8')+1;
}
