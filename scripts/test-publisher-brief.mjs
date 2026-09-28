// Component behavior with deterministic hooks/clipboard. No browser or autonomous-agent execution claim.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../components/PublisherBrief.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
async function scenario(draft,{clipboardFails=false}={}) {
 let state=0,copied=[],notices=[],focus=[],selected=false,network=0;
 const refs=[{current:{open:false}},{current:{focus(){focus.push('instructions')},select(){selected=true}}}];
 const module={exports:{}};
 const context={module,exports:module.exports,require:name=>name==='react'?{useState(initial){const index=state++;return [index===0?draft:initial,value=>{if(index===2)notices.push(value)}]},useRef(){return refs.shift()}}:name==='./ui'?{Button:'button'}:require(name),navigator:{clipboard:{async writeText(value){if(clipboardFails)throw Error('denied');copied.push(value)}}},document:{getElementById(id){return {focus(){focus.push(id)}}}},requestAnimationFrame:fn=>fn(),fetch(){network++;throw Error('Unexpected network')} };
 vm.runInNewContext(compiled,context);
 const tree=module.exports.PublisherBrief();
 const nodes=[]; function visit(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(visit);return;}nodes.push(node);visit(node.props?.children)}visit(tree);
 const prompt=nodes.find(node=>node.props?.id==='brief-instructions-text').props.value;
 nodes.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(network,0);
 return {copied,notices,focus,selected,prompt};
}
const empty={name:'',description:'',audience:'',result:'',price:''};
let result=await scenario(empty);assert.equal(result.copied.length,0);assert.deepEqual(result.focus,['brief-name']);
for(const description of ['Solo tengo una idea, todavía no existe una API.','Ya tengo API: https://provider.example/prompts; reutilizarla sin reemplazarla.']) {
 const draft={name:'Mi servicio exacto',description,audience:'Equipos pequeños',result:'Documento con tres propuestas',price:''};
 result=await scenario(draft);assert.equal(result.copied.length,1);
 for(const text of [draft.name,description,draft.audience,draft.result,'Por definir','API o solo una idea','Reutiliza la implementación existente','revisión manual','Validar la ficha no implica aprobación ni publicación'])assert(result.prompt.includes(text));
 assert(result.notices.includes('Copiado. Pégalo en el chat de tu agente'));
 const invalid=await scenario({...draft,price:'-1'});assert.equal(invalid.copied.length,0);assert.deepEqual(invalid.focus,['brief-price']);
 const priced=await scenario({...draft,price:'0,025'});assert(priced.prompt.includes('0,025 USDC de Testnet'));
 const denied=await scenario(draft,{clipboardFails:true});assert.equal(denied.copied.length,0);assert.equal(denied.selected,true);assert(denied.notices.some(text=>text.includes('manualmente')));
}
console.log('PASS editorial idea/API drafts, preserved input, incomplete/invalid-price prevention, pending price, clipboard fallback and no publishing/network. Component double only.');
