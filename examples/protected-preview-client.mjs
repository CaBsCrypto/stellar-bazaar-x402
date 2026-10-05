import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {originOnly} from './private-mcp-client.mjs';

const quoted=value=>'"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\r','\\r').replaceAll('\n','\\n')+'"';
function parseEnvelope(raw){
 let offset=0,block;
 do{
  block=/^HTTP\/[\d.]+ (\d{3})[^\r\n]*\r?\n([\s\S]*?)\r?\n\r?\n/.exec(raw.slice(offset));
  if(!block)throw Error('HTTP_ENVELOPE_UNCONFIRMED');
  offset+=block[0].length;
 }while((Number(block[1])<200||block[1]==='200'&&/Connection established/i.test(block[0]))&&raw.slice(offset).startsWith('HTTP/'));
 const status=Number(block[1]),headers=new Headers();
 for(const line of block[2].split(/\r?\n/)){const colon=line.indexOf(':');if(colon>0)headers.append(line.slice(0,colon),line.slice(colon+1).trim());}
 if(status>=300&&status<400)throw Error('REDIRECT_DENIED');
 const body=raw.slice(offset);
 return new Response([204,205,304].includes(status)||!body.length?null:body,{status,headers});
}

/**
 * Protected Preview transport. Only Vercel CLI receives its account credential,
 * through child environment. Application credentials and payload travel over
 * stdin to curl, never argv or a plaintext file. No redirects or retries.
 * Hooks must persist the bounded effect manifest before allowing a request.
 */
export async function createProtectedPreviewFetch(options){
 const origin=originOnly(options.origin);
 if(!origin.startsWith('https://'))throw Error('HTTPS_REQUIRED');
 if(typeof options.cliPath!=='string'||!options.cliPath.length||typeof options.authFile!=='string'||!options.authFile.length)throw Error('PROTECTED_TRANSPORT_CONFIGURATION_REQUIRED');
 const {token}=JSON.parse((await readFile(options.authFile,'utf8')).replace(/^\uFEFF/,''));
 if(typeof token!=='string'||!token.length||/[\r\n]/.test(token))throw Error('VERCEL_AUTH_REQUIRED');
 const timeoutMs=options.timeoutMs??12000,maxBytes=options.maxResponseBytes??1048576;
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>12000||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>1048576)throw Error('INVALID_TRANSPORT_LIMIT');
 const startProcess=options.spawnProcess??spawn;
 return async(input,init={})=>{
  const request=input instanceof Request?input:undefined,url=new URL(request?request.url:String(input));
  if(url.origin!==origin||url.username||url.password||url.search||url.hash)throw Error('UNBOUND_TRANSPORT_TARGET');
  const method=String(init.method??request?.method??'GET').toUpperCase();
  if(!['GET','POST','DELETE'].includes(method))throw Error('METHOD_DENIED');
  const headers=new Headers(init.headers??request?.headers),body=init.body===undefined?(request&&method!=='GET'?await request.clone().text():''):typeof init.body==='string'?init.body:undefined;
  if(body===undefined||Buffer.byteLength(body)>65536||method==='GET'&&body)throw Error('REQUEST_BODY_DENIED');
  if(init.signal?.aborted)throw Error('TRANSPORT_ABORTED');
  const metadata={origin,path:url.pathname,method,requestBytes:Buffer.byteLength(body),payloadHash:createHash('sha256').update(body).digest('hex')};
  await options.beforeRequest?.(metadata);
  let config='';for(const [key,value]of headers){if(/[\r\n]/.test(value))throw Error('HEADER_DENIED');config+='header = '+quoted(key+': '+value)+'\n';}
  if(body)config+='data = '+quoted(body)+'\n';
  const args=[options.cliPath,'curl',url.pathname,'--deployment',origin,'--','--request',method,'--max-time',String(timeoutMs/1000),'--max-redirs','0','--retry','0','--silent','--show-error','--include','--config','-'];
  try{
   const raw=await new Promise((resolve,reject)=>{
    const child=startProcess(options.nodePath??process.execPath,args,{env:{...process.env,VERCEL_TOKEN:token,VERCEL_TELEMETRY_DISABLED:'1'},windowsHide:true,stdio:['pipe','pipe','pipe']});
    const parts=[];let bytes=0,settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);init.signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
    const stop=code=>{child.kill();finish(Error(code));},abort=()=>stop('TRANSPORT_ABORTED');
    const timer=setTimeout(()=>stop('TRANSPORT_UNCONFIRMED'),timeoutMs+1500);
    init.signal?.addEventListener('abort',abort,{once:true});
    child.stdout.on('data',part=>{bytes+=part.length;if(bytes>maxBytes)stop('RESPONSE_OVERSIZE');else parts.push(part);});
    child.stderr.on('data',()=>{}); // Never copy credential-bearing CLI diagnostics.
    child.on('error',()=>finish(Error('TRANSPORT_UNCONFIRMED')));
    child.on('close',code=>code?finish(Error('TRANSPORT_UNCONFIRMED')):finish(null,Buffer.concat(parts).toString('utf8')));
    child.stdin.on('error',()=>finish(Error('TRANSPORT_UNCONFIRMED')));
    child.stdin.end(config);
   });
   const response=parseEnvelope(raw);
   await options.onResponse?.({...metadata,status:response.status,responseBytes:Buffer.byteLength(raw)},parseEnvelope(raw));
   return response;
  }catch(error){await options.onUncertain?.({...metadata,code:error.message});throw error;}
 };
}

