import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createFileReviewStore } from '../lib/provider-review-store.ts';
const directory=await mkdtemp(join(tmpdir(),'bazaar-review-test-'));
function validate(s){if(s.version!==1 || !Array.isArray(s.records) || s.records.length>100 || s.records.some(r=>typeof r.submission!=='number'))throw Error('corrupt');}
const store=()=>createFileReviewStore(directory,validate);
const moduleUrl=new URL('../lib/provider-review-store.ts',import.meta.url).href;
function child(n){return new Promise((resolve,reject)=>{const code=`import {createFileReviewStore} from ${JSON.stringify(moduleUrl)}; const store=createFileReviewStore(${JSON.stringify(directory)},s=>{if(s.version!==1)throw Error('corrupt')});try {await store.transact(s=>{s.records.push({submission:${n},tokenHash:'h',digest:'d'})});console.log('ok')}catch{console.log('locked')}`;const proc=spawn(process.execPath,['--experimental-strip-types','--input-type=module','-e',code]);let out='';proc.stdout.on('data',x=>out+=x);proc.on('error',reject);proc.on('exit',c=>c===0?resolve(out.trim()):reject(Error('child failure')));});}
try {
 assert.throws(()=>createFileReviewStore('relative-review-directory',validate),/absolute private path/);
 await store().transact(s=>{s.records.push({submission:0,tokenHash:'h',digest:'d'});});
 assert.equal((await store().transact(s=>s.records.length)),1);
 const concurrent=await Promise.all(Array.from({length:8},(_,i)=>child(i+1)));
 assert.equal(await store().transact(s=>s.records.length),1+concurrent.filter(x=>x==='ok').length);
 const persisted=await readFile(join(directory,'review.json'),'utf8');
 await assert.rejects(store().transact(s=>{s.records.push({submission:100,tokenHash:'h',digest:'d'});throw Error('abort');}));
 assert.equal(await readFile(join(directory,'review.json'),'utf8'),persisted);
 await writeFile(join(directory,'review.lock'),'uncertain');
 await assert.rejects(store().transact(()=>null));
 assert.equal(await readFile(join(directory,'review.lock'),'utf8'),'uncertain');
 await rm(join(directory,'review.lock'));
 await writeFile(join(directory,'review.json'),'{bad');
 await assert.rejects(store().transact(()=>null));
 assert.equal(await readFile(join(directory,'review.json'),'utf8'),'{bad');
 await writeFile(join(directory,'review.json'),JSON.stringify({version:1,records:Array.from({length:101},()=>({submission:1}))}));
 await assert.rejects(store().transact(()=>null));
 console.log(JSON.stringify({ok:true,restart:true,independentProcesses:8,concurrentWinners:concurrent.filter(x=>x==='ok').length,abortPreservesState:true,corruptionFailsClosed:true,uncertainLockRetained:true,capacityEnforced:true}));
}finally{await rm(directory,{recursive:true,force:true});}
