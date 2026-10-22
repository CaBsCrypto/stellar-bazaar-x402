import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {providerProductionConfig,verifyProviderProductionSource} from './prepare-continuous-production-provider-source.mjs';
const raw=await readFile('.vercel/continuous-provider-preview-source-20261011/vercel.json');
const before=JSON.parse(raw),after=JSON.parse(providerProductionConfig(raw));
assert.deepEqual(after.crons,[{path:'/api/bazaar/seller/tick',schedule:'*/2 * * * *'}]);
assert.deepEqual({...after,crons:[]},before);assert.deepEqual(before.crons,[]);
assert.throws(()=>providerProductionConfig(Buffer.from(JSON.stringify({...before,crons:[{path:'/wrong',schedule:'* * * * *'}]}))),/REVIEWED_UNSCHEDULED_PROVIDER_REQUIRED/);
const oldFetch=globalThis.fetch;let networkRequests=0;globalThis.fetch=async()=>{networkRequests++;throw Error('OFFLINE_ONLY');};
try{const verified=await verifyProviderProductionSource();assert.equal(verified.identicalSourceFiles,21);assert.equal(verified.files,22);assert.equal(verified.privateFilesRead,false);assert.equal(verified.productionPublished,false);assert.equal(verified.cronActivated,false);assert.equal(networkRequests,0);console.log(JSON.stringify({status:'PASS',checks:10,sourceDigest:verified.sourceDigest,manifestSha256:verified.manifestSha256,files:22,identicalFiles:21,onlyChangedFile:'vercel.json',networkRequests,privateProfileReads:0,cronActivated:false,productionPublished:false}));}finally{globalThis.fetch=oldFetch;}
