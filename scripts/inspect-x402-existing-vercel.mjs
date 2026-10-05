// Read-only preparation. Never deploys, decrypts participant wallets, signs or pays.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = (value, length) => typeof value==='string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value) ? value : null;
const projectId = 'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3';
const providerId = 'prj_cHsv0UIK31fRuLBXkW5RXkz4eU9K';
const teamId = 'team_XjolcoWJ9V9yamVnCdpC7EMY';
const reads = [
  ['bazaar-project', `/v9/projects/${projectId}`],
  ['provider-project', `/v9/projects/${providerId}`],
  ['existing-team', `/v2/teams/${teamId}`],
  ['bazaar-existing-preview', '/v13/deployments/dpl_GtCiywSTBgtAXcboDgCw829pxvU2'],
  ['provider-existing-preview', '/v13/deployments/dpl_6vzckCnGuTd2UocjmWpjeaLRebPw'],
];
const policy = Object.freeze({version:1, method:'GET', origin:'https://api.vercel.com', paths:reads.map(x=>x[1]), teamId,
  maxCalls:5, maxRequestBytes:8192, maxResponseBytes:524288, timeoutMs:10000,
  redirects:0, retries:0, mutations:0, signatures:0, payments:0, providerExecutions:0,
  limitsAreInclusive:true, byteScope:'explicit HTTP representation; acceptance/parsing cap, not physical transport bytes', scope:'existing-projects-read-only-preparation'});

function summarize(label, data) {
  if (label === 'existing-team') return {id:data.id, slug:data.slug, billingPlan:data.billing?.plan ?? null};
  if (label.endsWith('project')) return {
    id:data.id, name:data.name, accountId:data.accountId, framework:data.framework,
    ssoProtectionType:data.ssoProtection?.deploymentType ?? null, passwordProtectionEnabled:!!data.passwordProtection,
    deploymentProtectionEnabled:!!data.ssoProtection || !!data.passwordProtection,
    protectionBypassConfigured:!!data.protectionBypass && Object.keys(data.protectionBypass).length > 0,
    environmentKeys:Array.isArray(data.env) ? data.env.map(v=>({key:v.key,type:v.type,target:v.target})).sort((a,b)=>a.key.localeCompare(b.key)) : [],
  };
  return {id:data.id, projectId:data.projectId, name:data.name, url:data.url,
    readyState:data.readyState, target:data.target ?? null, createdAt:data.createdAt,
    sourceSHA:hex(data.meta?.x402SourceSha ?? data.meta?.usdcSourceSha ?? data.meta?.sourceSHA ?? data.meta?.githubCommitSha,40),
    payloadFingerprint:hex(data.meta?.x402PayloadFingerprint ?? data.meta?.usdcPayloadFingerprint ?? data.meta?.payloadFingerprint,64),
    buildHash:hex(data.meta?.x402BuildHash ?? data.meta?.usdcBuildHash ?? data.meta?.buildHash,64),
    protectionEvidence:'project-policy-only; anonymous HTTP verification still required'};
}

