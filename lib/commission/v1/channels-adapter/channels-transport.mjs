/** Wire-equivalent to reviewed ChannelsClient direct mode; no SDK retry/redirect defaults. */
const ENDPOINT='https://channels.openzeppelin.com/testnet/';
const need=(ok,code)=>{if(!ok)throw new Error(code);};
function deadline(promise,signal){return new Promise((resolve,reject)=>{if(signal.aborted){reject(Error('CHANNELS_TIMEOUT'));return;}const stop=()=>reject(Error('CHANNELS_TIMEOUT'));signal.addEventListener('abort',stop,{once:true});Promise.resolve(promise).then(v=>{signal.removeEventListener('abort',stop);resolve(v);},()=>{signal.removeEventListener('abort',stop);reject(Error('CHANNELS_TRANSPORT_FAILED'));});});}
export function createChannelsTransport({enabled=false,apiKey,fetcher,admit,beforeDispatch,timeoutMs=10000}={}) {
 return Object.freeze({async submitSorobanTransaction(packet){
  need(enabled===true,'CHANNELS_TRANSPORT_DISABLED');
  need(typeof apiKey==='string'&&apiKey.length>0&&apiKey.length<=1024&&!/[\r\n]/.test(apiKey)&&typeof fetcher==='function'&&typeof admit==='function'&&typeof beforeDispatch==='function','CHANNELS_TRANSPORT_NOT_CONFIGURED');
  need(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=10000,'CHANNELS_TIMEOUT_INVALID');
  const copied=structuredClone(packet);
  need(copied&&Object.keys(copied).sort().join(',')==='auth,func'&&typeof copied.func==='string'&&Array.isArray(copied.auth)&&copied.auth.length===1&&typeof copied.auth[0]==='string','CHANNELS_PACKET_INVALID');
  const frozenPacket=Object.freeze({func:copied.func,auth:Object.freeze([...copied.auth])});
  const body=JSON.stringify({params:frozenPacket});
  need(Buffer.byteLength(body)<=65536,'CHANNELS_REQUEST_BOUND');
  const signal=AbortSignal.timeout(timeoutMs);
  need(await deadline(admit({endpoint:ENDPOINT,method:'POST',outboundBytes:Buffer.byteLength(body)+apiKey.length+256,maximumInboundBytes:131072,maximumAttempts:1}),signal)===true,'CHANNELS_BUDGET_NOT_ADMITTED');
  need(await deadline(beforeDispatch(frozenPacket),signal)===true,'CHANNELS_FRESH_AUTHORIZATION_REQUIRED');
  signal.throwIfAborted();
  // Caller journals the claim before entering this function. A thrown result is uncertain, never retryable here.
  const response=await deadline(fetcher(ENDPOINT,{method:'POST',body,headers:{'content-type':'application/json',authorization:'Bearer '+apiKey},redirect:'error',credentials:'omit',cache:'no-store',signal}),signal);
  need(!response.redirected&&(!response.url||response.url===ENDPOINT),'CHANNELS_REDIRECT_BLOCKED');
  need(response.headers.get('content-type')?.split(';')[0].trim()==='application/json','CHANNELS_CONTENT_TYPE_INVALID');
  let size=0;for(const[k,v]of response.headers)size+=Buffer.byteLength(k+': '+v+'\r\n');
  need(size<=131072&&response.body,'CHANNELS_RESPONSE_BOUND');
  const reader=response.body.getReader(),parts=[];
  try{for(;;){const part=await deadline(reader.read(),signal);if(part.done)break;size+=part.value.byteLength;if(size>131072){void reader.cancel().catch(()=>{});throw new Error('CHANNELS_RESPONSE_BOUND');}parts.push(Buffer.from(part.value));}}finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
  need(response.ok,'CHANNELS_HTTP_REJECTED');
  let json;try{json=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new Error('CHANNELS_JSON_INVALID');}
  need(json&&json.success===true&&json.data&&typeof json.data.transactionId==='string'&&json.data.transactionId.length>0&&json.data.transactionId.length<=128&&typeof json.data.hash==='string'&&/^[a-f0-9]{64}$/.test(json.data.hash),'CHANNELS_ACK_INVALID');
  // Unknown metadata, traces, logs and protected fields never escape this boundary.
  return {transactionId:json.data.transactionId,hash:json.data.hash};
 }});
}
