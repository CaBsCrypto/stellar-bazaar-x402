import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='docs/evidence/sprint-marketplace/',raw=await readFile(dir+'usdc-vercel-control.json'),j=JSON.parse(raw),path=dir+'usdc-sale-manifest.json',m=JSON.parse(await readFile(path,'utf8'));
assert.equal(j.planId,m.planId);assert.equal(j.status,'UNCERTAIN');assert.ok(j.attempts.every(a=>a.status==='CONFIRMED'));assert.equal(j.previewToolbar.previousEnableProductionFeedback,null);assert.equal(j.previewToolbar.writes,1);assert.ok(!j.previewFeedbackRecovery&&!m.previewFeedbackRecovery);
assert.equal(j.attempts.slice(-3).map(a=>a.phase+':'+a.method).join(','),'preview-toolbar-off:GET,preview-toolbar-off:PATCH,preview-toolbar-off:GET');
await writeFile(dir+'usdc-preview-feedback-before-recovery.json',raw,{flag:'wx'});
m.previewFeedbackRecovery={projectId:m.projectId,payload:{enableProductionFeedback:null},maxReads:2,maxWrites:1,baselineHash:createHash('sha256').update(raw).digest('hex'),previousProductionFeedback:null,previousFieldPresence:'not-preserved-by-original-observation',reason:'Restore the prior null/absent default explicitly; do not infer the former effective boolean',protectionMustRemain:true,deploymentChanges:0};
await writeFile(path,JSON.stringify(m,null,2)+'\n');console.log(JSON.stringify({status:'LOCAL_EXPLICIT_REPAIR_BOUND',baselineHash:m.previewFeedbackRecovery.baselineHash,externalRequests:0}));
