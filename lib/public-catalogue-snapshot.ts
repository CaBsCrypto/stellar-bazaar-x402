import {createHash} from 'node:crypto';
import publication from './public-catalogue-snapshot.json';
import {canonicalizeServiceCard,computeCanonicalServiceCardHash} from './canonical-service-card.ts';
import {parseServiceCardShape} from './service-card-schema.ts';
import {marketplacePurchaseDescriptor} from './marketplace-discovery.ts';
import {rankServices} from './discovery.ts';
import {toPaidService} from './service-card.ts';
import type {ServiceCard} from './types.ts';

type Record = {submissionId:string;card:ServiceCard;cardHash:string;execution:'seller-mcp-task';status:'activated'};
type Publication = {version:'bazaar.public-catalogue-snapshot/v1';asOf:string;publishedAt:string;services:Record[]};
type Page = {limit?:number;cursor?:string};
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const canonical=(v:unknown)=>JSON.stringify(canonicalizeServiceCard(v));
const fail=()=>{throw Error('PUBLIC_SNAPSHOT_INPUT_INVALID');};
const exact=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.sort().join(',');
const iso=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;

/** This is an explicit publication artifact, not a live Redis cache. Removing or
 * replacing a reviewed card requires publishing a new artifact/deployment.
 * Financial handlers never read this module or trust its historical status. */
export function createPublicCatalogueSnapshot(input:unknown){
 if(!exact(input,['version','asOf','publishedAt','services']))fail();
 const p=input as Publication;
 if(p.version!=='bazaar.public-catalogue-snapshot/v1'||!iso(p.asOf)||!iso(p.publishedAt)||Date.parse(p.asOf)>Date.parse(p.publishedAt)||!Array.isArray(p.services)||p.services.length>20||Buffer.byteLength(canonical(p))>64*1024)fail();
 const ids=new Set<string>();
 for(const r of p.services){
  if(!exact(r,['submissionId','card','cardHash','execution','status'])||!/^[-a-f0-9]{36}$/.test(r.submissionId)||r.execution!=='seller-mcp-task'||r.status!=='activated'||!/^[a-f0-9]{64}$/.test(r.cardHash)||!parseServiceCardShape(r.card).ok||computeCanonicalServiceCardHash(r.card)!==r.cardHash||ids.has(r.card.id))fail();
  ids.add(r.card.id);
 }
 const saved=structuredClone(p),revision=hash(canonical(saved));
 const metadata=()=>({version:saved.version,revision,asOf:saved.asOf,publishedAt:saved.publishedAt,source:'reviewed-publication-artifact' as const,liveAvailabilityVerified:false as const,purchaseAdmissionVerified:false as const,refresh:'publish-new-reviewed-artifact' as const});
 function dto(r:Record,origin:string){return {...structuredClone(r.card),submissionId:r.submissionId,cardHash:r.cardHash,execution:r.execution,status:r.status,statusAsOf:saved.asOf,liveAvailabilityVerified:false as const,purchaseAdmissionVerified:false as const,availability:{verified:false,reason:'LIVE_CHECK_REQUIRED' as const},purchase:marketplacePurchaseDescriptor(r.card,origin)};}
 function resource(r:Record,origin:string){const {submissionId,cardHash,execution,status,statusAsOf,liveAvailabilityVerified,purchaseAdmissionVerified,availability,purchase,...card}=dto(r,origin);return {resource:card,submissionId,cardHash,execution,status,statusAsOf,liveAvailabilityVerified,purchaseAdmissionVerified,availability,purchase};}
 function page<T>(rows:T[],options:Page,scope:string){
  const limit=options.limit??10;if(!Number.isSafeInteger(limit)||limit<1||limit>20)fail();let offset=0;
  if(options.cursor!==undefined){const raw=options.cursor;if(typeof raw!=='string'||raw.length>512||!/^[A-Za-z0-9_-]+$/.test(raw))fail();let c;try{const b=Buffer.from(raw,'base64url');if(b.toString('base64url')!==raw)fail();c=JSON.parse(b.toString());}catch{fail();}if(!exact(c,['version','revision','scope','offset'])||c.version!==1||c.revision!==revision||c.scope!==scope||!Number.isSafeInteger(c.offset)||c.offset<0||c.offset>rows.length)fail();offset=c.offset;}
  const items=rows.slice(offset,offset+limit),next=offset+items.length,more=next<rows.length;
  return {items,nextCursor:more?Buffer.from(JSON.stringify({version:1,revision,scope,offset:next})).toString('base64url'):null,partialResults:more};
 }
 return Object.freeze({
  metadata,
  list(options:Page,origin:string){const p=page(saved.services,options,'list');return {services:p.items.map(r=>dto(r,origin)),nextCursor:p.nextCursor,partialResults:p.partialResults,snapshot:metadata()};},
  search(query:string,options:Page,origin:string){
   if(typeof query!=='string'||!query.trim()||query.length>200)fail();const normalized=query.trim(),matches=rankServices(saved.services.map(r=>toPaidService(r.card)),normalized),byId=new Map(saved.services.map(r=>[r.card.id,r])),p=page(matches,options,'search:'+hash(normalized.toLowerCase().normalize('NFC')));
   return {query:normalized,ranking:'bounded-lexical-public-snapshot/v1',results:p.items.map(m=>({...resource(byId.get(m.service.id)!,origin),score:m.score,reasons:m.reasons})),nextCursor:p.nextCursor,partialResults:p.partialResults,snapshot:metadata()};
  },
  get(id:string,origin:string){if(typeof id!=='string'||!id||id.length>128)fail();const r=saved.services.find(r=>r.card.id===id);return r?{...resource(r,origin),snapshot:metadata()}:undefined;},
 });
}
export const publicCatalogueSnapshot=createPublicCatalogueSnapshot(publication);