/**
 * One measured HTTPS request to an exact protected Preview origin. The bypass
 * is supplied from the caller's private memory and never passed to a process,
 * URL, file or measurement hook. Response bytes charge the exposed UTF-8 header
 * representation plus the streamed body; HTTP/TLS framing is not a payload.
 */
export function createAutomationPreviewFetch(options){
 const origin=originOnly(options.origin);
 if(!origin.startsWith('https://'))throw Error('HTTPS_REQUIRED');
 if(!/^[A-Za-z0-9_-]{16,256}$/.test(options.bypassSecret??''))throw Error('AUTOMATION_BYPASS_REQUIRED');
 const timeoutMs=options.timeoutMs??12000,maxBytes=options.maxResponseBytes??1048576;
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>12000||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>1048576)throw Error('INVALID_TRANSPORT_LIMIT');
 const fetchImpl=options.fetchImpl??fetch;
 if(typeof fetchImpl!=='function')throw Error('INVALID_FETCH_IMPLEMENTATION');
 return async(input,init={})=>{
  const request=input instanceof Request?input:undefined,url=new URL(request?request.url:String(input));
  if(url.origin!==origin||url.username||url.password||url.search||url.hash)throw Error('UNBOUND_TRANSPORT_TARGET');
  const method=String(init.method??request?.method??'GET').toUpperCase();
  if(!['GET','POST','DELETE'].includes(method))throw Error('METHOD_DENIED');
  const headers=new Headers(init.headers??request?.headers);
  if(headers.has('x-vercel-protection-bypass')||headers.has('x-vercel-set-bypass-cookie')||headers.has('host')||headers.has('cookie'))throw Error('TRANSPORT_HEADER_DENIED');
  const body=init.body===undefined?(request&&method!=='GET'?await request.clone().text():''):typeof init.body==='string'?init.body:undefined;
  if(body===undefined||Buffer.byteLength(body)>65536||method==='GET'&&body)throw Error('REQUEST_BODY_DENIED');
  const callerSignal=init.signal??request?.signal;
  if(callerSignal?.aborted)throw Error('TRANSPORT_ABORTED');
  const metadata={origin,path:url.pathname,method,requestBytes:Buffer.byteLength(body),payloadHash:createHash('sha256').update(body).digest('hex')};
  await options.beforeRequest?.(metadata);
  headers.set('x-vercel-protection-bypass',options.bypassSecret);
  const controller=new AbortController();let timedOut=false;
  const abort=()=>controller.abort();
  callerSignal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
  let responseHeaderBytes=0,responseBodyBytes=0,responseStatus;
  try{
   if(callerSignal?.aborted)throw Error('TRANSPORT_ABORTED');
   const response=await fetchImpl(url.href,{method,headers,...(body?{body}:{}),redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal});
   responseStatus=response.status;
   for(const[key,value]of response.headers)responseHeaderBytes+=Buffer.byteLength(key+': '+value+'\r\n');
   if(response.redirected||response.status>=300&&response.status<400)throw Error('REDIRECT_DENIED');
   if(response.url&&new URL(response.url).origin!==origin)throw Error('UNBOUND_TRANSPORT_RESPONSE');
   if(responseHeaderBytes>maxBytes)throw Error('RESPONSE_OVERSIZE');
   const parts=[];let reader;
   try{
    reader=response.body?.getReader();
    if(reader)while(true){
     const{done,value}=await reader.read();if(done)break;
     responseBodyBytes+=value.byteLength;
     if(responseBodyBytes+responseHeaderBytes>maxBytes)throw Error('RESPONSE_OVERSIZE');
     parts.push(Buffer.from(value));
    }
   }catch(error){await reader?.cancel().catch(()=>{});throw error;}finally{reader?.releaseLock();}
   if(controller.signal.aborted)throw Error(timedOut?'TRANSPORT_UNCONFIRMED':'TRANSPORT_ABORTED');
   const responseBody=[204,205,304].includes(response.status)||!responseBodyBytes?null:Buffer.concat(parts),responseInit={status:response.status,statusText:response.statusText,headers:response.headers};
   const result=new Response(responseBody,responseInit);
   // An independent snapshot avoids coupling a caller's body.cancel() to an
   // unread hook clone (MCP explicitly cancels accepted notifications).
   await options.onResponse?.({...metadata,status:response.status,responseBytes:responseBodyBytes+responseHeaderBytes,responseBodyBytes,responseHeaderBytes},new Response(responseBody,responseInit));
   return result;
  }catch(error){
   const allowed=new Set(['REDIRECT_DENIED','UNBOUND_TRANSPORT_RESPONSE','RESPONSE_OVERSIZE','TRANSPORT_ABORTED','TRANSPORT_UNCONFIRMED']);
   const code=controller.signal.aborted?(timedOut?'TRANSPORT_UNCONFIRMED':'TRANSPORT_ABORTED'):allowed.has(error?.message)?error.message:'TRANSPORT_UNCONFIRMED';
   // Partial observed bytes remain measurable even when a read is lost or an
   // oversized chunk is rejected. They do not certify the complete response.
   await options.onUncertain?.({...metadata,code,...(responseStatus===undefined?{}:{status:responseStatus}),responseBytes:responseBodyBytes+responseHeaderBytes,responseBodyBytes,responseHeaderBytes});
   throw Error(code);
  }finally{clearTimeout(timer);callerSignal?.removeEventListener('abort',abort);}
 };
}