async function main() {
  const args=process.argv.slice(2);
  const dryRun=args.includes('--plan');
  const outputArg=args.find(v=>v.startsWith('--output='));
  const relativeOutput=outputArg?.slice('--output='.length) ?? 'docs/evidence/sprint-x402-agent/existing-vercel-read-preparation-20261005-01.json';
  const output=resolve(relativeOutput);
  const evidenceRoot=resolve('docs/evidence/sprint-x402-agent');
  if (!output.startsWith(evidenceRoot + '\\') && !output.startsWith(evidenceRoot + '/')) throw Error('OUTPUT_OUTSIDE_EVIDENCE_ROOT');
  if (dryRun) { console.log(JSON.stringify({status:'PLAN_ONLY',policy,policySHA256:sha256(JSON.stringify(policy))})); return; }
  await mkdir(evidenceRoot,{recursive:true});
  const report={schemaVersion:1,status:'PREPARATION_PENDING',policy,policySHA256:sha256(JSON.stringify(policy)),startedAt:new Date().toISOString(),
    counters:{controlApiRequests:0,outBytes:0,inBytes:0,redisRestRequests:0,redisCommands:0,signatures:0,payments:0,providerExecutions:0},reads:[]};
  // Exclusive create: an interrupted or uncertain run is never retried under this receipt.
  await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',flush:true});
  const persist=()=>writeFile(output,JSON.stringify(report,null,2)+'\n',{flush:true});
  let token;
  try {
    const auth=JSON.parse(await readFile(join(tmpdir(),'bazaar-vercel-auth-preview','auth.json'),'utf8'));
    if(typeof auth.token !== 'string' || !auth.token || auth.token.length>4096 || /[\r\n\0]/.test(auth.token)) throw Error('EXISTING_AUTH_TOKEN_UNAVAILABLE');
    token=auth.token;
  } catch { report.status='AUTH_UNAVAILABLE_NO_NETWORK'; await persist(); throw Error(report.status); }
  for(const [label,path] of reads) {
    const url=new URL(path,policy.origin); url.searchParams.set('teamId',teamId);
    const headers=new Headers({authorization:`Bearer ${token}`,accept:'application/json','user-agent':'Bazaar-x402-existing-read-preparation/1'});
    const outBytes=Buffer.byteLength(`GET ${url.pathname}${url.search} HTTP/1.1\r\nhost: ${url.host}\r\n`)+Array.from(headers).reduce((n,[k,v])=>n+Buffer.byteLength(`${k}: ${v}\r\n`),2);
    if(outBytes>policy.maxRequestBytes) throw Error('REQUEST_BYTE_CAP');
    const entry={label,path,status:'PENDING',startedAt:new Date().toISOString(),reservedResponseBytes:policy.maxResponseBytes};
    report.reads.push(entry); report.counters.controlApiRequests++; report.counters.outBytes+=outBytes;
    // Charge the complete response cap before any network effect. Release only after a fully captured response.
    report.counters.inBytes+=policy.maxResponseBytes; await persist();
    let observedResponseBytes=0;
    try {
      const response=await fetch(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(policy.timeoutMs)});
      let inBytes=Buffer.byteLength(`HTTP/1.1 ${response.status} ${response.statusText}\r\n`)+Array.from(response.headers).reduce((n,[k,v])=>n+Buffer.byteLength(`${k}: ${v}\r\n`),2);
      observedResponseBytes=inBytes;
      if(inBytes>policy.maxResponseBytes){await response.body?.cancel();throw Error('RESPONSE_BYTE_CAP');}
      const chunks=[];
      const reader=response.body?.getReader();
      if(reader) for(;;) {const next=await reader.read(); if(next.done)break; inBytes+=next.value.byteLength; observedResponseBytes=inBytes; if(inBytes>policy.maxResponseBytes){await reader.cancel(); throw Error('RESPONSE_BYTE_CAP');} chunks.push(Buffer.from(next.value));}
      if(inBytes>policy.maxResponseBytes) throw Error('RESPONSE_BYTE_CAP');
      const bytes=Buffer.concat(chunks);
      entry.httpStatus=response.status; entry.responseSHA256=sha256(bytes); entry.inBytes=inBytes; entry.completedAt=new Date().toISOString();
      report.counters.inBytes-=policy.maxResponseBytes-inBytes;
      if(!response.ok) {entry.status='HTTP_REJECTED'; report.status='PREPARATION_STOPPED'; await persist(); throw Error('HTTP_REJECTED');}
      const data=JSON.parse(bytes.toString('utf8'));
      const expectedId=path.split('/').at(-1);
      if(data.id!==expectedId || (label.endsWith('project') && data.accountId!==teamId) || (label.endsWith('preview') && data.projectId!==(label.startsWith('bazaar')?projectId:providerId))) throw Error('RETURNED_IDENTITY_MISMATCH');
      entry.summary=summarize(label,data); entry.status='COMPLETE';
      await persist();
    } catch(error) {
      if(entry.status==='PENDING'){entry.status='UNCERTAIN'; entry.errorCode=['RESPONSE_BYTE_CAP','RETURNED_IDENTITY_MISMATCH'].includes(error.message)?error.message:'TRANSPORT_OR_PARSE_UNCERTAIN';entry.partialResponseBytes=observedResponseBytes;
        if(observedResponseBytes>policy.maxResponseBytes)report.counters.inBytes+=observedResponseBytes-policy.maxResponseBytes;}
      report.status='PREPARATION_STOPPED'; await persist(); throw Error('PREPARATION_STOPPED_NO_RETRY');
    }
  }
  report.status='EXISTING_INFRA_READ_COMPLETE'; report.completedAt=new Date().toISOString(); await persist();
  console.log(JSON.stringify({status:report.status,report:relativeOutput,counters:report.counters,reads:report.reads.map(v=>({label:v.label,status:v.status,httpStatus:v.httpStatus,summary:v.summary}))}));
}
main().catch(error=>{const codes=['OUTPUT_OUTSIDE_EVIDENCE_ROOT','AUTH_UNAVAILABLE_NO_NETWORK','REQUEST_BYTE_CAP','PREPARATION_STOPPED_NO_RETRY'];console.error(JSON.stringify({status:'STOPPED',code:codes.includes(error.message)?error.message:'PREPARATION_LOCAL_FAILURE_NO_RETRY'}));process.exitCode=1;});
