import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const compiled=ts.transpileModule(readFileSync(new URL('../components/PublisherForm.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
async function scenario(clipboard,receipt=null) {
  const states=[],refs={focus:0,select:0};let cursor=0,requests=0;
  const module={exports:{}};
  vm.runInNewContext(compiled,{module,exports:module.exports,navigator:clipboard?{clipboard}:{},encodeURIComponent,
    require:name=>name==='react'?{
      useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>states[i]=value];},
      useMemo(fn){return fn();},useRef(){return {current:{focus(){refs.focus++;},select(){refs.select++;}}};}
    }:name==='./ProviderReviewControls'?{ProviderReviewControls:'review-controls'}:name==='@/lib/discovery'?{validateServiceCard:()=>[]}:require(name),
    fetch:async(url,options)=>{requests++;assert.equal(url,'/api/provider-self-listing');assert.equal(options.method,'POST');return {ok:!!receipt,status:receipt?202:503,json:async()=>receipt?{submission:receipt}:{error:{code:'INTAKE_DISABLED',message:'Conserva la ficha'}}};}
  });
  const render=()=>{cursor=0;const nodes=[];const walk=node=>{if(Array.isArray(node)){node.forEach(walk);return;}if(!node||typeof node!=='object')return;nodes.push(node);walk(node.props?.children);};walk(module.exports.PublisherForm());return nodes;};
  let tree=render();await tree.find(n=>n.type==='button'&&n.props.children==='Copiar manifest / Copy manifest').props.onClick();
  tree=render();assert.equal(requests,0,'Copying must not submit');
  if(!clipboard||clipboard.fails){assert.equal(refs.focus,1);assert.equal(refs.select,1);assert(tree.some(n=>n.props?.role==='status'&&String(n.props.children).includes('manualmente')));}
  assert(tree.some(n=>n.type==='review-controls'),'Dedicated review controls preserve frozen intent');
}
await scenario(null);
await scenario({fails:true,writeText:async()=>{throw Error('denied');}});
await scenario({writeText:async()=>{}},{submissionId:'synthetic-submission',expiresAt:'2030-01-01T00:00:00Z',status:'awaiting-control-proof',control:{method:'http-well-known',domain:'example.invalid',verificationPath:'/.well-known/test.txt',expectedRecord:'synthetic-challenge'}});
console.log('PASS seller form copy/fallback, no submission on copy, separate review controls; component doubles only.');
