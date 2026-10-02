import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loadPacket} from './marketplace-private-packet.mjs';
const json=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const deployment=(await json('docs/evidence/sprint-marketplace/hosted-deploy-probe-create.json')).deployment;
const plan=await json('docs/evidence/sprint-marketplace/hosted-counter-probe-manifest.json');
assert.equal(plan.redis.writes,0);assert.equal(plan.limits.appRequests,1);
const packet=await loadPacket(),auth=await json(join(tmpdir(),'bazaar-vercel-auth-preview','auth.json'));
const report={phase:plan.phase,deploymentId:deployment.id,status:'PENDING',appRequests:1,redisWrites:0,payments:0,retries:0};
const path='docs/evidence/sprint-marketplace/hosted-counter-probe.json';
await writeFile(path,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
try{
 const args=[join(tmpdir(),'bazaar-vercel-cli-preview/node_modules/vercel/dist/index.js'),'curl',plan.request.path,'--deployment',deployment.url,'--','--request','GET','--max-time','12','--retry','0','--silent','--show-error','--include','--config','-'];
 const raw=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{windowsHide:true,env:{...process.env,VERCEL_TOKEN:auth.token,VERCEL_TELEMETRY_DISABLED:'1'},stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',v=>{output+=v;if(output.length>65536){child.kill();reject(Error('OVERSIZE'));}});child.stderr.on('data',()=>{});child.on('error',()=>reject(Error('TRANSPORT_UNCONFIRMED')));child.on('close',code=>code?reject(Error('TRANSPORT_UNCONFIRMED')):resolve(output));child.stdin.end('header = "authorization: Bearer '+packet.identities[0].human+'"\n');});
 const block=[...raw.matchAll(/HTTP\/[\d.]+ (\d{3})[^\r\n]*\r?\n([\s\S]*?)\r?\n\r?\n/g)].at(-1);assert.ok(block,'NO_HTTP_RESPONSE');
 const headers=new Headers();for(const line of block[2].split(/\r?\n/)){const i=line.indexOf(':');if(i>0)headers.append(line.slice(0,i),line.slice(i+1).trim());}
 report.httpStatus=Number(block[1]);report.redisRequests=Number(headers.get('x-bazaar-redis-requests'));report.commandsUpperBound=Number(headers.get('x-bazaar-redis-commands-upper-bound'));report.requestId=headers.get('x-bazaar-acceptance-request-id');
 assert.equal(report.httpStatus,401);assert.equal(headers.get('x-bazaar-acceptance-meter'),'v1');assert.equal(headers.get('x-bazaar-redis-uncertain'),'false');assert.equal(report.redisRequests,1);assert.equal(report.commandsUpperBound,4);assert.ok(report.requestId);
 report.status='PASS';report.readonlyRealSdkMeterVerified=true;
}catch(e){report.status='STOPPED';report.error=e.message;process.exitCode=1;}
await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
