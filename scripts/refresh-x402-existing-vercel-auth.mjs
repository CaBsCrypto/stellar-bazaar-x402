import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const output=resolve('docs/evidence/sprint-x402-agent/existing-vercel-auth-refresh-20261005-02.json');
const authPath=join(tmpdir(),'bazaar-vercel-auth-preview','auth.json');
const policy={scope:'renew-existing-vercel-cli-session',issuer:'https://vercel.com',discovery:'/.well-known/openid-configuration',
  tokenEndpoint:'https://api.vercel.com/login/oauth/token',clientId:'cl_HYyOPBNtFMfHhaUn9L4QPfTZz6TP47bp',maxCalls:2,maxRequestBytes:16384,maxResponseBytes:32768,
  redirects:0,retries:0,timeoutMs:10000,resourceMutations:0,payments:0};
const report={status:'PENDING',policy,startedAt:new Date().toISOString(),counters:{controlApiRequests:0,outBytes:0,inBytes:0},attempts:[]};
const persist=()=>writeFile(output,JSON.stringify(report,null,2)+'\n',{flush:true});
async function bounded(url,method,body){
  const headers=new Headers({'user-agent':'Vercel CLI existing-session renewal','accept':'application/json',...(body?{'content-type':'application/x-www-form-urlencoded'}:{})});
  const outgoing=Buffer.byteLength(`${method} ${url.pathname}${url.search}\r\nhost: ${url.host}\r\n`)+Array.from(headers).reduce((n,[k,v])=>n+Buffer.byteLength(`${k}: ${v}\r\n`),2)+Buffer.byteLength(body??'');
  if(outgoing>policy.maxRequestBytes||report.attempts.length>=2)throw Error('BOUND');
  const entry={method,origin:url.origin,path:url.pathname,status:'PENDING'};report.attempts.push(entry);report.counters.controlApiRequests++;report.counters.outBytes+=outgoing;report.counters.inBytes+=policy.maxResponseBytes;await persist();
  let observed=0;
  try{
    const response=await fetch(url,{method,body,headers,redirect:'error',signal:AbortSignal.timeout(policy.timeoutMs)});
    observed=Array.from(response.headers).reduce((n,[k,v])=>n+Buffer.byteLength(`${k}: ${v}\r\n`),Buffer.byteLength(`HTTP/1.1 ${response.status} ${response.statusText}\r\n\r\n`));
    if(observed>policy.maxResponseBytes){await response.body?.cancel();throw Error('BOUND');}
    const chunks=[],reader=response.body?.getReader();if(reader)for(;;){const next=await reader.read();if(next.done)break;observed+=next.value.byteLength;if(observed>policy.maxResponseBytes){await reader.cancel();throw Error('BOUND');}chunks.push(Buffer.from(next.value));}
    const bytes=Buffer.concat(chunks);entry.httpStatus=response.status;entry.status=response.ok?'COMPLETE':'REJECTED';entry.inBytes=observed;entry.responseSHA256=createHash('sha256').update(bytes).digest('hex');report.counters.inBytes-=policy.maxResponseBytes-observed;await persist();
    if(!response.ok)throw Error('REJECTED');return JSON.parse(bytes.toString('utf8'));
  }catch{if(entry.status==='PENDING'){entry.status='UNCERTAIN';entry.partialResponseBytes=observed;report.counters.inBytes+=Math.max(0,observed-policy.maxResponseBytes);}await persist();throw Error('STOPPED_NO_RETRY');}
}
async function main(){
  await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',flush:true});
  const auth=JSON.parse(await readFile(authPath,'utf8'));
  if(typeof auth.refreshToken!=='string'||!auth.refreshToken||auth.refreshToken.length>8192||/[\r\n\0]/.test(auth.refreshToken))throw Error('AUTH_UNAVAILABLE');
  const discovery=await bounded(new URL(policy.discovery,policy.issuer),'GET');
  if(discovery.issuer!==policy.issuer&&discovery.issuer!==policy.issuer+'/')throw Error('ISSUER_MISMATCH');
  const endpoint=new URL(discovery.token_endpoint);
  if(endpoint.href!==policy.tokenEndpoint)throw Error('ENDPOINT_MISMATCH');
  const body=new URLSearchParams({client_id:policy.clientId,grant_type:'refresh_token',refresh_token:auth.refreshToken}).toString();
  const tokens=await bounded(endpoint,'POST',body);
  if(typeof tokens.access_token!=='string'||tokens.access_token.length>4096||/[\r\n\0]/.test(tokens.access_token)||tokens.token_type!=='Bearer'||!Number.isSafeInteger(tokens.expires_in)||tokens.expires_in<=0||tokens.expires_in>604800)throw Error('RESPONSE_SCHEMA');
  const updated={...auth,token:tokens.access_token,expiresAt:Math.floor(Date.now()/1000)+tokens.expires_in};
  if(tokens.refresh_token!==undefined){if(typeof tokens.refresh_token!=='string'||!tokens.refresh_token||tokens.refresh_token.length>8192)throw Error('RESPONSE_SCHEMA');updated.refreshToken=tokens.refresh_token;}
  await writeFile(authPath,JSON.stringify(updated,null,2)+'\n',{flush:true,mode:0o600});
  report.status='EXISTING_CLI_SESSION_RENEWED';report.completedAt=new Date().toISOString();await persist();console.log(JSON.stringify({status:report.status,counters:report.counters,resourceMutations:0,payments:0}));
}
main().catch(async()=>{report.status='STOPPED_NO_RETRY';try{await persist();}catch{}console.error(JSON.stringify({status:report.status}));process.exitCode=1;});
