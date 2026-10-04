import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const dir='docs/evidence/sprint-marketplace/',json=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,'')),sha=v=>createHash('sha256').update(v).digest('hex');
const m=await json(dir+'usdc-sale-manifest.json'),path=dir+'usdc-vercel-control.json',j=await json(path),plan=m.previewFeedbackRecovery;
assert.equal(plan?.maxWrites,1);assert.equal(plan.maxReads,2);assert.deepEqual(plan.payload,{enableProductionFeedback:null});assert.equal(plan.projectId,m.projectId);
assert.equal(j.status,'UNCERTAIN');assert.equal(j.previewToolbar.status,'PREPARED');assert.equal(j.previewToolbar.writes,1);assert.equal(j.previewToolbar.previousEnableProductionFeedback,null);assert.ok(j.attempts.every(a=>a.status==='CONFIRMED'));assert.ok(!j.previewFeedbackRecovery);
const archived=await readFile(dir+'usdc-preview-feedback-before-recovery.json');assert.equal(sha(archived),plan.baselineHash);assert.deepEqual(JSON.parse(archived),j);
const lockPath=join(tmpdir(),'bazaar-marketplace-acceptance-encrypted','sale-'+m.planId+'.lock');assert.deepEqual(await json(lockPath),{version:1,planId:m.planId});
const persist=()=>writeFile(path,JSON.stringify(j,null,2)+'\n');
j.previewFeedbackRecovery={status:'PREPARED',baselineHash:plan.baselineHash,reads:0,writes:0,reason:'Confirmed preview-only PATCH normalized the previously absent production feedback field; restore its null default explicitly'};await persist();
async function api(method,body){
 assert.ok(j.requests+1<=m.limits.vercelControlRequests);const k=method==='GET'?'reads':'writes';assert.ok(j.previewFeedbackRecovery[k]+1<=plan[method==='GET'?'maxReads':'maxWrites']);
 const attempt={phase:'explicit-feedback-recovery',path:'api',method,status:'PENDING'};j.requests++;j.previewFeedbackRecovery[k]++;j.attempts.push(attempt);await persist();
 try{
 const args=[join(tmpdir(),'bazaar-vercel-cli-preview/node_modules/vercel/dist/index.js'),'api','/v9/projects/'+m.projectId,'--method',method,...(body?['--input','-']:[]),'--scope','cabscryptocontacto-6028s-projects','--global-config',join(tmpdir(),'bazaar-vercel-auth-preview')];
 const raw=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{windowsHide:true,env:{...process.env,VERCEL_TELEMETRY_DISABLED:'1'},stdio:['pipe','pipe','pipe']});let output='',bytes=0;const timer=setTimeout(()=>{child.kill();reject(Error('CONTROL_TIMEOUT'));},45000);child.stdout.on('data',v=>{bytes+=v.length;if(bytes>2097152){child.kill();reject(Error('CONTROL_RESPONSE_LIMIT'));}else output+=v;});child.stderr.on('data',()=>{});child.on('error',()=>{clearTimeout(timer);reject(Error('CONTROL_READ_FAILED'));});child.on('close',code=>{clearTimeout(timer);code?reject(Error('CONTROL_FAILED')):resolve(output);});child.stdin.end(body?JSON.stringify(body):undefined);});
 const result=JSON.parse(raw);attempt.status='CONFIRMED';await persist();return result;
 }catch(error){attempt.status='UNCERTAIN';j.previewFeedbackRecovery.status='UNCERTAIN';await persist();throw error;}
}
try{
 const before=await api('GET');assert.equal(before.enablePreviewFeedback,false);assert.equal(sha(JSON.stringify(before.ssoProtection)),j.previewToolbar.protectionHash);
 j.previewFeedbackRecovery.observedBefore={previewFeedback:before.enablePreviewFeedback,productionFeedback:before.enableProductionFeedback??null};await persist();
 if((before.enableProductionFeedback??null)!==null)await api('PATCH',plan.payload);
 const after=await api('GET');j.previewFeedbackRecovery.observedAfter={previewFeedback:after.enablePreviewFeedback,productionFeedback:after.enableProductionFeedback??null,protectionHash:sha(JSON.stringify(after.ssoProtection))};await persist();
 assert.equal(after.enablePreviewFeedback,false);assert.equal(after.enableProductionFeedback??null,null);assert.equal(sha(JSON.stringify(after.ssoProtection)),j.previewToolbar.protectionHash);
 j.previewFeedbackRecovery.status='CONFIRMED_RESTORED';j.previewToolbar.status='CONFIRMED';j.status='PREPARATION';await persist();await unlink(lockPath);
 console.log(JSON.stringify({status:'CONFIRMED_RESTORED',previewFeedback:false,productionFeedbackDefaultRestored:true,protectionUnchanged:true,requests:j.requests}));
}catch(error){j.previewFeedbackRecovery.status=j.previewFeedbackRecovery.status==='UNCERTAIN'?'UNCERTAIN':'KNOWN_VALIDATION_FAILURE';await persist();console.error(error.message);process.exitCode=1;}
