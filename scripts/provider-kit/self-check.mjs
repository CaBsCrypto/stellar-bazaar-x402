import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';

const root=dirname(fileURLToPath(import.meta.url));let attempts=0;
globalThis.fetch=async()=>{attempts++;throw Error('SELF_CHECK_NETWORK_DISABLED');};
const manifest=JSON.parse(await readFile(resolve(root,'MANIFEST.json'),'utf8'));
for(const entry of manifest.files){
 const bytes=await readFile(resolve(root,entry.path));assert.equal(bytes.length,entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,entry.path);
 if(entry.path.startsWith('examples/')&&entry.path.endsWith('.mjs'))await import(pathToFileURL(resolve(root,entry.path)).href);
}
const {assertSellerCard,sellerHash,sellerCanonical}=await import('./examples/seller-service-card.mjs');
const {validateSellerConfiguration}=await import('./examples/seller-mcp-transport.mjs');
const card=JSON.parse(await readFile(resolve(root,'native-text-service-card.example.json'),'utf8'));
assertSellerCard(card);const configuration=JSON.parse(await readFile(resolve(root,'configuration.example.json'),'utf8'));
validateSellerConfiguration(configuration);assert.equal(configuration.cardHash,sellerHash(sellerCanonical(card)));
const template=await import('./adapter-template.mjs');assert.equal((await template.availability()).ready,false);
assert.equal(attempts,0);
console.log(JSON.stringify({status:'PASS',files:manifest.files.length,networkRequests:0,signedPayments:0,adapterConfigured:false,replaceSyntheticPublicConfiguration:true}));
