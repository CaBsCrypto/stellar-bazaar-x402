import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const source=readFileSync('components/MarketCatalog.tsx','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const fixed=Date.parse('2026-10-10T12:00:00Z');
async function view(availability,{paused=false,empty=false,purchasesEnabled}={}){
 const slots=[],effects=[],intervals=[],requests=[];let cursor=0,tree,clock=fixed;
 const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},useRef(initial){return slots[cursor++]??={current:initial};},useEffect(fn,deps){const i=cursor++,prior=slots[i];if(!prior||deps.some((v,j)=>v!==prior.deps[j]))effects.push(()=>{prior?.cleanup?.();slots[i]={deps,cleanup:fn()};});}};
 const jsx=(type,props)=>({type,props}),module={exports:{}};
 vm.runInNewContext(compiled,{module,exports:module.exports,AbortController,URLSearchParams,Date:class extends Date{static now(){return clock;}},setTimeout:()=>1,clearTimeout(){},setInterval(fn){intervals.push(fn);return intervals.length;},clearInterval(){},
  fetch:async(url,options)=>{assert(String(url).startsWith('/api/market/catalog?'));requests.push(options);return{ok:true,json:async()=>({paused,purchasesEnabled,services:empty?[]:[{submissionId:'synthetic-service',cardHash:'a'.repeat(64),availability,status:'activated',card:{id:'guionista-test',name:'Guionista sintético',description:'Texto sintético',tags:[],input:[],payment:{amount:'0.01',asset:'USDC'}}}]})};},
  require(name){if(name==='react')return hooks;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='./ui')return{ButtonLink:props=>jsx('a',props),SectionHeading:props=>jsx('header',props)};if(name==='@/lib/delivery-contract')return{deliveryStorage:()=>({mode:'text'})};if(name==='./MarketCatalog.module.css')return{default:{}};throw Error('Unexpected module');}});
 function render(){cursor=0;tree=module.exports.MarketCatalog({standalone:true});while(effects.length)effects.shift()();}
 function nodes(node){if(arguments.length===0)node=tree;if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(n=>nodes(n));if(typeof node.type==='function')return nodes(node.type(node.props));return[node,...nodes(node.props?.children)];}
 function text(node){if(arguments.length===0)node=tree;if(node==null||typeof node==='boolean')return'';if(Array.isArray(node))return node.map(n=>text(n)).join('');if(typeof node!=='object')return String(node);return text(typeof node.type==='function'?node.type(node.props):node.props?.children);}
 render();await tick();render();assert.equal(requests.length,1);assert.equal(requests[0].cache,'no-store');assert.equal(requests[0].credentials,'same-origin');assert.equal(requests[0].redirect,'error');
 return{text,nodes,expire(){clock=fixed+360001;intervals.forEach(fn=>fn());render();}};
}
const checks=[];
for(const [label,availability,expected]of[
 ['missing',undefined,/Disponibilidad sin comprobar/],['unavailable',{ready:false,reason:'SELLER_UNAVAILABLE'},/Vendedor no disponible/],
 ['exhausted',{ready:false,reason:'SELLER_CAPACITY_EXHAUSTED'},/Sin cupo para nuevas compras/],['expired',{ready:true,leaseExpiresAt:new Date(fixed-1).toISOString()},/Vendedor no disponible/],
 ['invalid lease',{ready:true,leaseExpiresAt:'invalid'},/Vendedor no disponible/]]){
 const h=await view(availability);assert.match(h.text(),expected);assert.match(h.text(),/Guionista sintético/);assert(!h.nodes().some(n=>n.type==='a'&&h.text(n)==='Comprar con mi agente'));assert(h.nodes().some(n=>n.type==='a'&&h.text(n)==='Conectar para consultar'));checks.push(label);
}
const ready=await view({ready:true,leaseExpiresAt:new Date(fixed+360000).toISOString(),reason:null});assert.match(ready.text(),/reserva el cupo antes del pago/);assert(ready.nodes().some(n=>n.type==='a'&&ready.text(n)==='Comprar con mi agente'));ready.expire();assert(!ready.nodes().some(n=>n.type==='a'&&ready.text(n)==='Comprar con mi agente'));checks.push('ready expires without network or purchase');
const paused=await view({ready:true,leaseExpiresAt:new Date(fixed+360000).toISOString()},{paused:true});assert.match(paused.text(),/Compras pausadas/);assert(!paused.nodes().some(n=>n.type==='a'&&paused.text(n)==='Comprar con mi agente'));checks.push('global pause overrides seller ready');
const disabled=await view({ready:true,leaseExpiresAt:new Date(fixed+360000).toISOString()},{purchasesEnabled:false});assert.match(disabled.text(),/Nuevas compras pausadas en este despliegue/);assert(!disabled.text().includes('Nuevas publicaciones y compras pausadas'));assert(!disabled.nodes().some(n=>n.type==='a'&&disabled.text(n)==='Comprar con mi agente'));assert(disabled.nodes().some(n=>n.type==='a'&&n.props.href==='/hub?service=guionista-test'&&disabled.text(n)==='Conectar para consultar'));checks.push('deployment purchase disable overrides live seller capacity without claiming publications paused');
const empty=await view(undefined,{empty:true});assert.match(empty.text(),/Aún no hay servicios activos/);checks.push('empty catalogue remains understandable');
console.log(JSON.stringify({status:'PASS',checks:checks.length,actualComponent:true,networkRequests:0,realPayments:0,scope:'synthetic catalogue availability and CTA; server still enforces capacity'}));
