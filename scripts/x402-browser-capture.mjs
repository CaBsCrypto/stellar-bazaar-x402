import {createHash} from 'node:crypto';

const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const natural=value=>Number.isSafeInteger(value)&&value>=0;
const safeUrl=raw=>{const u=new URL(raw);return {origin:u.origin,path:u.pathname,urlHash:digest(raw)};};
const numericMap=value=>new Map(Object.entries(value??{}).map(([name,id])=>[String(id),name]));
const eventName=(event,map)=>typeof event.type==='string'?event.type:map.get(String(event.type));
const headersUpper=(headers,start)=>{if(!Array.isArray(headers)||headers.some(h=>typeof h.name!=='string'||typeof h.value!=='string'))return null;return Buffer.byteLength(start+'\r\n'+headers.map(h=>h.name+': '+h.value+'\r\n').join('')+'\r\n');};

/** Raw HAR/NetLog are private input only. Output includes no headers, bodies, queries, fragments or raw events. */
export function analyseBrowserCapture({har,netlog,session,fixture}) {
 const failures=[],fail=code=>failures.push(code),report={version:1,status:'FAIL_CAPTURE',captureComplete:false,physicalWireObserved:false,coverageScope:'entire-isolated-browser-network-stack-session',segmentId:session?.segmentId,sha256:{har:digest(har),netlog:digest(netlog),session:digest(session??null)},failures,requests:[],totals:{httpRequests:0,httpRequestBodyBytes:0,httpResponseBodyBytes:0,httpHeaderBytesUpperBound:0,browserOutboundBytesUpperBound:0,browserInboundBytesUpperBound:0},coverage:{httpRedirects:0,httpRetries:null,partialResponses:0,sseResponses:0,websocketUpgrades:0,socketByteEvents:0,connectionAttempts:0,sslByteEventsExcluded:0,quicSupported:false},limitation:'Socket byte counts conservatively include protocol/TLS overhead. SSL byte events are not added again. OS/TCP packet retransmissions are outside this HTTP payload scope. Completeness requires the actual capture, not this parser or a server ledger alone.'};
 if(session?.version!==1||!/^[a-f0-9-]{36}$/.test(session?.segmentId??''))fail('SESSION_ID_REQUIRED');
 if(!['native-browser-capture','parser-fixture'].includes(session?.evidenceKind))fail('CAPTURE_PROVENANCE_REQUIRED');
 if(session?.scope!=='entire-isolated-browser-network-stack-session'||session?.exclusiveBrowserInstance!==true||session?.startedBeforeFirstNavigation!==true||session?.stoppedAfterNetworkQuiet!==true)fail('SESSION_BOUNDARY_NOT_CONFIRMED');
 if(typeof session?.browserVersion!=='string'||!session.browserVersion)fail('BROWSER_VERSION_REQUIRED');
 if(session?.evidenceKind==='native-browser-capture'){
  const info=netlog?.constants?.clientInfo;if(!info||!/Chrome|Chromium/i.test(info.name??'')||info.version!==session.browserVersion)fail('NETLOG_NATIVE_BROWSER_IDENTITY_REQUIRED');
 }
 if(!natural(session?.maxHttpRequests)||!natural(session?.maxOutboundBytes)||!natural(session?.maxInboundBytes))fail('FROZEN_CAPTURE_LIMITS_REQUIRED');
 if(!fixture&&session?.evidenceKind==='native-browser-capture'){
  const binding=session.binding;
  if(!binding||!/^[a-f0-9-]{36}$/.test(binding.planId??'')||!/^[a-f0-9]{40}$/.test(binding.sourceSha??'')||!/^dpl_[A-Za-z0-9]+$/.test(binding.deploymentId??''))fail('HOSTED_CAPTURE_BINDING_REQUIRED');
  let origin;try{origin=new URL(binding.origin);}catch{}if(!origin||origin.protocol!=='https:'||origin.href!==origin.origin+'/')fail('HOSTED_CAPTURE_ORIGIN_REQUIRED');
  if(binding)report.binding={planId:binding.planId,sourceSha:binding.sourceSha,deploymentId:binding.deploymentId,origin:origin?.origin??binding.origin};
 }
 const entries=har?.log?.entries;if(!Array.isArray(entries)||!entries.length)fail('HAR_ENTRIES_REQUIRED');
 if(!Array.isArray(netlog?.events)||!netlog.events.length||!netlog?.constants)fail('NETLOG_EVENTS_CONSTANTS_REQUIRED');
 const eventTypes=numericMap(netlog?.constants?.logEventTypes),sourceTypes=numericMap(netlog?.constants?.logSourceType??netlog?.constants?.logSourceTypes);
 const jobs=[],sources=new Map(),dependencies=new Map();let sent=0,received=0,hasSent=false,hasReceived=false,restartEvents=0,websocketFrameEvents=0;
 const tickOffset=Number(netlog?.constants?.timeTickOffset),hasClockOffset=Number.isFinite(tickOffset)&&netlog?.constants?.timeTickOffset!==undefined;
 for(const event of netlog?.events??[]){
  const name=eventName(event,eventTypes),params=event.params??{},id=event.source?.id;
  if(!name){fail('UNKNOWN_NETLOG_EVENT_TYPE');continue;}
  if(!natural(id)){fail('NETLOG_SOURCE_ID_REQUIRED');continue;}
  const source=sources.get(id)??{type:sourceTypes.get(String(event.source?.type))??event.source?.type,jobs:[],readBytes:0,readObserved:false,endObserved:false,netError:0,sentBytes:0,receivedBytes:0,sentObserved:false,receivedObserved:false};sources.set(id,source);
  if(params.source_dependency){const target=params.source_dependency.id;if(!natural(target))fail('SOURCE_DEPENDENCY_ID_INVALID');else{const a=dependencies.get(id)??new Set(),b=dependencies.get(target)??new Set();a.add(target);b.add(id);dependencies.set(id,a);dependencies.set(target,b);}}
  if(/^QUIC_/.test(name)||String(source.type).includes('QUIC'))fail('QUIC_TRANSPORT_NOT_SUPPORTED');
  if(/(?:HTTP|URL_REQUEST).*?(?:RETRY|RESTART|RESEND)/.test(name)){restartEvents++;fail('HTTP_TRANSPORT_RETRY_OBSERVED');}
  if(name==='TCP_CONNECT'||name==='TRANSPORT_CONNECT_JOB_CONNECT')report.coverage.connectionAttempts++;
  if(name==='SSL_SOCKET_BYTES_SENT'||name==='SSL_SOCKET_BYTES_RECEIVED'){report.coverage.sslByteEventsExcluded++;continue;}
  if(name==='SOCKET_BYTES_SENT'||name==='SOCKET_BYTES_RECEIVED'){
   if(!natural(params.byte_count)){fail('SOCKET_BYTE_COUNT_MISSING');continue;}
   report.coverage.socketByteEvents++;
   if(name==='SOCKET_BYTES_SENT'){sent+=params.byte_count;hasSent=true;source.sentBytes+=params.byte_count;source.sentObserved=true;}else{received+=params.byte_count;hasReceived=true;source.receivedBytes+=params.byte_count;source.receivedObserved=true;}
  }
  if(/WEB_?SOCKET.*FRAME_(?:HEADER|PAYLOAD)/.test(name))websocketFrameEvents++;
  if(name==='URL_REQUEST_START_JOB'&&(event.phase===1||event.phase==='PHASE_BEGIN'||event.phase==='BEGIN')){
   if(typeof params.url!=='string'||typeof params.method!=='string'){fail('URL_JOB_URL_METHOD_REQUIRED');continue;}
   let publicUrl;try{publicUrl=safeUrl(params.url);}catch{fail('URL_JOB_URL_INVALID');continue;}
   const job={sourceId:id,urlHash:publicUrl.urlHash,method:params.method.toUpperCase(),time:event.time,publicUrl};jobs.push(job);source.jobs.push(job);
  }
  if(name==='URL_REQUEST_JOB_BYTES_READ'){
   if(!natural(params.byte_count)){fail('URL_JOB_READ_BYTE_COUNT_MISSING');continue;}
   source.readBytes+=params.byte_count;source.readObserved=true;
  }
  if(name==='REQUEST_ALIVE'&&(event.phase===2||event.phase==='PHASE_END'||event.phase==='END'))source.endObserved=true;
  if(Number.isInteger(params.net_error)&&params.net_error<0)source.netError=params.net_error;
 }
 if(!hasSent||!hasReceived)fail('SOCKET_DIRECTION_COVERAGE_REQUIRED');
 if(!jobs.length)fail('URL_REQUEST_JOB_COVERAGE_REQUIRED');
 const used=new Set();
 for(const [index,entry]of(entries??[]).entries()){
  const req=entry.request,res=entry.response;let url;try{url=safeUrl(req?.url);}catch{fail('HAR_URL_INVALID');continue;}
  if(!['http:','https:','ws:','wss:'].includes(new URL(req.url).protocol)){fail('HAR_UNSUPPORTED_SCHEME');continue;}
  if(typeof req?.method!=='string'||!natural(res?.status)){fail('HAR_METHOD_STATUS_REQUIRED');continue;}
  const matches=jobs.map((j,i)=>({j,i})).filter(({j,i})=>!used.has(i)&&j.urlHash===url.urlHash&&j.method===req.method.toUpperCase());
  // Match repeated reads with actual clock metadata; never guess FIFO after a lost observation.
  let selected=matches.length===1?matches[0]:undefined;
  if(matches.length>1&&hasClockOffset&&Number.isFinite(Date.parse(entry.startedDateTime))){
   const candidates=matches.map(value=>({...value,delta:Math.abs(Number(value.j.time)+tickOffset-Date.parse(entry.startedDateTime))})).filter(v=>Number.isFinite(v.delta)&&v.delta<=250).sort((a,b)=>a.delta-b.delta);
   if(candidates.length&&(!candidates[1]||candidates[0].delta<candidates[1].delta))selected=candidates[0];
  }
  if(!selected){fail(matches.length?'HAR_NETLOG_AMBIGUOUS_REQUEST':'HAR_REQUEST_MISSING_FROM_NETLOG');continue;}
  const {j,i}=selected;used.add(i);const source=sources.get(j.sourceId);j.harIndex=index;
  if(!source?.endObserved)fail('URL_REQUEST_TERMINAL_EVENT_REQUIRED');
  const reachable=new Set([j.sourceId]),pending=[j.sourceId];while(pending.length){for(const next of dependencies.get(pending.pop())??[])if(!reachable.has(next)){reachable.add(next);pending.push(next);}}
  if(![...reachable].some(id=>sources.get(id)?.sentObserved&&sources.get(id)?.receivedObserved))fail('HTTP_SOCKET_DEPENDENCY_COVERAGE_REQUIRED');
  const requestBytes=natural(req.bodySize)?req.bodySize:null;
  const fallback=!natural(res.bodySize)&&source?.readObserved&&source.jobs.length===1?source.readBytes:null;
  const responseBytes=natural(res.bodySize)?res.bodySize:fallback;
  if(requestBytes===null)fail('HAR_REQUEST_BODY_SIZE_UNKNOWN');
  if(responseBytes===null)fail('HAR_RESPONSE_BODY_SIZE_UNKNOWN');
  const requestHeaders=natural(req.headersSize)?req.headersSize:headersUpper(req.headers,req.method+' '+new URL(req.url).pathname+new URL(req.url).search+' '+(req.httpVersion??'HTTP/1.1'));
  const responseHeaders=natural(res.headersSize)?res.headersSize:headersUpper(res.headers,(res.httpVersion??'HTTP/1.1')+' '+res.status+' '+(res.statusText??''));
  if(requestHeaders===null||responseHeaders===null)fail('HAR_HEADER_BOUND_UNKNOWN');
  const cache=entry.cache??{};if(entry._fromCache===true||entry._fromServiceWorker===true||cache.beforeRequest||cache.afterRequest)fail('CACHE_OR_SERVICE_WORKER_UNVERIFIED');
  const mime=res.content?.mimeType??'';
  if(res.status>=300&&res.status<400)report.coverage.httpRedirects++;
  if(mime.startsWith('text/event-stream'))report.coverage.sseResponses++;
  if(res.status===101)report.coverage.websocketUpgrades++;
  const isPartial=source?.netError<0||typeof entry._error==='string'||typeof res._error==='string';
  if(isPartial)report.coverage.partialResponses++;
  const header=req.headers?.find(h=>h.name.toLowerCase()==='x-bazaar-acceptance-request-id')??res.headers?.find(h=>h.name.toLowerCase()==='x-bazaar-acceptance-request-id');
  const requestId=/^[a-f0-9-]{36}$/.test(header?.value??'')?header.value:undefined;
  const publicPath=(fixture?.origin===url.origin&&fixture.requests?.some(row=>row.path===url.path))||session?.publicPaths?.includes(url.path);
  report.requests.push({index,sourceId:j.sourceId,origin:url.origin,path:publicPath?url.path:null,pathSha256:digest(url.path),urlHash:url.urlHash,method:req.method,status:res.status,requestBodyBytes:requestBytes,responseBodyBytes:responseBytes,responseBodyEvidence:fallback!==null?'netlog-job-bytes-read':'HAR-bodySize',requestHeaderBytesUpperBound:requestHeaders,responseHeaderBytesUpperBound:responseHeaders,...(requestId?{requestId}:{}),partial:isPartial});
  report.totals.httpRequests++;if(requestBytes!==null)report.totals.httpRequestBodyBytes+=requestBytes;if(responseBytes!==null)report.totals.httpResponseBodyBytes+=responseBytes;
  if(requestHeaders!==null&&responseHeaders!==null)report.totals.httpHeaderBytesUpperBound+=requestHeaders+responseHeaders;
 }
 if(used.size!==jobs.length)fail('NETLOG_REQUEST_MISSING_FROM_HAR');
 for(const source of sources.values())if(source.jobs.length>1){
  for(let n=0;n<source.jobs.length-1;n++){
   const current=source.jobs[n],next=source.jobs[n+1],entry=entries?.[current.harIndex],location=entry?.response?.redirectURL||entry?.response?.headers?.find(h=>h.name.toLowerCase()==='location')?.value;
   let target;try{target=new URL(location,entry.request.url).href;}catch{}
   if(!entry||entry.response.status<300||entry.response.status>=400||!target||digest(target)!==next.urlHash)fail('HTTP_RETRY_OR_REDIRECT_JOB_ATTRIBUTION_UNRESOLVED');
  }
 }
 const expected=session?.expectedRequests??(fixture?.requests?.map(r=>({urlHash:digest(fixture.origin+r.path),method:r.method})));
 if(!Array.isArray(expected))fail('FROZEN_REQUEST_PLAN_REQUIRED_FOR_RETRY_CHECK');
 else{
  const groups=values=>values.reduce((map,row)=>{const key=row.method+':'+row.urlHash;map.set(key,(map.get(key)??0)+1);return map;},new Map());
  const planned=groups(expected),observed=groups(jobs);if([...new Set([...planned.keys(),...observed.keys()])].some(key=>planned.get(key)!==observed.get(key)))fail('REQUEST_COUNT_DIFFERS_FROM_FROZEN_PLAN');
  else if(used.size===jobs.length&&jobs.length===(entries??[]).length&&!failures.includes('HTTP_RETRY_OR_REDIRECT_JOB_ATTRIBUTION_UNRESOLVED'))report.coverage.httpRetries=restartEvents;
 }
 if(received<report.totals.httpResponseBodyBytes||sent<report.totals.httpRequestBodyBytes)fail('SOCKET_BOUND_SMALLER_THAN_HTTP_BODIES');
 if(report.coverage.websocketUpgrades>0&&websocketFrameEvents===0)fail('WEBSOCKET_FRAME_EVIDENCE_REQUIRED');
 report.coverage.websocketFrameEvents=websocketFrameEvents;
 report.totals.browserOutboundBytesUpperBound=sent;report.totals.browserInboundBytesUpperBound=received;
 if(report.totals.httpRequests>session?.maxHttpRequests||sent>session?.maxOutboundBytes||received>session?.maxInboundBytes)fail('FROZEN_CAPTURE_BUDGET_EXCEEDED');
 if(fixture){
  if(fixture.status!=='PASS_LOCAL_STIMULUS'||!Object.values(fixture.cases??{}).every(v=>v===true))fail('FIXTURE_STIMULUS_INCOMPLETE');
  const byPath=path=>report.requests.filter(r=>r.origin===fixture.origin&&r.path===path);
  for(const row of fixture.requests??[]){const found=byPath(row.path).filter(r=>r.method===row.method);if(found.length!==1)fail('FIXTURE_REQUEST_COVERAGE_MISMATCH');else if(row.status!==101&&(found[0].requestBodyBytes!==row.requestBodyBytes||found[0].responseBodyBytes!==row.responseBodyBytes))fail('FIXTURE_BODY_BYTE_MISMATCH');}
  if(report.coverage.httpRedirects!==1||report.coverage.partialResponses!==1||report.coverage.sseResponses!==1||report.coverage.websocketUpgrades!==1)fail('FIXTURE_PROTOCOL_COVERAGE_MISMATCH');
 }
 report.failures=[...new Set(failures)];report.validationComplete=report.failures.length===0;
 if(!Array.isArray(entries))report.totals.httpRequests=null;
 if(failures.includes('HAR_REQUEST_BODY_SIZE_UNKNOWN'))report.totals.httpRequestBodyBytes=null;
 if(failures.includes('HAR_RESPONSE_BODY_SIZE_UNKNOWN'))report.totals.httpResponseBodyBytes=null;
 if(!hasSent)report.totals.browserOutboundBytesUpperBound=null;
 if(!hasReceived)report.totals.browserInboundBytesUpperBound=null;
 report.captureComplete=report.validationComplete&&session?.evidenceKind==='native-browser-capture';
 report.status=report.validationComplete?(session?.evidenceKind==='parser-fixture'?'PASS_PARSER_FIXTURE':fixture?'PASS_LOCAL_CAPTURE':'PASS_BROWSER_NETWORK_CAPTURE'):'FAIL_CAPTURE';
 return report;
}
