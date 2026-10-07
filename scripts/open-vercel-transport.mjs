import https from 'node:https';
import {createHash} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import {resolve,relative,sep} from 'node:path';

// Direct protocol observed in installed Vercel CLI 58.9.4. There is no CLI,
// SDK, telemetry, redirect, automatic retry, or deployment repost here.
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const digest=(v,algorithm='sha256')=>createHash(algorithm).update(v instanceof Uint8Array?v:typeof v==='string'?v:canonical(v)).digest('hex');
const check=(value,code)=>{if(!value)throw Error(code);};
const natural=n=>Number.isSafeInteger(n)&&n>=0;
const sha=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9-]{36}$/;
const resources=['httpRequests','redisRestExchanges','redisCommandsUpperBound','outboundBytes','inboundBytes','externalRequests'];
const zero=()=>Object.fromEntries(resources.map(k=>[k,0]));
const sourceRoots=new Set(['.gitattributes','.vercelignore','LICENSE','next-env.d.ts','package.json','package-lock.json','proxy.ts','tsconfig.json','vercel.json']);
const secretLiteral=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bS[A-Z2-7]{55}\b|\b(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}\b|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/;
const keys=v=>Object.keys(v).sort().join(',');
const opaqueTransfers=new WeakMap();

/** Read-only preparation; private deployment options and upload bytes remain
 * in an opaque object. The returned plan is safe to include in the review. */
