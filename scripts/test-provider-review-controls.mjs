import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const code=ts.transpileModule(readFileSync(new URL('../components/ProviderReviewControls.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const states=[],requests=[];let cursor=0,offline=true,selected=0;
let responseSubmission={submissionId:'saved-id',status:'awaiting-control-proof',control:{}};
const module={exports:{}};
vm.runInNewContext(code,{module,exports:module.exports,crypto:webcrypto,Uint8Array,structuredClone,encodeURIComponent,
  navigator:{clipboard:{writeText:async()=>{throw Error('denied');}}},
  require:name=>name==='react'?{
    useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>states[i]=value];},
    useRef(){return {current:{focus(){},select(){selected++;}}};}
  }:require(name),
  fetch:async(url,options)=>{requests.push({url,options});if(offline)throw Error('lost');return {ok:true,json:async()=>({submission:responseSubmission})};},
});
let card={id:'synthetic-card'};
function render(){cursor=0;const nodes=[];const walk=n=>{if(Array.isArray(n))return n.forEach(walk);if(!n||typeof n!=='object')return;nodes.push(n);walk(n.props?.children);};walk(module.exports.ProviderReviewControls({card,method:'dns-txt',domain:'example.invalid',disabled:false}));return nodes;}
const button=(nodes,label)=>nodes.find(n=>n.type==='button'&&n.props.children===label);
let nodes=render();button(nodes,'Preparar solicitud de revisión').props.onClick();nodes=render();
assert.equal(requests.length,0);
const intent=JSON.parse(nodes.find(n=>n.type==='textarea'&&n.props['aria-label']==='Acceso privado de solicitud').props.value);
assert.match(intent.submissionToken,/^[a-f0-9]{64}$/);
assert.equal(button(nodes,'Enviar la misma solicitud').props.disabled,true);
await button(nodes,'Copiar acceso privado').props.onClick();assert.equal(selected,1);
nodes.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});
card={id:'edited-after-preparation'};nodes=render();
await button(nodes,'Enviar la misma solicitud').props.onClick();nodes=render();
assert(JSON.stringify(nodes).includes('Respuesta incierta'));
assert.equal(requests.length,1,'No automatic retries');
assert.equal(JSON.parse(requests[0].options.body).card.id,'synthetic-card','Frozen intent, not current edited form');
assert(!requests[0].options.body.includes(intent.submissionToken));
assert.equal(requests[0].options.headers.Authorization,`Bearer ${intent.submissionToken}`);
offline=false;await button(nodes,'Consultar esta solicitud').props.onClick();nodes=render();
assert.equal(requests[1].options.method,'GET');
assert.equal(requests[1].url,`/api/provider-self-listing/${intent.submissionId}`);
assert(!requests[1].url.includes(intent.submissionToken));
assert(nodes.some(n=>n.type==='textarea'&&n.props['aria-label']==='Comprobante de solicitud'));
assert(!button(nodes,'Preparar una corrección nueva'),'Pending or unrelated receipts cannot reset intent');
for(const terminal of ['rejected','expired']){
  const current=JSON.parse(nodes.find(n=>n.type==='textarea'&&n.props['aria-label']==='Acceso privado de solicitud').props.value);
  responseSubmission={submissionId:'unrelated-id',status:terminal,control:{}};
  await button(nodes,'Consultar esta solicitud').props.onClick();nodes=render();
  assert(!button(nodes,'Preparar una corrección nueva'),'A recovered different request cannot reset current intent');
  responseSubmission={submissionId:current.submissionId,status:terminal,control:{}};
  await button(nodes,'Consultar esta solicitud').props.onClick();nodes=render();
  assert.equal(button(nodes,'Preparar una corrección nueva').props.disabled,true);
  button(nodes,'Preparar una corrección nueva').props.onClick();nodes=render();
  assert(!button(nodes,'Preparar solicitud de revisión'),'Acknowledgement is required by handler');
  nodes.filter(n=>n.type==='input'&&n.props.type==='checkbox').at(-1).props.onChange({target:{checked:true}});nodes=render();
  const before=requests.length;
  button(nodes,'Preparar una corrección nueva').props.onClick();nodes=render();
  button(nodes,'Preparar solicitud de revisión').props.onClick();nodes=render();
  const next=JSON.parse(nodes.find(n=>n.type==='textarea'&&n.props['aria-label']==='Acceso privado de solicitud').props.value);
  assert.notEqual(next.submissionId,current.submissionId);assert.notEqual(next.submissionToken,current.submissionToken);
  assert.equal(next.card.id,'edited-after-preparation');assert.equal(requests.length,before);
  assert.equal(button(nodes,'Enviar la misma solicitud').props.disabled,true,'New access must be saved separately');
}
offline=true;await button(nodes,'Consultar esta solicitud').props.onClick();nodes=render();
assert(!button(nodes,'Preparar una corrección nueva'),'Uncertain results never offer reset');
assert(!readFileSync(new URL('../components/ProviderReviewControls.tsx',import.meta.url),'utf8').match(/localStorage|sessionStorage/));
console.log('PASS private intent saved before send, frozen payload, no automatic retry, same-ID recovery, private header, copy fallback; component doubles.');
