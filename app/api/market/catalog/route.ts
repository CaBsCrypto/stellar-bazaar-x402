import { measuredHandler } from '../../../../lib/acceptance-meter.ts';
import { marketHandlers } from '../../../../lib/marketplace-http.ts';
import {publicCatalogueSnapshot} from '../../../../lib/public-catalogue-snapshot.ts';
import {workspacePublicOrigin} from '../../../../lib/workspace-public-origin.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The default native route remains authoritative and keeps its existing meter,
// ingress, schema and compatibility. The explicit anonymous UI view is public
// publication data only; selecting it never changes private financial guards.
const nativeGET = measuredHandler(marketHandlers.catalog);
const publishedHeaders={'Cache-Control':'private, no-store',Vary:'X-Bazaar-Catalogue-View, Authorization','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Bazaar-Redis-Requests':'0','X-Bazaar-Redis-Commands-Upper-Bound':'0','X-Bazaar-Redis-Outbound-Payload-Bytes':'0','X-Bazaar-Redis-Inbound-Payload-Bytes':'0','X-Bazaar-Redis-Uncertain':'false'};
function publishedGET(request:Request){
 const denied=(status=400)=>Response.json({error:{code:'INVALID_PUBLISHED_CATALOGUE_REQUEST'}},{status,headers:publishedHeaders});
 if(request.headers.has('authorization')||!['GET','HEAD'].includes(request.method))return denied();
 if(Buffer.byteLength(JSON.stringify([...request.headers]))>32*1024)return denied(431);
 try{
  const url=new URL(request.url),configured=workspacePublicOrigin()??'https://bazaar.browns.studio',expected=new URL(configured),origin=request.headers.get('origin'),params=url.searchParams;
  if(expected.origin!==configured||expected.username||expected.password||expected.search||expected.hash||(expected.protocol!=='https:'&&!(expected.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(expected.hostname)))||url.origin!==expected.origin||url.pathname!=='/api/market/catalog'||url.hash||url.username||url.password||origin!==null&&origin!==expected.origin||url.search.length>4096||[...params.keys()].some(k=>!['limit','cursor','q'].includes(k)||params.getAll(k).length!==1))return denied();
  const rawLimit=params.get('limit'),cursor=params.get('cursor'),q=params.get('q');
  if(rawLimit!==null&&(!/^[1-9]\d?$/.test(rawLimit)||Number(rawLimit)>20)||cursor!==null&&(!/^[a-zA-Z0-9_-]{1,512}$/.test(cursor)||Buffer.byteLength(cursor)>512)||q!==null&&q.length>200)return denied();
  const options={limit:rawLimit===null?10:Number(rawLimit),...(cursor?{cursor}:{})};
  const page=q?.trim()?publicCatalogueSnapshot.search(q,options,url.origin):publicCatalogueSnapshot.list(options,url.origin);
  const services='results' in page?page.results.map(({resource,...metadata})=>({card:resource,...metadata})):page.services.map(({submissionId,cardHash,execution,status,statusAsOf,liveAvailabilityVerified,purchaseAdmissionVerified,availability,purchase,...card})=>({submissionId,card,cardHash,execution,status,statusAsOf,liveAvailabilityVerified,purchaseAdmissionVerified,availability,purchase}));
  const result={version:'bazaar.published-market-catalogue/v1',services,nextCursor:page.nextCursor,partialResults:page.partialResults,catalogueSnapshot:page.snapshot,...('query' in page?{query:page.query,ranking:page.ranking}:{})};
  if(Buffer.byteLength(JSON.stringify(result))>256*1024)return denied(503);
  return Response.json(result,{headers:{...publishedHeaders,'X-Bazaar-Public-Catalogue-Revision':page.snapshot.revision}});
 }catch{return denied();}
}
export function GET(request:Request){return request.headers.get('x-bazaar-catalogue-view')==='published'?publishedGET(request):nativeGET(request);}
