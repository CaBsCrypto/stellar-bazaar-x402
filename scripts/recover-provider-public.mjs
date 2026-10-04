import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const run=promisify(execFile),deploymentId='dpl_8Pv5kWHWzkYVCiV7ouBUM9NQsWVC';
const files=[
 {path:'.vercelignore',uid:'22e1074df0714aef0d275e4303450a6ceddf6d2b'},
 {path:'public/index.html',uid:'ba23b17bd050fd862c2bf9b92dc935b38dce2166'},
 {path:'public/teleprompter.html',uid:'d1abcf8ccba8090bab37b90bae9ca02ec6659dd3'},
];
const cli=join(tmpdir(),'bazaar-vercel-cli-preview/node_modules/vercel/dist/index.js');
const config=join(tmpdir(),'bazaar-vercel-auth-preview'),root=resolve('../provider-guionista-recovered');
const plan={deploymentId,paths:files,requests:3,totalBytesUpperBound:1048576,remoteMutations:0,environmentFilesRead:0};
await writeFile('docs/evidence/sprint-marketplace/provider-public-recovery-plan.json',JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
let bytes=0;const records=[];
for(const file of files){
 const {stdout}=await run(process.execPath,[cli,'api',`/v8/deployments/${deploymentId}/files/${file.uid}`,'--method','GET','--scope','cabscryptocontacto-6028s-projects','--global-config',config],{windowsHide:true,maxBuffer:2097152,timeout:15000});
 const result=JSON.parse(stdout);if(typeof result.data!=='string')throw Error('SOURCE_ENVELOPE_UNCONFIRMED');
 const content=Buffer.from(result.data,'base64');bytes+=content.length;if(bytes>plan.totalBytesUpperBound)throw Error('SOURCE_BUDGET');
 if(/\bS[A-Z2-7]{55}\b|\bAIza[\w-]{30,}|\bsk-[\w-]{24,}|Bearer\s+[A-Za-z0-9_-]{32,}/.test(content.toString('utf8')))throw Error('SOURCE_LITERAL_SECRET_DO_NOT_SAVE');
 const target=join(root,file.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,content,{flag:'wx'});
 records.push({path:file.path,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')});
}
const report={status:'RECOVERED',deploymentId,requests:3,bytes,records,remoteMutations:0,environmentFilesRead:0};
await writeFile('docs/evidence/sprint-marketplace/provider-public-recovery.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
