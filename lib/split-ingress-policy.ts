import {SPLIT_READ_REDIS_WIRE_BYTES} from './split-read-wire-bounds.mjs';
// Exposure and accounting only. No route, query, flag or budget grants authority.
const prefix='/api/market/split-v1';
const excluded=new Set(['31c97193-be74-4b9d-b0a3-f3890b0a41e8','ed6c4530-e76f-49e0-8f39-5ec8578820e2']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export type SplitAction='terms'|'context'|'history'|'create'|'capacity'|'read'|'challenge'|'settle'|'reconcile'|'delivery-read'|'delivery-write'|'treasury-binding-read'|'treasury-binding-write';
export type SplitWorkload=`split-${SplitAction}`;
const MiB=1048576;
// Conservative enforcement ceilings, not measurements or an admission forecast.
// A reviewed complete-flow measurement must include every call and safety margin.
const bounds={terms:[96,SPLIT_READ_REDIS_WIRE_BYTES.terms],context:[96,SPLIT_READ_REDIS_WIRE_BYTES.context],history:[96,SPLIT_READ_REDIS_WIRE_BYTES.history],create:[8192,64*MiB],capacity:[4096,32*MiB],read:[2048,16*MiB],challenge:[4096,32*MiB],settle:[8192,96*MiB],reconcile:[8192,64*MiB],'delivery-read':[2048,16*MiB],'delivery-write':[4096,32*MiB],'treasury-binding-read':[2048,16*MiB],'treasury-binding-write':[4096,32*MiB]} as const;
export function splitIngress(path:string,method:string){
 let action:SplitAction|undefined,operationId:string|undefined;
 if(path===prefix+'/terms'&&method==='GET')action='terms';
 if(path===prefix+'/context'&&method==='GET')action='context';
 if(path===prefix+'/history'&&method==='GET')action='history';
 if(path===prefix+'/orders'&&method==='POST')action='create';
 if(path===prefix+'/seller-capacity'&&method==='POST')action='capacity';
 if(path===prefix+'/treasury-binding'&&['GET','POST'].includes(method))action=method==='GET'?'treasury-binding-read':'treasury-binding-write';
 if(path.startsWith(prefix+'/orders/')){
  const parts=path.slice((prefix+'/orders/').length).split('/');
  if(!uuid.test(parts[0])||excluded.has(parts[0]))return;
  operationId=parts[0];
  if(parts.length===1&&method==='GET')action='read';
  if(parts.length===2&&['challenge','settle','reconcile'].includes(parts[1])&&method==='POST')action=parts[1] as SplitAction;
  if(parts.length===2&&parts[1]==='delivery'&&['GET','POST'].includes(method))action=method==='GET'?'delivery-read':'delivery-write';
 }
 if(!action)return;
 const profile=action==='create'||action==='capacity'||action==='treasury-binding-write'?'authenticated' as const:'recovery' as const;
 const [commands,wireBytes]=bounds[action];
 return {action,operationId,profile,newOperation:profile==='authenticated',workload:`split-${action}` as SplitWorkload,
  bodyBytes:action==='reconcile'?2:action==='challenge'?128:action==='capacity'?2048:action==='treasury-binding-write'?512:49152,
  control:{commands,wireBytes},
  envelope:{redis:['context','terms','history'].includes(action)?action==='history'?12:10:commands,commandsUpperBound:commands,outboundPayloadBytes:wireBytes,inboundPayloadBytes:wireBytes,
   dtoBytes:128*1024,externalRequests:['context','terms','history'].includes(action)?0:8,externalOutboundBytes:['context','terms','history'].includes(action)?0:512*1024,externalInboundBytes:['context','terms','history'].includes(action)?0:1024*1024}};
}
export function splitIngressEnabled(){return process.env.BAZAAR_ENABLE_MARKETPLACE==='true'&&process.env.BAZAAR_SPLIT_HTTP_ENABLED==='true';}
export function splitHistoryQueryValid(params:URLSearchParams){
 if([...params.keys()].some(k=>!['limit','cursor'].includes(k)||params.getAll(k).length!==1)||params.get('limit')!=='1')return false;
 const cursor=params.get('cursor');return cursor===null||cursor.length<=2800&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(cursor);
}
export function splitWorkloadEnvelope(workload:string|undefined){
 if(!workload?.startsWith('split-'))return;
 const action=workload.slice(6) as SplitAction;if(!Object.hasOwn(bounds,action))return;
 const [commands,wireBytes]=bounds[action];
 return {redis:commands,commandsUpperBound:commands,outboundPayloadBytes:wireBytes,inboundPayloadBytes:wireBytes,dtoBytes:128*1024,externalRequests:8,externalOutboundBytes:512*1024,externalInboundBytes:1024*1024};
}


/** This release exposes three private reads only. Financial writes and metadata binding remain unavailable through the proxy. */
export function splitReadonlyIngress(path:string,method:string){const s=splitIngress(path,method);return splitIngressEnabled()&&s&&['context','terms','history'].includes(s.action)&&method==='GET'?s:undefined;}

export const SPLIT_READ_PIPELINE_LIMITS=Object.freeze({
 context:Object.freeze({requests:10,commands:96,wireBytes:SPLIT_READ_REDIS_WIRE_BYTES.context,responseBytes:16384,httpAllowanceBytes:131072,externalRequests:0}),
 terms:Object.freeze({requests:10,commands:96,wireBytes:SPLIT_READ_REDIS_WIRE_BYTES.terms,responseBytes:16384,httpAllowanceBytes:131072,externalRequests:0}),
 history:Object.freeze({requests:12,commands:96,wireBytes:SPLIT_READ_REDIS_WIRE_BYTES.history,responseBytes:16384,httpAllowanceBytes:131072,externalRequests:0}),
});
