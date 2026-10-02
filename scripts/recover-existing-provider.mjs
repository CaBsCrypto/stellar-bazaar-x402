import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const run=promisify(execFile),id='dpl_8Pv5kWHWzkYVCiV7ouBUM9NQsWVC';
const root=resolve('../provider-guionista-recovered');
const cli=join(tmpdir(),'bazaar-vercel-cli-preview/node_modules/vercel/dist/index.js');
const config=join(tmpdir(),'bazaar-vercel-auth-preview');
const allowed=new Set(['api/index.ts','server.ts','package.json','package-lock.json','service-card.json','tsconfig.json','vercel.json','src/app.ts','src/crypto/canonical-hash.ts','src/crypto/delivery-envelope.ts','src/engine/gemini-client.ts','src/engine/script-generator.ts','src/engine/wpm-calculator.ts','src/middleware/x402.ts','src/types.ts','src/views/landing-template.ts','src/views/teleprompter-template.ts']);
async function api(path){const {stdout}=await run(process.execPath,[cli,'api',path,'--method','GET','--scope','cabscryptocontacto-6028s-projects','--global-config',config],{windowsHide:true,maxBuffer:2097152,timeout:15000});return JSON.parse(stdout);}
const plan={deploymentId:id,destination:root,allowed:[...allowed],requestsUpperBound:18,bytesUpperBound:2097152,remoteMutations:0,excluded:'Environment files, secrets, documentation instructions and compiled files'};
await writeFile('docs/evidence/sprint-marketplace/provider-source-recovery-plan.json',JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
const tree=await api('/v6/deployments/'+id+'/files'),files=[];
function visit(entries,prefix=''){for(const e of entries){const p=prefix+e.name;if(e.children)visit(e.children,p+'/');else if(p.startsWith('src/')&&allowed.has(p.slice(4)))files.push({path:p.slice(4),uid:e.uid});}}
visit(tree);if(files.length!==allowed.size)throw Error('SOURCE_INVENTORY_INCOMPLETE');
const records=[];let bytes=0;
for(const file of files){
 const data=await api('/v8/deployments/'+id+'/files/'+file.uid);
 if(typeof data.data!=='string')throw Error('CONTENT_ENVELOPE_UNKNOWN');
 const content=Buffer.from(data.data,'base64');bytes+=content.length;if(bytes>plan.bytesUpperBound)throw Error('SOURCE_BUDGET_EXCEEDED');
 const text=content.toString('utf8');
 if(/\bS[A-Z2-7]{55}\b|\bAIza[\w-]{30,}|\bsk-[\w-]{24,}|Bearer\s+[A-Za-z0-9_-]{32,}/.test(text))throw Error('POTENTIAL_LITERAL_SECRET_DO_NOT_SAVE');
 const path=join(root,file.path);await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,content,{flag:'wx'});
 records.push({path:file.path,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')});
}
const report={status:'RECOVERED_SOURCE_ONLY',deploymentId:id,files:records,requests:1+records.length,bytes,remoteMutations:0,environmentFilesRead:0,originalContractUnchanged:true};
await writeFile('docs/evidence/sprint-marketplace/provider-source-recovery.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...report,files:records.length}));
