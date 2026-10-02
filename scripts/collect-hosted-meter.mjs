import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const run=promisify(execFile),json=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const phases=process.argv.slice(2);if(!phases.length||phases.some(p=>!['probe','initial','replacement','closed'].includes(p)))throw Error('PHASE_REQUIRED');
const records=[];
for(const phase of phases){
 const deployment=(await json('docs/evidence/sprint-marketplace/hosted-deploy-'+phase+'-create.json')).deployment;
 const {stdout}=await run(process.execPath,[join(tmpdir(),'bazaar-vercel-cli-preview/node_modules/vercel/dist/index.js'),'logs',deployment.id,'--query','acceptanceMeter','--json','--limit','100','--scope','cabscryptocontacto-6028s-projects','--global-config',join(tmpdir(),'bazaar-vercel-auth-preview')],{windowsHide:true,maxBuffer:4194304});
 for(const line of stdout.split(/\r?\n/)){let row,m;try{row=JSON.parse(line);m=JSON.parse(row.message);}catch{continue;}if(m.acceptanceMeter!=='v1'||!/^[-a-f0-9]{36}$/.test(m.requestId)||!['redis','commandsUpperBound','outboundPayloadBytes','inboundPayloadBytes'].every(k=>Number.isSafeInteger(m[k])&&m[k]>=0))continue;records.push({phase,deploymentId:deployment.id,requestId:m.requestId,path:String(row.requestPath??'').split('?')[0],status:row.responseStatusCode,redis:m.redis,commandsUpperBound:m.commandsUpperBound,outboundPayloadBytes:m.outboundPayloadBytes,inboundPayloadBytes:m.inboundPayloadBytes,workspaceStoredBytesUpperBound:m.workspaceStoredBytesUpperBound??0,uncertain:m.uncertain});}
}
const unique=[...new Map(records.map(r=>[r.requestId,r])).values()];
const report={status:unique.some(r=>r.uncertain)?'UNCERTAIN':'CONFIRMED_LOGS',phases,requests:unique.length,redisRequests:unique.reduce((n,r)=>n+r.redis,0),commandsUpperBound:unique.reduce((n,r)=>n+r.commandsUpperBound,0),outboundPayloadBytes:unique.reduce((n,r)=>n+r.outboundPayloadBytes,0),inboundPayloadBytes:unique.reduce((n,r)=>n+r.inboundPayloadBytes,0),workspaceStoredBytesUpperBound:Math.max(0,...unique.map(r=>r.workspaceStoredBytesUpperBound)),records:unique,limitation:'Application/API meter records only; platform redirects, HTML and static resource requests are outside Redis counters.'};
await writeFile('docs/evidence/sprint-marketplace/hosted-server-meter.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,records:undefined}));
