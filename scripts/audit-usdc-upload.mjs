import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const target=process.argv[2];assert.ok(['bazaar','provider'].includes(target));
const root=target==='provider'?resolve('../provider-guionista-recovered'):process.cwd();
const manifest=JSON.parse((await readFile(`docs/evidence/sprint-marketplace/usdc-${target}-upload-dry.json`,'utf8')).replace(/^\uFEFF/,''));
const allowedRoot=new Set(target==='provider'?['.vercelignore','package.json','package-lock.json','server.ts','tsconfig.json','vercel.json','service-card.json']:['.gitattributes','.vercelignore','LICENSE','next-env.d.ts','package.json','package-lock.json','proxy.ts','tsconfig.json','vercel.json']);
const directory=target==='provider'?/^(api|src|public)\//:/^(app|lib|components|public|styles)\//;
const files=[];
for(const file of manifest.files){
 assert.ok(directory.test(file.path)||allowedRoot.has(file.path),'UNNECESSARY_SOURCE:'+file.path);
 const content=await readFile(resolve(root,file.path));assert.equal(content.length,file.size);assert.equal(createHash('sha1').update(content).digest('hex'),file.sha);
 if(/\.(ts|tsx|js|mjs|json|txt|html|css)$/.test(file.path))assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bS[A-Z2-7]{55}\b|\b(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}\b|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/.test(content.toString('utf8')),'POTENTIAL_LITERAL_SECRET:'+file.path);
 files.push({path:file.path,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')});
}
const report={target,phase:'USDC-first-sale-preview',files,fileCount:files.length,totalBytes:files.reduce((n,v)=>n+v.bytes,0),payloadFingerprint:createHash('sha256').update(JSON.stringify(files)).digest('hex'),secretsFound:0,environmentFilesRead:0};
await writeFile(`docs/evidence/sprint-marketplace/usdc-${target}-upload-audit.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,files:undefined}));
