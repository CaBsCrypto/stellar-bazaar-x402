import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {createPrivateReadQueue} from '../lib/private-read-queue.ts';
const source=readFileSync(new URL('../components/PrivatePurchase.tsx',import.meta.url),'utf8');assert(!source.includes('setInterval'));
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let cursor=0,tree;const slots=[],effects=[],requests=[];
const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]={value:initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useEffect(fn,deps){const i=cursor++;const prior=slots[i];if(!prior||deps.some((v,j)=>v!==prior.deps[j]))effects.push(()=>{prior?.cleanup?.();slots[i]={deps,cleanup:fn()};});},useCallback(fn){cursor++;return fn;}};
const originalFetch=globalThis.fetch;globalThis.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));
const module={exports:{}},require=createRequire(import.meta.url),Workspace=()=>null;
const serializedPrivateRead=createPrivateReadQueue();
new Function('require','module','exports',compiled)(name=>name==='react'?hooks:name==='@/lib/private-read-queue'?{serializedPrivateRead}:name==='./DeliverableViewer'?{PurchaseWorkspace:Workspace,ReadableLegacy:()=>null,OriginalResult:()=>null}:require(name),module,module.exports);
let props={record:{clientOperationId:'operation-a',delivery:{result:{simulation:true}}},token:'synthetic-a',events:[],legacyDownload:null};
function render(){cursor=0;tree=module.exports.PrivatePurchase(props);while(effects.length)effects.shift()();return tree;}
function children(){return tree.props.children;}
function workspace(){return children().find(node=>node.type===Workspace);}
function button(){return children().find(node=>node.type==='button');}
async function answer(index,ids){requests[index].resolve({ok:true,status:200,json:async()=>({versions:ids.map(versionId=>({manifest:{versionId}}))})});await new Promise(r=>setImmediate(r));render();}
try{
 render();assert.equal(requests.length,1);await answer(0,['one','two']);workspace().props.onVersion(1);render();assert.equal(workspace().props.selected,1);
 button().props.onClick();render();assert.equal(requests.length,2);await answer(1,['one','two']);assert.equal(workspace().props.selected,1);
 button().props.onClick();render();props={...props,token:'synthetic-b',record:{...props.record,clientOperationId:'operation-b'}};render();assert(requests[2].options.signal.aborted);render();assert.deepEqual(workspace().props.versions,[]);
 await answer(2,['old-owner']);assert.deepEqual(workspace().props.versions,[]);await answer(3,['new-owner']);assert.equal(workspace().props.versions[0].manifest.versionId,'new-owner');assert.equal(workspace().props.selected,0);
 for(const slot of slots)slot?.cleanup?.();assert(requests[3].options.signal.aborted);
 console.log('PASS delivery initial/manual refresh with executed hooks/HTTP doubles: selection preserved, old owner requests aborted and late results ignored. No browser or external storage.');
}finally{globalThis.fetch=originalFetch;}
