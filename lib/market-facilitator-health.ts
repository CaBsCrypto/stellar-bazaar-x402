import {meteredExternal} from './acceptance-meter.ts';

const endpoint='https://channels.openzeppelin.com/x402/testnet';
export type FacilitatorHealth={status:'available'|'unavailable'|'unknown'|'configuration-incomplete';network:'stellar:testnet';protocolAdvertised:boolean;credentialValidated:false;httpStatus?:number;retryAfter?:number;code?:'FACILITATOR_CONFIGURATION_INCOMPLETE'|'FACILITATOR_HTTP_REJECTED'|'FACILITATOR_PROTOCOL_UNCONFIRMED'|'FACILITATOR_TRANSPORT_UNCONFIRMED';observedAt:string};

/** Private operator observation. This never verifies, signs or settles a payment.
 * A public supported endpoint can ignore credentials, so 200 is not key proof. */
export async function inspectMarketFacilitatorConfiguration(options:{apiKey?:string;url?:string;fetcher?:typeof fetch;now?:()=>number}={}):Promise<FacilitatorHealth>{
 const apiKey=options.apiKey??process.env.STELLAR_X402_FACILITATOR_API_KEY?.trim()??'',url=options.url??process.env.STELLAR_X402_FACILITATOR_URL??endpoint,fetcher=options.fetcher??fetch;
 const result:FacilitatorHealth={status:'unknown',network:'stellar:testnet',protocolAdvertised:false,credentialValidated:false,observedAt:new Date((options.now??Date.now)()).toISOString()};
 if(url!==endpoint||!apiKey||apiKey.length>1024||/[\r\n]/.test(apiKey))return {...result,status:'configuration-incomplete',code:'FACILITATOR_CONFIGURATION_INCOMPLETE'};
 try{
  const r=await meteredExternal('facilitator',()=>fetcher(endpoint+'/supported',{method:'GET',headers:{authorization:'Bearer '+apiKey,accept:'application/json'},redirect:'manual',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(5000)}),0);
  if(r.redirected||r.url&&r.url!==endpoint+'/supported'||r.headers.has('location')){await r.body?.cancel();return {...result,code:'FACILITATOR_TRANSPORT_UNCONFIRMED'};}
  result.httpStatus=r.status;
  if(r.status!==200){const retry=r.headers.get('retry-after');await r.body?.cancel();return {...result,status:'unavailable',code:'FACILITATOR_HTTP_REJECTED',...(retry&&/^\d{1,4}$/.test(retry)&&Number(retry)<=3600?{retryAfter:Number(retry)}:{})};}
  const parts:Uint8Array[]=[],reader=r.body?.getReader();let size=0;
  try{if(reader)for(;;){const b=await reader.read();if(b.done)break;size+=b.value.length;if(size>32768){await reader.cancel();return {...result,code:'FACILITATOR_PROTOCOL_UNCONFIRMED'};}parts.push(b.value);}}finally{reader?.releaseLock();}
  const body=JSON.parse(Buffer.concat(parts).toString('utf8'));
  if(!Array.isArray(body?.kinds)||body.kinds.length>32||!body.kinds.some((kind:Record<string,unknown>)=>kind?.x402Version===2&&kind.network==='stellar:testnet'&&kind.scheme==='exact'))return {...result,code:'FACILITATOR_PROTOCOL_UNCONFIRMED'};
  return {...result,status:'available',protocolAdvertised:true};
 }catch{return {...result,code:'FACILITATOR_TRANSPORT_UNCONFIRMED'};}
}
