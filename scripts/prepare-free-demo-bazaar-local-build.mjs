// A build copy keeps the four frozen candidates byte-for-byte immutable.
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {verifyFreeDemoSources} from './prepare-free-demo-sources.mjs';
const root=process.cwd(),verified=await verifyFreeDemoSources(root);
const selected=verified.outputs.find(output=>output.kind==='bazaar'&&output.environment==='preview');
const manifest=JSON.parse(await readFile(resolve(root,selected.manifest),'utf8'));
const output=resolve(root,'.vercel/free-demo-bazaar-build');
try{await lstat(output);throw Error('NEW_BUILD_COPY_REQUIRED');}catch(error){if(error.code!=='ENOENT')throw error;}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(output);
for(const file of manifest.files){
 const bytes=await readFile(resolve(root,selected.sourceDirectory,file.path));
 if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('FROZEN_SOURCE_CHANGED');
 const destination=resolve(output,file.path);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,bytes,{flag:'wx'});
}
const rootLock=await readFile(resolve(root,'package-lock.json'));
const frozenLock=await readFile(resolve(output,'package-lock.json'));
const evidence={status:'LOCAL_BUILD_COPY_VERIFIED',sourceDigest:selected.sourceDigest,files:manifest.files.length,buildDirectory:'.vercel/free-demo-bazaar-build',rootPackageLockMatches:rootLock.equals(frozenLock),frozenSourcesModified:false,networkRequests:0,productionPublished:false,cronActivated:false};
await writeFile(resolve(root,'.vercel/free-demo-bazaar-build-provenance.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(evidence));