/** Serialize hooks, transport and body reads, including background MCP GETs. */
export function serializePreviewFetch(fetcher){
 if(typeof fetcher!=='function')throw Error('INVALID_FETCH_IMPLEMENTATION');
 let tail=Promise.resolve();
 return (input,init={})=>{
  const execute=()=>{
   const signal=init.signal??(input instanceof Request?input.signal:undefined);
   if(signal?.aborted)throw Error('TRANSPORT_ABORTED');
   return fetcher(input,init);
  };
  const result=tail.then(execute);
  // This settles only the queue gate. The original result rejects to its caller.
  tail=result.then(()=>undefined,()=>undefined);
  return result;
 };
}

export async function withProtectedPrivateMcp(origin,token,fetcher,action){
 const endpoint=new URL('/api/mcp',originOnly(origin));
 if(!/^[A-Za-z0-9_-]{43}$/.test(token??''))throw Error('AGENT_ACCESS_REQUIRED');
 const client=new Client({name:'bazaar-protected-external-seller',version:'1'});
 const transport=new StreamableHTTPClientTransport(endpoint,{requestInit:{headers:{authorization:'Bearer '+token}},fetch:fetcher,reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1}});
 try{await client.connect(transport);return await action(client);}finally{await client.close().catch(()=>{});}
}
