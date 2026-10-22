import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {consumeMarketOperatorFragment,parseMarketOperatorCapsule,validMarketOperatorAccess} from '../lib/market-review-access.ts';
const compiled=ts.transpileModule(readFileSync('components/MarketReview.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const origin='https://bazaar.example',operator='o'.repeat(43),other='x'.repeat(43),submissionId='aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const service=(status='pending-manual-review')=>({submissionId,status,card:{id:'synthetic-text',name:'Synthetic provider',description:'Offline test only',url:'https://provider.example',routeTemplate:'/text',network:'stellar:testnet',provider:{name:'Synthetic owner'},payment:{amount:'0.01',asset:'USDC',destination:'PUBLIC_ONLY'}},control:{method:'http-well-known',status:'verified',domain:'provider.example'},review:undefined});
const queue=(status='pending-manual-review',page=1)=>({submissions:[service(status)],page,pageSize:5,total:6,totalPages:2});
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
function harness(href=origin+'/market-review'){
  const slots=[],effects=[],requests=[],history=[];let cursor=0,tree;const location={origin,href},listeners=new Map();
  const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]={value:initial};return[slots[i].value,value=>slots[i].value=typeof value==='function'?value(slots[i].value):value];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useEffect(fn,deps){const i=cursor++,prior=slots[i];if(!prior||deps.some((v,j)=>v!==prior.deps[j]))effects.push(()=>{prior?.cleanup?.();slots[i]={deps,cleanup:fn()};});}};
  const jsx=(type,props)=>({type,props}),module={exports:{}};
  vm.runInNewContext(compiled,{module,exports:module.exports,URL,URLSearchParams,AbortController,TextDecoder,Uint8Array,Response,location,setTimeout,clearTimeout,
    window:{location,history:{state:null,replaceState(state,unused,path){history.push(path);location.href=new URL(path,origin).href;}},addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}},
    fetch(path,options){assert.equal(new URL(path,origin).pathname,'/api/market/review');const d=deferred();requests.push({path,options,...d});return d.promise;},
    require(name){if(name==='react')return hooks;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='../lib/market-review-access')return{consumeMarketOperatorFragment,parseMarketOperatorCapsule,validMarketOperatorAccess};throw Error('Unexpected module '+name);}
  });
  function render(){cursor=0;tree=module.exports.default();while(effects.length)effects.shift()();return tree;}
  function nodes(node){if(arguments.length===0)node=tree;if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(value=>nodes(value));return[node,...nodes(node.props?.children)];}
  function text(node){if(arguments.length===0)node=tree;if(node==null||typeof node==='boolean')return'';if(Array.isArray(node))return node.map(value=>text(value)).join('');if(typeof node!=='object')return String(node);return text(node.props?.children);}
  function button(label){const item=nodes().find(n=>n.type==='button'&&text(n)===label);assert(item,'Missing button '+label);return item;}
  function input(id){const item=nodes().find(n=>n.props?.id===id);assert(item,'Missing input '+id);return item;}
  async function answer(value,index=requests.length-1,status=200){requests[index].resolve(Response.json(value,{status}));await tick();render();}
  function close(){slots.forEach(s=>s?.cleanup?.());}
  function verify(){for(const {path,options}of requests){const access=options.headers.Authorization.slice(7);assert.equal(path.includes(access),false);assert.equal(options.body?.includes(access)??false,false);assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.equal(options.credentials,'same-origin');}}
  return{render,nodes,text,button,input,answer,requests,history,location,close,verify};
}
let checks=0;
{
  const h=harness(origin+'/market-review#token='+operator);h.render();h.render();assert.equal(h.requests.length,0,'Fragment load never performs an action');assert.equal(h.location.href,origin+'/market-review');assert.equal(h.text().includes(operator),false);
  h.button('Consultar cola y recuperar estado').props.onClick();h.render();assert.equal(h.requests.length,1);assert.equal(h.requests[0].options.method,'GET');assert.equal(h.requests[0].options.headers.Authorization,'Bearer '+operator);await h.answer(queue());
  h.input('reason-'+submissionId).props.onChange({target:{value:'Review accepted for synthetic test'}});h.render();h.button('Aprobar ficha').props.onClick();h.render();assert.equal(h.requests.length,1);assert.equal(h.button('Confirmar acción').props.disabled,true);
  const checkbox=h.nodes().find(n=>n.type==='input'&&n.props.type==='checkbox');checkbox.props.onChange({target:{checked:true}});h.render();h.button('Confirmar acción').props.onClick();h.render();assert.equal(h.requests.length,2);assert.deepEqual(JSON.parse(h.requests[1].options.body),{submissionId,action:'approve',reason:'Review accepted for synthetic test'});
  await h.answer({error:{code:'SYNTHETIC_UNKNOWN'}},1,503);assert.match(h.text(),/No se repetirá automáticamente/);assert.equal(h.button('Confirmar acción').props.disabled,true);h.button('Confirmar acción').props.onClick();h.render();assert.equal(h.requests.length,2,'An uncertain action is never retried');
  h.button('Consultar cola y recuperar estado').props.onClick();h.render();assert.equal(h.requests[2].options.method,'GET');await h.answer(queue('approved-for-staging'),2);assert(h.button('Activar servicio'));assert.equal(h.text().includes('Confirmar acción'),false);h.verify();h.close();checks++;
}
{
  const h=harness(origin+'/market-review?token='+operator+'#token='+operator);h.render();h.render();assert.equal(h.location.href,origin+'/market-review');assert.equal(h.requests.length,0);assert(h.input('market-review-access'));assert.match(h.text(),/Enlace inválido/);h.close();checks++;
}
{
  const h=harness();h.render();h.render();const file=JSON.stringify({kind:'bazaar-market-operator-access',version:1,origin:'https://other.example',token:operator});await h.input('market-review-file').props.onChange({currentTarget:{files:[{size:file.length,text:async()=>file}],value:'selected'}});h.render();assert.match(h.text(),/no es un acceso de operador válido/);assert.equal(h.requests.length,0);h.close();checks++;
}
{
  const h=harness();h.render();h.render();const file=JSON.stringify({kind:'bazaar-market-operator-access',version:1,origin,token:operator});await h.input('market-review-file').props.onChange({currentTarget:{files:[{size:file.length,text:async()=>file}],value:'selected'}});h.render();assert.equal(h.requests.length,0);h.button('Consultar cola y recuperar estado').props.onClick();h.render();h.button('Cerrar acceso').props.onClick();h.render();await h.answer(queue());assert(h.input('market-review-access'));assert.equal(h.text().includes('Synthetic provider'),false,'A late private reply cannot populate a closed access');h.verify();h.close();checks++;
}
{
  const h=harness(origin+'/market-review#token='+operator);h.render();h.render();h.button('Consultar cola y recuperar estado').props.onClick();h.render();await h.answer(queue());h.button('Página siguiente').props.onClick();h.render();assert.equal(new URL(h.requests[1].path,origin).searchParams.get('page'),'2');await h.answer(queue('pending-manual-review',2),1);assert.equal(h.button('Página siguiente').props.disabled,true);assert.equal(h.button('Página anterior').props.disabled,false);h.button('Cerrar acceso').props.onClick();h.render();h.input('market-review-access').props.onChange({target:{value:other}});h.render();const form=h.nodes().find(n=>n.type==='form');form.props.onSubmit({preventDefault(){}});h.render();assert.equal(h.text().includes('Synthetic provider'),false,'Access switching removes the prior queue');h.verify();h.close();checks++;
}
console.log(JSON.stringify({status:'PASS',checks,networkRequests:0,payments:0,scope:'actual component hook harness; token scrub, operator file origin, explicit actions, uncertain recovery, stale replies and pagination'}));
