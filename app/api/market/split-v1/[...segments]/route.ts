import {splitNativeHandlers} from '../../../../../lib/commission/v1/native/runtime.ts';
import {measuredHandler} from '../../../../../lib/acceptance-meter.ts';
import {treasuryNativeHandlers} from '../../../../../lib/commission/v1/native/treasury-runtime.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{segments:string[]}>};
async function dispatch(request:Request,context:Context){
 const {segments}=await context.params;
 const path=segments.join('/'),method=request.method;
 if(path==='treasury-binding'&&method==='GET')return treasuryNativeHandlers.GET(request);
 if(path==='treasury-binding'&&method==='POST')return treasuryNativeHandlers.POST(request);
 if(path==='terms'&&method==='GET')return splitNativeHandlers.terms(request);
 if(path==='context'&&method==='GET')return splitNativeHandlers.context(request);
 if(path==='orders'&&method==='POST')return splitNativeHandlers.create(request);
 if(path==='history'&&method==='GET')return splitNativeHandlers.history(request);
 if(path==='seller-capacity'&&method==='POST')return splitNativeHandlers.sellerCapacity(request);
 if(segments[0]==='orders'&&segments.length>=2&&segments.length<=3){
  const id=segments[1],action=segments[2];
  if(!action&&method==='GET')return splitNativeHandlers.order(request,id);
  if(action==='challenge'&&method==='POST')return splitNativeHandlers.challenge(request,id);
  if(action==='settle'&&method==='POST')return splitNativeHandlers.settle(request,id);
  if(action==='reconcile'&&method==='POST')return splitNativeHandlers.reconcile(request,id);
  if(action==='delivery'&&method==='POST')return splitNativeHandlers.deliver(request,id);
  if(action==='delivery'&&method==='GET')return splitNativeHandlers.delivery(request,id);
 }
 return Response.json({error:{code:'NOT_FOUND'}},{status:404,headers:{'Cache-Control':'private, no-store'}});
}
export const GET=measuredHandler(dispatch);
export const POST=measuredHandler(dispatch);

