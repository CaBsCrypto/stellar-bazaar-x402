// Read-only real source inspection and synthetic configuration checks. No freeze.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {productionVercelConfiguration,inspectProductionSource,GUARDIAN_CRONS,PREVIEW_MANIFEST,PREVIEW_MANIFEST_SHA256} from './prepare-continuous-production-bazaar-source.mjs';
import {createHash} from 'node:crypto';

let checks=0;
const before={buildCommand:'next build --webpack',regions:['iad1'],crons:[],functions:{'app/api/**/route.ts':{maxDuration:60}},git:{deploymentEnabled:{main:false}}};
const bytes=Buffer.from(JSON.stringify(before));
const after=JSON.parse(productionVercelConfiguration(bytes).toString('utf8'));
assert.deepEqual(after,{...before,crons:GUARDIAN_CRONS});checks++;
assert.deepEqual(JSON.parse(bytes.toString('utf8')),before);checks++;
assert.throws(()=>productionVercelConfiguration(Buffer.from(JSON.stringify({...before,crons:[{path:'/unknown',schedule:'* * * * *'}]}))),/CRON_FREE_PREVIEW_REQUIRED/);checks++;
assert.throws(()=>productionVercelConfiguration(Buffer.from('{}')),/CRON_FREE_PREVIEW_REQUIRED/);checks++;
const manifestBytes=await readFile(PREVIEW_MANIFEST);assert.equal(createHash('sha256').update(manifestBytes).digest('hex'),PREVIEW_MANIFEST_SHA256);checks++;
const {plan,configBytes}=await inspectProductionSource();assert.equal(plan.files.length,336);checks++;
assert.equal(plan.identicalSourceFiles,335);assert.equal(plan.changedSourceFiles,1);checks++;
assert.deepEqual(plan.changes.map(c=>c.path),['vercel.json']);checks++;
assert.deepEqual(JSON.parse(configBytes.toString('utf8')).crons,GUARDIAN_CRONS);checks++;
assert.equal(plan.privateFilesIncluded,0);assert.equal(plan.productionPublished,false);assert.equal(plan.cronActivated,false);assert.equal(plan.environmentApplied,false);checks++;
assert.deepEqual(await readFile(PREVIEW_MANIFEST),manifestBytes,'Inspect must not modify the accepted manifest');checks++;
console.log(JSON.stringify({status:'PASS',checks,filesInspected:336,identicalFiles:335,onlyChange:'vercel.json crons proposal',actualFreeze:false,networkRequests:0,cloudMutations:0,environmentApplied:false,cronActivated:false,newPayments:0}));
