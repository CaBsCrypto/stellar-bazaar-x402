import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const source=resolve('../provider-guionista-recovered/src'),out=resolve('../provider-guionista-recovered/local-text-build');
const files=['marketplace-text.ts','engine/script-generator.ts','engine/wpm-calculator.ts','engine/gemini-client.ts','views/teleprompter-template.ts'];
for(const file of files){const text=await readFile(join(source,file),'utf8');const built=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;const target=join(out,file.replace(/\.ts$/,'.js'));await mkdir(dirname(target),{recursive:true});await writeFile(target,built);}
let calls=0;globalThis.fetch=()=>{calls++;throw Error('NO_NETWORK_ALLOWED');};
const {generateMarketplaceText}=await import(pathToFileURL(join(out,'marketplace-text.js')));
const inputs=[{topic:'Una comunidad de desarrolladores',durationSeconds:15,tone:'energético'},{topic:'Tutorial de jardinería',durationSeconds:30,tone:'calmado'},{topic:'Stellar testnet',durationSeconds:20,tone:'educativo'}];
const results=inputs.map(input=>{const text=generateMarketplaceText(input);assert.equal(generateMarketplaceText(input),text);assert.ok(text.length>100&&text.length<=2000);assert.ok(text.includes(input.topic));return {characters:text.length};});
for(const input of [null,{}, {...inputs[0],durationSeconds:120},{...inputs[0],topic:'x'.repeat(201)},{...inputs[0],extra:true}])assert.throws(()=>generateMarketplaceText(input),/INVALID_INPUT/);
assert.equal(calls,0);
const report={status:'PASS_LOCAL_REAL_RECOVERED_ENGINE',results,networkRequests:0,modelCalls:0,payments:0,legacyProviderModified:false,limitation:'Text adapter local only: hosted control proof, signed testnet payment and external MCP seller execution still pending.'};
await writeFile('docs/evidence/sprint-marketplace/provider-text-local.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
