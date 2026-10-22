import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { BASE_MANIFEST_SHA256, OVERLAYS, safeSourcePath, sourceDigest, verify } from './prepare-functional-preview-source.mjs';

for (const path of ['.vercel/secrets.json','lib/../../private.json','public/.env','public/key.dpapi','public/link.pem','private/token.json','build-provenance/x.json','public\\x.json','/etc/passwd','public//x.json','public/../token.json']) assert.equal(safeSourcePath(path),false,path);
for (const path of ['lib/private-read-queue.ts','components/MarketReview.tsx','.vercelignore','.gitattributes','LICENSE','styles/ui.css','public/examples/native-text-service-card.json']) assert.equal(safeSourcePath(path),true,path);
assert.equal(OVERLAYS.includes('vercel.json'),false,'Frozen cron policy must not come from checkout');
assert.equal(OVERLAYS.every(safeSourcePath),true);
const files=[{path:'b.ts',bytes:2,sha256:'b'.repeat(64)},{path:'a.ts',bytes:1,sha256:'a'.repeat(64)}];
assert.equal(sourceDigest(files),sourceDigest([...files].reverse()),'Manifest digest ignores enumeration order');
assert.notEqual(sourceDigest(files),sourceDigest([{...files[0],bytes:3},files[1]]),'Digest binds file length');

const root=await mkdtemp(resolve(tmpdir(),'bazaar-freeze-synthetic-'));
const sourceDirectory='.vercel/synthetic-source', manifestPath='docs/evidence/synthetic-source.json';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try {
  await mkdir(resolve(root,sourceDirectory),{recursive:true}); await mkdir(resolve(root,'docs/evidence'),{recursive:true});
  const payloads={ 'vercel.json':JSON.stringify({crons:[]}),'.vercelignore':'.vercel\nnode_modules\n.next\n.env*\nbuild-provenance\n','package.json':'{"private":true}\n' };
  const entries=[];
  for(const [path,text] of Object.entries(payloads)){const bytes=Buffer.from(text);await writeFile(resolve(root,sourceDirectory,path),bytes);entries.push({path,bytes:bytes.length,sha256:hash(bytes)});}
  const manifest={version:1,status:'FROZEN_PROTECTED_PREVIEW_SOURCE',candidate:'synthetic',baseManifestSha256:BASE_MANIFEST_SHA256,sourceDirectory,files:entries,effectiveSourceDigest:sourceDigest(entries)};
  await writeFile(resolve(root,manifestPath),JSON.stringify(manifest));
  const before=await readFile(resolve(root,manifestPath));
  assert.equal((await verify(root,manifestPath)).status,'FROZEN_SOURCE_VERIFIED');
  assert.deepEqual(await readFile(resolve(root,manifestPath)),before,'Verify performs no source/manifest writes');
  await writeFile(resolve(root,sourceDirectory,'public-token.json'),'not a real secret');
  await assert.rejects(verify(root,manifestPath),/UNMANIFESTED_DEPLOYMENT_FILE/);await rm(resolve(root,sourceDirectory,'public-token.json'));
  await mkdir(resolve(root,sourceDirectory,'.vercel'));await writeFile(resolve(root,sourceDirectory,'.vercel/project.json'),'{}');
  assert.equal((await verify(root,manifestPath)).status,'FROZEN_SOURCE_VERIFIED','Ignored project linkage permitted');
  await writeFile(resolve(root,sourceDirectory,'.vercel/protected.dpapi'),'synthetic');
  await assert.rejects(verify(root,manifestPath),/PRIVATE_CONTROL_FILES_REJECTED/);await rm(resolve(root,sourceDirectory,'.vercel/protected.dpapi'));
  await writeFile(resolve(root,sourceDirectory,'vercel.json'),JSON.stringify({crons:[{path:'/tick',schedule:'* * * * *'}]}));
  await assert.rejects(verify(root,manifestPath),/FROZEN_SOURCE_CHANGED/);
  console.log(JSON.stringify({status:'PASS',checks:8,actualFreeze:false,cloudActions:0,syntheticOnly:true}));
} finally {await rm(root,{recursive:true,force:true});}
