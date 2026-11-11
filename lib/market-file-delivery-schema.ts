import {z} from 'zod';
import {deliveryStorage} from './delivery-contract.ts';
import type {MarketOrder} from './marketplace-store.ts';
import {canonical,sha} from './marketplace-identity.ts';

export const MARKET_FILE_LIMIT=50_000_000;
export const MARKET_ACCOUNT_FILE_LIMIT=100_000_000;
export const MARKET_GLOBAL_FILE_LIMIT=5_000_000_000;
export const MARKET_FILE_COUNT=10;
export const MARKET_FILE_METADATA_BYTES=32_768;
export const MARKET_CONTENT_RETENTION_MS=7*24*60*60*1000;
export const MARKET_FILE_CLEANUP_GRACE_MS=15*60*1000;
export const MARKET_FILE_CLEANUP_CAPACITY_BYTES=65_536;
const id=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/);
export const marketDeliveryFileSchema=z.object({
 id,name:z.string().min(1).max(120).regex(/^[^\\/\r\n\u0000]+$/),
 mediaType:z.string().max(120).regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/),
 size:z.number().int().positive().max(MARKET_FILE_LIMIT),sha256:z.string().regex(/^[a-f0-9]{64}$/),
 url:z.string().max(2048).refine(raw=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&u.href===raw;}catch{return false;}}).optional(),
}).strict();
export const marketObjectPrefixSchema=z.string().regex(/^market-deliveries\/v1\/(preview|production|local)\/[a-f0-9]{32}$/);
export const marketFileReservationSchema=z.object({maxBytes:z.number().int().positive().max(MARKET_ACCOUNT_FILE_LIMIT),expiresAt:z.string().datetime(),released:z.boolean().optional(),objectPrefix:marketObjectPrefixSchema.optional()}).strict();
export const marketFileDeliverySchema=z.object({
 mode:z.enum(['external','bazaar']),versionId:z.string().uuid(),attemptId:z.string().uuid(),
 manifestHash:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string().datetime(),expiresAt:z.string().datetime(),
 files:z.array(marketDeliveryFileSchema.extend({status:z.enum(['pending','available'])})).min(1).max(MARKET_FILE_COUNT),
}).strict().refine(v=>Buffer.byteLength(JSON.stringify(v),'utf8')<=MARKET_FILE_METADATA_BYTES);
export const prepareMarketFilesSchema=z.object({attemptId:z.string().uuid(),versionId:z.string().uuid(),files:z.array(marketDeliveryFileSchema).min(1).max(MARKET_FILE_COUNT)}).strict();
export const confirmMarketFileSchema=z.object({attemptId:z.string().uuid(),versionId:z.string().uuid(),fileId:id}).strict();
export type MarketDeliveryFile=z.infer<typeof marketDeliveryFileSchema>;
export type MarketFileDelivery=z.infer<typeof marketFileDeliverySchema>;
export type MarketFileReservation=z.infer<typeof marketFileReservationSchema>;
const cleanupKey=z.string().max(300).regex(/^market-deliveries\/v1\/(preview|production|local)\/[a-f0-9]{32}\/[a-f0-9]{64}\/[a-f0-9]{64}\/[a-f0-9]{64}$/);
export const marketFileCleanupSchema=z.object({operationId:z.string().uuid(),buyerOwnerId:z.string(),maxBytes:z.number().int().positive().max(MARKET_ACCOUNT_FILE_LIMIT),objectKeys:z.array(cleanupKey).min(1).max(MARKET_FILE_COUNT),notBefore:z.string().datetime(),firstDeletedAt:z.string().datetime().optional()}).strict().refine(value=>{
 // Persisted cleanup controls are an object-deletion capability. Bind them to
 // one buyer and one original prefix/version before any storage call can run.
 if(!value.objectKeys.length)return false;
 const first=value.objectKeys[0].split('/'),prefix=first.slice(0,4).join('/'),version=first[5],owner=sha(value.buyerOwnerId);
 return new Set(value.objectKeys).size===value.objectKeys.length&&value.objectKeys.every(key=>{const parts=key.split('/');return parts.slice(0,4).join('/')===prefix&&parts[4]===owner&&parts[5]===version;});
});
export type MarketFileCleanup=z.infer<typeof marketFileCleanupSchema>;
export function maximumMarketFileCleanupBytes(order:MarketOrder){const storage=deliveryStorage(order.card.delivery);return storage.mode==='bazaar'?512+storage.maxFiles*302:0;}
export function marketContentExpiresAt(order:{createdAt:string}){return new Date(Date.parse(order.createdAt)+MARKET_CONTENT_RETENTION_MS).toISOString();}
export function marketFilesManifestHash(value:{mode:string;versionId:string;attemptId:string;files:MarketDeliveryFile[]}){
 return sha(canonical({mode:value.mode,versionId:value.versionId,attemptId:value.attemptId,files:value.files.map(({id,name,mediaType,size,sha256,url})=>({id,name,mediaType,size,sha256,...(url?{url}:{})}))}));
}
/** Persistent assertions are independent of deployment flags and never expire an order. */
export function validateMarketFiles(order:MarketOrder){
 const storage=deliveryStorage(order.card.delivery),reservation=order.fileReservation,delivery=order.fileDelivery;
 if(reservation&&(storage.mode!=='bazaar'||reservation.maxBytes!==storage.maxTotalBytes||reservation.expiresAt!==marketContentExpiresAt(order)))throw Error('INVALID_FILE_RESERVATION');
 if(!delivery)return;
 if(storage.mode==='text'||delivery.mode!==storage.mode||delivery.files.length>storage.maxFiles||delivery.expiresAt!==marketContentExpiresAt(order)||delivery.attemptId!==order.attemptId)throw Error('INVALID_FILE_DELIVERY_BINDING');
 if(new Set(delivery.files.map(f=>f.id)).size!==delivery.files.length||delivery.manifestHash!==marketFilesManifestHash(delivery))throw Error('INVALID_FILE_MANIFEST');
 if(delivery.mode==='bazaar'){
  if(storage.mode!=='bazaar'||!reservation||delivery.files.some(f=>f.url!==undefined||f.size>storage.maxFileBytes)||delivery.files.reduce((n,f)=>n+f.size,0)>reservation.maxBytes)throw Error('INVALID_BAZAAR_FILES');
 }else if(delivery.files.some(f=>!f.url||f.status!=='available'||new URL(f.url).origin!==new URL(order.card.url).origin))throw Error('INVALID_EXTERNAL_FILES');
}