export async function prepareOpenVercelTransfer({root,planId,sourceSha,projectId,teamId,name,target,autoAssignCustomDomains=false,productionOrigin,mode,files,auditedExtraPaths=[],deploymentOptions={},limits,logWindow}){
 check(uuid.test(planId??'')&&/^[a-f0-9]{40}$/.test(sourceSha??'')&&/^prj_[A-Za-z0-9]{1,120}$/.test(projectId??'')&&/^team_[A-Za-z0-9]{1,120}$/.test(teamId??''),'FROZEN_EXISTING_DEPLOYMENT_IDENTITY_REQUIRED');
 check(/^[a-z0-9][a-z0-9-]{0,99}$/.test(name??'')&&['preview','production'].includes(target)&&['source-inline','prebuilt-upload'].includes(mode),'EXPLICIT_DEPLOYMENT_MODE_REQUIRED');
 check(!productionOrigin||productionOrigin==='https://bazaar.browns.studio','EXACT_PRODUCTION_ORIGIN_REQUIRED');
 check(typeof autoAssignCustomDomains==='boolean'&&(!autoAssignCustomDomains||target==='production'&&productionOrigin==='https://bazaar.browns.studio'),'EXPLICIT_DOMAIN_ASSIGNMENT_REQUIRED');
 check(Array.isArray(files)&&files.length>0&&Array.isArray(auditedExtraPaths),'EXPLICIT_AUDITED_FILE_MANIFEST_REQUIRED');
 const cap={...limits};check(keys(cap)==='maximumLogPages,maximumRequestBytes,maximumResponseBytes,maximumStatusReads,requestHeaderBytes,timeoutMs'&&Object.values(cap).every(natural)&&cap.maximumStatusReads<=100&&cap.maximumLogPages<=100&&cap.maximumRequestBytes>cap.requestHeaderBytes&&cap.maximumRequestBytes<=1024**3&&cap.maximumResponseBytes>=1024&&cap.maximumResponseBytes<=16*1048576&&cap.requestHeaderBytes>=8192&&cap.requestHeaderBytes<=65536&&cap.timeoutMs>=1000&&cap.timeoutMs<=60000,'EXPLICIT_FINITE_TRANSFER_LIMITS_REQUIRED');
 if(logWindow)check(cap.maximumLogPages>0&&keys(logWindow)==='endDate,startDate'&&natural(logWindow.startDate)&&natural(logWindow.endDate)&&logWindow.endDate>logWindow.startDate&&logWindow.endDate-logWindow.startDate<=900000,'FROZEN_LOG_WINDOW_REQUIRED');else check(cap.maximumLogPages===0,'LOG_WINDOW_REQUIRED');
 const base=resolve(root),paths=new Set(),blobs=new Map(),manifest=[];check((await lstat(base)).isDirectory()&&!(await lstat(base)).isSymbolicLink(),'TRUSTED_SOURCE_ROOT_REQUIRED');
 for(const file of files){
  const path=file.path?.replaceAll('\\','/');check(typeof path==='string'&&!path.startsWith('/')&&!path.includes(':')&&!path.split('/').some(p=>!p||p==='.'||p==='..')&&!paths.has(path),'UPLOAD_PATH_DENIED');paths.add(path);
  check(!/(?:^|\/)\.env(?:\.|$)|(?:^|\/)(?:auth|credentials|secret|wallet|packet)\.(?:json|bin|enc)$/.test(path),'PRIVATE_UPLOAD_PATH_DENIED');
  check(mode==='source-inline'?(/^(app|lib|components|public|styles)\//.test(path)||sourceRoots.has(path)):(path.startsWith('.vercel/output/')||auditedExtraPaths.includes(path)),'AUDITED_UPLOAD_ALLOWLIST_REQUIRED');
  const absolute=resolve(base,path),rel=relative(base,absolute);check(rel&&!rel.startsWith('..'+sep)&&rel!=='..'&&!rel.includes(':')&&!(await lstat(absolute)).isSymbolicLink(),'UPLOAD_PATH_DENIED');let walked=base;for(const part of path.split('/')){walked=resolve(walked,part);check(!(await lstat(walked)).isSymbolicLink(),'UPLOAD_PATH_DENIED');}check((await lstat(absolute)).isFile(),'UPLOAD_FILE_REQUIRED');
  check(natural(file.size)&&file.size+cap.requestHeaderBytes<=cap.maximumRequestBytes,'UPLOAD_REQUEST_CAP');check((await lstat(absolute)).size===file.size,'UPLOAD_INPUT_CHANGED');const data=await readFile(absolute);check(natural(file.size)&&data.length===file.size&&digest(data,'sha1')===file.sha1&&digest(data)===file.sha256,'UPLOAD_INPUT_CHANGED');
  check(!secretLiteral.test(data.toString('utf8')),'UPLOAD_LITERAL_SECRET_DENIED');
  check(file.mode===undefined||Number.isInteger(file.mode)&&file.mode>=0&&file.mode<=0o100777&&[0,0o100000].includes(file.mode&0o170000),'UPLOAD_MODE_DENIED');
  manifest.push({path,size:data.length,sha1:file.sha1,sha256:file.sha256,...(file.mode===undefined?{}:{mode:file.mode})});
  const old=blobs.get(file.sha1);check(!old||digest(old)===file.sha256,'UPLOAD_SHA1_COLLISION_DENIED');blobs.set(file.sha1,data);
 }
 manifest.sort((a,b)=>a.path.localeCompare(b.path));
 const options=structuredClone(deploymentOptions);for(const key of ['files','project','name','target','gitMetadata','meta','autoAssignCustomDomains'])check(options[key]===undefined,'RESERVED_DEPLOYMENT_OPTION:'+key);
 check(options.alias===undefined&&options.domains===undefined,'DOMAIN_ASSIGNMENT_REQUIRES_SEPARATE_MEASURED_ACTION');
 const payloadFingerprint=digest(manifest),configurationHash=digest(options);
 const meta={openPlanId:planId,openSourceSha:sourceSha,openPayloadFingerprint:payloadFingerprint,openConfigurationHash:configurationHash};
 const bodyValue={...options,name,project:projectId,files:manifest.map(f=>mode==='source-inline'?{file:f.path,data:blobs.get(f.sha1).toString('base64'),encoding:'base64'}:{file:f.path,size:f.size,sha:f.sha1,...(f.mode===undefined?{}:{mode:f.mode})}),...(target==='production'?{target}:{}),autoAssignCustomDomains,gitMetadata:{commitSha:sourceSha,dirty:false},meta};
 const body=Buffer.from(JSON.stringify(bodyValue));check(body.length+cap.requestHeaderBytes<=cap.maximumRequestBytes,'DEPLOYMENT_CREATE_REQUEST_CAP');
 if(mode==='prebuilt-upload')for(const bytes of blobs.values())check(bytes.length+cap.requestHeaderBytes<=cap.maximumRequestBytes,'UPLOAD_REQUEST_CAP');
 const uploads=mode==='prebuilt-upload'?[...blobs.keys()].sort():[],maximumRequests=uploads.length+1+cap.maximumStatusReads+cap.maximumLogPages;
 const reservation=zero();reservation.httpRequests=reservation.externalRequests=maximumRequests;reservation.outboundBytes=body.length+uploads.reduce((n,id)=>n+blobs.get(id).length,0)+maximumRequests*cap.requestHeaderBytes;reservation.inboundBytes=maximumRequests*cap.maximumResponseBytes;check(resources.every(k=>natural(reservation[k])),'TRANSFER_BOUND_OVERFLOW');
 const plan={version:1,kind:'open-vercel-transfer',planId,sourceSha,projectId,teamId,name,target,autoAssignCustomDomains,...(productionOrigin?{productionOrigin}:{}),mode,origins:['https://api.vercel.com',...(logWindow?['https://vercel.com']:[])],manifest,payloadFingerprint,configurationHash,bodySha256:digest(body),bodyBytes:body.length,uploadDigests:uploads,limits:cap,...(logWindow?{logWindow:{...logWindow}}:{}),reservation,automaticRetries:0,createAttempts:1,captureScope:'Exclusive native HTTPS HTTP/1.1 plaintext representation, including actual serialized headers and chunk framing; excludes TLS handshake/record overhead, DNS, retransmissions and other processes.'};plan.transferHash=digest(plan);
 const opaque=Object.freeze({kind:'private-vercel-transfer'});opaqueTransfers.set(opaque,{body,blobs});return {plan,opaque};
}

export function openVercelReservation(plan){return structuredClone(plan.reservation);}

/** Counts TLS application plaintext, without recording tokens, headers, bodies,
 * or log messages. Each request owns one socket (agent:false). */
async function exchange({origin,path,method,body,headers,limits,requestImpl,onPending,opaqueResponse=false}){
 check(['https://api.vercel.com','https://vercel.com'].includes(origin)&&path.startsWith('/')&&!/[\r\n]/.test(path),'TRANSFER_ORIGIN_DENIED');
 const sentHash=createHash('sha256'),receivedHash=createHash('sha256');let sent=0,received=0,requestHeaderBytes=0,socket,req,response,timeout;
 const trace={origin,method,pathKind:path.startsWith('/v2/files')?'file-upload':path.startsWith('/v13/deployments/')?'deployment-status':path.startsWith('/v13/deployments')?'deployment-create':'request-logs',status:'PENDING',outboundBytes:0,inboundBytes:0};
 await onPending(trace);
 try{const requestHeaders=typeof headers==='function'?await headers():headers;return await new Promise((resolveExchange,rejectExchange)=>{
  let settled=false;const fail=code=>{if(settled)return;settled=true;clearTimeout(timeout);req?.destroy();rejectExchange(Error(code));};
  try{
   req=requestImpl(new URL(path,origin),{method,agent:false,ALPNProtocols:['http/1.1'],headers:{...requestHeaders,host:new URL(origin).host,connection:'close','accept-encoding':'identity','content-length':String(body?.length??0)}},res=>{
    response=res;trace.httpStatus=res.statusCode;
    if(!Number.isInteger(res.statusCode)||res.statusCode<200||res.statusCode>=300){fail('VERCEL_HTTP_REJECTED');return;}
    if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){fail('UNEXPECTED_COMPRESSED_RESPONSE');return;}
    const chunks=[];let bodyBytes=0;res.on('data',chunk=>{bodyBytes+=chunk.length;if(bodyBytes>limits.maximumResponseBytes){fail('VERCEL_RESPONSE_CAP');return;}chunks.push(Buffer.from(chunk));});
    res.on('aborted',()=>fail('VERCEL_RESPONSE_INCOMPLETE'));res.on('error',()=>fail('VERCEL_RESPONSE_INCOMPLETE'));
    res.on('end',()=>{if(settled)return;if(!res.complete||!socket||received===0||sent===0){fail('VERCEL_CAPTURE_INCOMPLETE');return;}
     socket.destroy?.();
     const expectedHeader=Buffer.from(req._header??'');const expected=createHash('sha256').update(expectedHeader).update(body??Buffer.alloc(0)).digest('hex');
     const actualSent=sentHash.digest('hex');if(!expectedHeader.length||expectedHeader.length>limits.requestHeaderBytes||sent!==expectedHeader.length+(body?.length??0)||actualSent!==expected){fail('VERCEL_REQUEST_CAPTURE_MISMATCH');return;}
     requestHeaderBytes=expectedHeader.length;let value;const bytes=Buffer.concat(chunks);try{value=opaqueResponse?undefined:JSON.parse(bytes.toString('utf8'));}catch{fail('VERCEL_JSON_RESPONSE_REQUIRED');return;}
     settled=true;clearTimeout(timeout);trace.status='CONFIRMED';resolveExchange({value,trace:{...trace,outboundBytes:sent,inboundBytes:received,requestHeaderBytes,responseBodyBytes:bytes.length,outboundSha256:actualSent,inboundSha256:receivedHash.digest('hex'),responseBodySha256:digest(bytes)}});
    });
   });
   req.on('socket',s=>{socket=s;if(s.alpnProtocol&&s.alpnProtocol!=='http/1.1'){fail('UNEXPECTED_HTTPS_PROTOCOL');return;}
    const write=s.write; s.write=function(chunk,encoding,callback){if(settled)return false;const bytes=typeof chunk==='string'?Buffer.from(chunk,typeof encoding==='string'?encoding:undefined):chunk instanceof Uint8Array?Buffer.from(chunk):undefined;if(!bytes){fail('UNKNOWN_HTTPS_WRITE');return false;}if(sent+bytes.length>limits.maximumRequestBytes){fail('VERCEL_REQUEST_CAP');return false;}sent+=bytes.length;sentHash.update(bytes);return write.call(this,chunk,encoding,callback);};
    s.prependListener('data',chunk=>{if(settled)return;if(!(chunk instanceof Uint8Array)){fail('UNKNOWN_HTTPS_READ');return;}received+=chunk.length;receivedHash.update(chunk);if(received>limits.maximumResponseBytes)fail('VERCEL_RESPONSE_CAP');});
    s.on('error',()=>fail('VERCEL_HTTPS_UNCONFIRMED'));
   });
   req.on('error',()=>fail('VERCEL_HTTPS_UNCONFIRMED'));req.on('upgrade',()=>fail('HTTPS_UPGRADE_DENIED'));req.on('information',()=>fail('UNEXPECTED_INTERIM_RESPONSE'));
   check(typeof req._implicitHeader==='function','NATIVE_HTTP_HEADER_API_REQUIRED');req._implicitHeader();check(typeof req._header==='string'&&Buffer.byteLength(req._header)<=limits.requestHeaderBytes,'VERCEL_REQUEST_HEADER_CAP');timeout=setTimeout(()=>fail('VERCEL_HTTPS_TIMEOUT'),limits.timeoutMs);if(body?.length)req.end(body);else req.end();
  }catch{fail('VERCEL_HTTPS_UNCONFIRMED');}
 });}catch(error){trace.status='UNCERTAIN';trace.outboundBytes=sent;trace.inboundBytes=received;try{trace.outboundSha256=sentHash.digest('hex');}catch{}try{trace.inboundSha256=receivedHash.digest('hex');}catch{}throw Object.assign(Error(error.message),{trace});}finally{clearTimeout(timeout);}
}

function validateDeployment(value,plan,id){check(/^dpl_[A-Za-z0-9]{1,120}$/.test(value?.id??'')&&(!id||id===value.id)&&value.projectId===plan.projectId,'DEPLOYMENT_IDENTITY_MISMATCH');check(plan.target==='production'?value.target==='production':value.target!== 'production','DEPLOYMENT_TARGET_MISMATCH');for(const [key,expected]of Object.entries({openPlanId:plan.planId,openSourceSha:plan.sourceSha,openPayloadFingerprint:plan.payloadFingerprint,openConfigurationHash:plan.configurationHash}))check(value.meta?.[key]===expected,'DEPLOYMENT_METADATA_MISMATCH');check(['QUEUED','INITIALIZING','BUILDING','READY','ERROR','CANCELED'].includes(value.readyState),'UNKNOWN_DEPLOYMENT_STATE');check(typeof value.url==='string'&&/^[a-z0-9-]+\.vercel\.app$/.test(value.url),'UNKNOWN_DEPLOYMENT_ORIGIN');return {id:value.id,origin:'https://'+value.url,readyState:value.readyState,target:plan.target,projectId:plan.projectId,sourceSha:plan.sourceSha,payloadFingerprint:plan.payloadFingerprint,configurationHash:plan.configurationHash};}

/** journal is an encrypted fsynced read/initialize/append journal, not a public
 * JSON file. credentialProvider returns a token only after aggregate reserve.
 * testRequestImpl is synthetic-only and can never produce verified evidence. */
export async function createOpenVercelTransport({plan,opaque,acceptancePlan,controller,journal,segmentId,credentialProvider,acquireLock,testRequestImpl}){
 const unhashed={...plan};delete unhashed.transferHash;check(plan.kind==='open-vercel-transfer'&&digest(unhashed)===plan.transferHash&&opaqueTransfers.has(opaque),'PREPARED_TRANSFER_REQUIRED');
 check(acceptancePlan.planId===plan.planId&&acceptancePlan.sourceSha===plan.sourceSha&&sha.test(acceptancePlan.planHash??'')&&uuid.test(segmentId??''),'FROZEN_SOURCE_TRANSFER_BINDING_REQUIRED');
 check(acceptancePlan.vercelTransfers?.length===2&&acceptancePlan.vercelTransfers.every(t=>uuid.test(t.segmentId??'')&&sha.test(t.transferHash??''))&&new Set(acceptancePlan.vercelTransfers.map(t=>t.segmentId)).size===2&&acceptancePlan.vercelTransfers.some(t=>t.segmentId===segmentId&&t.transferHash===plan.transferHash),'REVIEWED_TRANSFER_HASH_REQUIRED');
 if(plan.autoAssignCustomDomains){const proof=acceptancePlan.deploymentProject;check(plan.target==='production'&&plan.productionOrigin===acceptancePlan.origin&&proof?.projectId===plan.projectId&&proof.teamId===plan.teamId&&proof.origin===plan.productionOrigin&&proof.verified===true&&sha.test(proof.evidenceSha256??'')&&Array.isArray(proof.customDomains)&&proof.customDomains.length===1&&proof.customDomains[0]===new URL(plan.productionOrigin).hostname,'EXACT_VERIFIED_PRODUCTION_DOMAIN_REQUIRED');}
 const profile=acceptancePlan.profiles['root:deployment'];check(profile?.origin==='https://api.vercel.com'&&profile.maximumCalls===2&&resources.every(k=>natural(profile.reservation[k])&&profile.reservation[k]>=plan.reservation[k]),'ROOT_TRANSFER_RESERVATION_TOO_SMALL');
 check(typeof controller?.reserveRootTransport==='function'&&typeof controller?.recordRootTransportEvidence==='function'&&typeof credentialProvider==='function'&&typeof acquireLock==='function'&&journal?.read&&journal?.initialize&&journal?.append,'PRIVATE_TRANSPORT_DEPENDENCIES_REQUIRED');
 const release=await acquireLock();check(typeof release==='function','EXCLUSIVE_PRIVATE_TRANSPORT_LOCK_REQUIRED');try{
 let state;try{state=await journal.read();}catch(error){if(error.code!=='ENOENT')throw Error('VERCEL_PRIVATE_JOURNAL_UNREADABLE');}
 const synthetic=!!testRequestImpl,requestImpl=testRequestImpl??https.request;
 if(state){check(state.transferHash===plan.transferHash&&state.acceptancePlanHash===acceptancePlan.planHash&&state.segmentId===segmentId&&state.synthetic===synthetic,'TRANSPORT_JOURNAL_BINDING_MISMATCH');check(!state.uncertain&&state.reserved===true&&!state.pending,'TRANSPORT_UNCERTAIN_NO_RETRY');}
 else{
  state={version:1,transferHash:plan.transferHash,acceptancePlanHash:acceptancePlan.planHash,sourceSha:plan.sourceSha,segmentId,synthetic,reserved:false,uncertain:false,pending:false,uploads:[],uploadAttempts:[],createAttempts:0,statusReads:0,logPages:0,logComplete:!plan.logWindow,logsTruncated:false,traces:[],observed:zero()};await journal.initialize(state);
  try{await controller.reserveRootTransport({profile:'root:deployment',segmentId,origin:'https://api.vercel.com',payloadSha256:plan.transferHash});state.reserved=true;await journal.append(state);}catch{state.uncertain=true;await journal.append(state);throw Error('ROOT_TRANSFER_RESERVATION_UNCONFIRMED');}
 }
 const {body,blobs}=opaqueTransfers.get(opaque);let credential,queue=Promise.resolve(),closed=false;
 const persist=()=>journal.append(structuredClone(state));
 async function invalidateRoot(){try{await controller.recordRootTransportEvidence({segmentId,sourceSha:plan.sourceSha,planHash:acceptancePlan.planHash,origin:'https://api.vercel.com',payloadSha256:plan.transferHash,captureSha256:digest({uncertain:true,actualPartialObserved:state.observed,traces:state.traces}),complete:false,uncertain:true,observed:state.observed});}catch{}}
 const locked=fn=>{const p=queue.then(async()=>{check(!closed,'TRANSPORT_CLOSED');try{return await fn();}catch(error){state.uncertain=true;try{await persist();}catch{}await invalidateRoot();throw error;}});queue=p.catch(()=>{});return p;};
 async function request(kind,path,method,bytes,extraHeaders={}){
  check(!state.pending&&!state.uncertain,'TRANSPORT_UNCERTAIN_NO_RETRY');check(state.traces.length<plan.reservation.httpRequests,'VERCEL_AGGREGATE_REQUEST_CAP');
  const origin=kind==='logs'?'https://vercel.com':'https://api.vercel.com';check(plan.origins.includes(origin),'UNPLANNED_TRANSFER_ORIGIN');
  const outboundUpper=(bytes?.length??0)+plan.limits.requestHeaderBytes;check(state.observed.outboundBytes+outboundUpper<=plan.reservation.outboundBytes&&state.observed.inboundBytes+plan.limits.maximumResponseBytes<=plan.reservation.inboundBytes,'VERCEL_AGGREGATE_BYTE_CAP');
  try{
   const result=await exchange({origin,path,method,body:bytes,limits:plan.limits,requestImpl,opaqueResponse:kind==='upload',headers:async()=>{if(!credential){const token=await credentialProvider();check(typeof token==='string'&&token.length>0&&token.length<=4096&&!/[\r\n\0]/.test(token),'PRIVATE_CREDENTIAL_INVALID');credential=token;}return {authorization:'Bearer '+credential,accept:'application/json','user-agent':'bazaar-open-source-bound-transport/1','content-type':bytes?'application/json':'application/octet-stream',...extraHeaders};},onPending:async trace=>{state.pending=true;state.traces.push(trace);await persist();await controller.recordRootTransportEvidence({segmentId,sourceSha:plan.sourceSha,planHash:acceptancePlan.planHash,origin:'https://api.vercel.com',payloadSha256:plan.transferHash,captureSha256:digest({pending:true,traces:state.traces,observed:state.observed}),complete:false,uncertain:false,observed:state.observed});}});
   state.traces[state.traces.length-1]=result.trace;state.pending=false;state.observed.httpRequests++;state.observed.externalRequests++;state.observed.outboundBytes+=result.trace.outboundBytes;state.observed.inboundBytes+=result.trace.inboundBytes;await persist();return result.value;
  }catch(error){state.uncertain=true;if(error.trace){state.traces[state.traces.length-1]=error.trace;state.observed.httpRequests++;state.observed.externalRequests++;state.observed.outboundBytes+=error.trace.outboundBytes;state.observed.inboundBytes+=error.trace.inboundBytes;}try{await persist();}catch{}throw Error('VERCEL_TRANSFER_STOPPED_NO_RETRY');}
 }
 function query(path,params={}){const u=new URL(path,'https://api.vercel.com');u.searchParams.set('teamId',plan.teamId);for(const [key,value]of Object.entries(params))u.searchParams.set(key,String(value));return u.pathname+u.search;}
 async function capture(final){
  const transportComplete=!state.uncertain&&!state.pending&&state.observed.httpRequests>0&&state.deployment?.readyState==='READY';const complete=transportComplete&&(!final||(!plan.logWindow||Date.now()>=plan.logWindow.endDate)&&state.logComplete&&!state.logsTruncated)&&!synthetic;
  const report={version:1,kind:'open-vercel-transport-capture',segmentId,planId:plan.planId,sourceSha:plan.sourceSha,planHash:acceptancePlan.planHash,transferHash:plan.transferHash,origins:plan.origins,scope:plan.captureScope,through:new Date().toISOString(),status:synthetic?'SYNTHETIC_ONLY':complete?'CAPTURED_THROUGH_CHECKPOINT':state.uncertain?'UNCERTAIN_NO_RETRY':'CAPTURE_INCOMPLETE',final,complete,uncertain:state.uncertain,synthetic,observed:{...state.observed},...(state.deployment?{deployment:state.deployment}:{}),traces:structuredClone(state.traces),logs:{pages:state.logPages,windowClosed:!plan.logWindow||Date.now()>=plan.logWindow.endDate,complete:state.logComplete,truncated:state.logsTruncated}};report.captureSha256=digest(report);
  await controller.recordRootTransportEvidence({segmentId,sourceSha:plan.sourceSha,planHash:acceptancePlan.planHash,origin:'https://api.vercel.com',payloadSha256:plan.transferHash,captureSha256:report.captureSha256,complete,uncertain:state.uncertain,observed:state.observed});state.lastCapture=report;await persist();return report;
 }
 return {
  uploadAndCreate:()=>locked(async()=>{check(state.createAttempts===0&&!state.uncertain,'DEPLOYMENT_REPOST_FORBIDDEN');
   for(const id of plan.uploadDigests){check(!state.uploadAttempts.includes(id),'UPLOAD_RETRY_FORBIDDEN');state.uploadAttempts.push(id);await persist();const bytes=blobs.get(id);check(digest(bytes,'sha1')===id,'UPLOAD_INPUT_CHANGED');await request('upload',query('/v2/files'),'POST',bytes,{'content-type':'application/octet-stream','x-now-digest':id,'x-now-size':String(bytes.length)});state.uploads.push(id);await persist();}
   state.createAttempts=1;await persist();check(digest(body)===plan.bodySha256,'DEPLOYMENT_BODY_CHANGED');const value=await request('create',query('/v13/deployments',{forceNew:1,...(plan.mode==='prebuilt-upload'?{prebuilt:1}:{})}),'POST',body);
   try{state.deployment=validateDeployment(value,plan);await persist();return structuredClone(state.deployment);}catch{state.uncertain=true;await persist();throw Error('DEPLOYMENT_RESPONSE_UNBOUND_NO_RETRY');}
  }),
  readStatus:()=>locked(async()=>{check(state.deployment&&state.statusReads<plan.limits.maximumStatusReads&&!state.uncertain,'EXPLICIT_BOUNDED_STATUS_READ_REQUIRED');state.statusReads++;await persist();const value=await request('status',query('/v13/deployments/'+state.deployment.id),'GET');try{state.deployment=validateDeployment(value,plan,state.deployment.id);await persist();return structuredClone(state.deployment);}catch{state.uncertain=true;await persist();throw Error('DEPLOYMENT_RESPONSE_UNBOUND_NO_RETRY');}}),
  readLogPage:()=>locked(async()=>{check(plan.logWindow&&Date.now()>=plan.logWindow.endDate,'LOG_WINDOW_NOT_CLOSED');check(plan.logWindow&&state.deployment&&state.logPages<plan.limits.maximumLogPages&&!state.logComplete&&!state.uncertain,'EXPLICIT_BOUNDED_LOG_READ_REQUIRED');const page=state.logPages;state.logPages++;await persist();const u=new URL('/api/logs/request-logs','https://vercel.com');for(const [k,v]of Object.entries({projectId:plan.projectId,ownerId:plan.teamId,deploymentId:state.deployment.id,page,startDate:plan.logWindow.startDate,endDate:plan.logWindow.endDate}))u.searchParams.set(k,String(v));
   const value=await request('logs',u.pathname+u.search,'GET');try{check(Array.isArray(value?.rows)&&value.rows.length<=10000&&typeof value.hasMoreRows==='boolean','REQUEST_LOG_SCHEMA_UNKNOWN');for(const row of value.rows){check(row&&typeof row==='object'&&(!row.deploymentId||row.deploymentId===state.deployment.id)&&(!row.logs||Array.isArray(row.logs)),'REQUEST_LOG_SCHEMA_UNKNOWN');for(const log of row.logs??[]){check(typeof log.message==='string','REQUEST_LOG_SCHEMA_UNKNOWN');if(log.messageTruncated!==false&&log.messageTruncated!==undefined)state.logsTruncated=true;}}state.logComplete=!value.hasMoreRows;await persist();return {page,value,bodySha256:state.traces.at(-1).responseBodySha256};}catch{state.logsTruncated=true;await persist();throw Error('REQUEST_LOG_CAPTURE_INCOMPLETE');}
  }),
  checkpoint:()=>locked(()=>capture(false)),
  finish:()=>locked(()=>capture(true)),
  snapshot:()=>structuredClone(state),
  close:async()=>{await queue;if(!closed){closed=true;credential=undefined;await release();}}
 };
 }catch(error){await release();throw error;}
}
