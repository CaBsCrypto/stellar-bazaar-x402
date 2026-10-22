import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

// Exercise the actual client with synthetic server pages; no provider, payment or network.
const compiled=ts.transpileModule(readFileSync('components/MarketCatalog.tsx','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}
}).outputText;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const item=(id,name=id)=>({submissionId:id,cardHash:'a'.repeat(64),status:'activated',
  availability:{ready:true,leaseExpiresAt:'2099-01-01T00:00:00Z'},
  card:{id,name,description:'Synthetic service',tags:['text'],input:[],payment:{amount:'0.01',asset:'USDC'}}});
function harness(){
  const slots=[],effects=[],requests=[];let cursor=0,tree;
  const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},
    useRef(initial){return slots[cursor++]??={current:initial};},
    useEffect(fn,deps){const i=cursor++,prior=slots[i];if(!prior||deps.some((v,j)=>v!==prior.deps[j]))effects.push(()=>{prior?.cleanup?.();slots[i]={deps,cleanup:fn()};});}};
  const jsx=(type,props)=>({type,props}),module={exports:{}};
  vm.runInNewContext(compiled,{module,exports:module.exports,AbortController,URLSearchParams,Date,
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},
    fetch(url,options){const parsed=new URL(url,'https://bazaar.invalid');assert.equal(parsed.pathname,'/api/market/catalog');assert.equal(options.method,undefined);
      assert.equal(options.cache,'no-store');assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');assert.equal(options.headers,undefined);
      let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});requests.push({url:String(url),query:parsed.searchParams,options,resolve,reject});return promise;},
    require(name){if(name==='react')return hooks;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='./ui')return{ButtonLink:props=>jsx('a',props),SectionHeading:props=>jsx('header',props)};
      if(name==='@/lib/delivery-contract')return{deliveryStorage:()=>({mode:'text'})};if(name==='./MarketCatalog.module.css')return{default:{}};throw Error('Unexpected module '+name);}});
  function render(){cursor=0;tree=module.exports.MarketCatalog({standalone:true});while(effects.length)effects.shift()();}
  function nodes(node){if(arguments.length===0)node=tree;if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(n=>nodes(n));if(typeof node.type==='function')return nodes(node.type(node.props));return[node,...nodes(node.props?.children)];}
  function text(node){if(arguments.length===0)node=tree;if(node==null||typeof node==='boolean')return'';if(Array.isArray(node))return node.map(n=>text(n)).join('');if(typeof node!=='object')return String(node);return text(typeof node.type==='function'?node.type(node.props):node.props?.children);}
  function button(label){const found=nodes().find(n=>n.type==='button'&&text(n)===label);assert(found,'Missing button '+label);return found;}
  function click(label){const found=button(label);assert.equal(found.props.disabled,false,label+' must be enabled');found.props.onClick();render();}
  function draft(value){nodes().find(n=>n.type==='input'&&n.props.id==='market-catalog-search').props.onChange({target:{value}});render();}
  function search(value){draft(value);nodes().find(n=>n.type==='form'&&n.props.role==='search').props.onSubmit({preventDefault(){}});render();}
  async function answer(index,body,ok=true){requests[index].resolve({ok,json:async()=>body});await tick();render();}
  function size(limit){nodes().find(n=>n.type==='select').props.onChange({target:{value:String(limit)}});render();}
  render();return{requests,render,nodes,text,button,click,draft,search,answer,size};
}
const checks=[];
async function check(name,run){await run();checks.push(name);}
async function ready(){const h=harness();await h.answer(0,{services:[item('first-page')],nextCursor:'catalog-page-two'});return h;}

await check('typing is local; explicit search trims and encodes the whole server query',async()=>{
  const h=await ready();h.draft('  video & guión  ');assert.equal(h.requests.length,1);
  h.search('  video & guión  ');assert.equal(h.requests.length,2);assert.equal(h.requests[1].query.get('q'),'video & guión');
  assert.equal(h.requests[1].query.has('cursor'),false);assert(!h.text().includes('first-page'),'Previous query results are cleared');
  await h.answer(1,{services:[item('outside-first-page','Servidor encontró otro servicio')]});
  assert.match(h.text(),/Servidor encontró otro servicio/);assert.match(h.text(),/en todos los servicios activos/);
});
await check('search pages retain query and selected service through detail and connection links',async()=>{
  const h=await ready();h.search('guión');await h.answer(1,{services:[item('guionista-text')],nextCursor:'search-page-two'});
  assert(h.nodes().some(n=>n.type==='a'&&n.props.href==='/resources/guionista-text'));
  assert(h.nodes().some(n=>n.type==='a'&&n.props.href==='/hub?service=guionista-text'&&h.text(n)==='Comprar con mi agente'));
  h.click('Siguiente');assert.equal(h.requests[2].query.get('q'),'guión');assert.equal(h.requests[2].query.get('cursor'),'search-page-two');
  await h.answer(2,{services:[item('page-two')]});assert.match(h.text(),/Página 2/);
  h.click('Anterior');assert.equal(h.requests[3].query.get('q'),'guión');assert.equal(h.requests[3].query.has('cursor'),false);
});
await check('clear resets query, opaque cursor and visible results from a later search page',async()=>{
  const h=await ready();h.search('guión');await h.answer(1,{services:[item('search-first')],nextCursor:'search-next'});
  h.click('Siguiente');await h.answer(2,{services:[item('search-second')]});h.click('Limpiar búsqueda');
  assert.equal(h.requests[3].query.has('q'),false);assert.equal(h.requests[3].query.has('cursor'),false);
  assert(!h.text().includes('search-second'));assert.match(h.text(),/Página 1/);
  await h.answer(3,{services:[item('catalog-again')]});assert(!h.text().includes('Resultados para'));
});
await check('replacement query aborts the old request and ignores its late success',async()=>{
  const h=await ready();h.search('old');h.search('new');assert.equal(h.requests[1].options.signal.aborted,true);
  await h.answer(2,{services:[item('new-result')]});await h.answer(1,{services:[item('stale-result')],nextCursor:'stale-next'});
  assert.match(h.text(),/new-result/);assert(!h.text().includes('stale-result'));assert.equal(h.button('Siguiente').props.disabled,true);
});
await check('replacement query also ignores a late request failure',async()=>{
  const h=await ready();h.search('old');h.search('new');await h.answer(2,{services:[item('current-result')]});
  h.requests[1].reject(Error('stale failure'));await tick();h.render();assert.match(h.text(),/current-result/);
  assert(!h.nodes().some(n=>n.props?.role==='alert'));
});
await check('page-size change resets search cursor and preserves the committed query',async()=>{
  const h=await ready();h.search('text');await h.answer(1,{services:[item('search')],nextCursor:'search-next'});
  h.click('Siguiente');await h.answer(2,{services:[item('later')]});h.size(20);
  assert.equal(h.requests[3].query.get('limit'),'20');assert.equal(h.requests[3].query.get('q'),'text');assert.equal(h.requests[3].query.has('cursor'),false);
  await h.answer(3,{services:[item('larger')]});assert.match(h.text(),/Página 1/);
});
await check('empty search explains recovery and never offers a purchase',async()=>{
  const h=await ready();h.search('missing');await h.answer(1,{services:[]});assert.match(h.text(),/No encontramos servicios para esta búsqueda/);
  assert(!h.nodes().some(n=>n.type==='a'&&h.text(n)==='Comprar con mi agente'));assert.equal(h.button('Siguiente').props.disabled,true);
});
await check('refresh preserves committed query even with an unsubmitted draft',async()=>{
  const h=await ready();h.search('committed');await h.answer(1,{services:[item('current')]});h.draft('unsubmitted');h.click('Actualizar esta página');
  assert.equal(h.requests[2].query.get('q'),'committed');await h.answer(2,{error:{code:'STORAGE_UNAVAILABLE'}},false);
  assert.match(h.text(),/No pudimos comprobar/);assert(!h.text().includes('current'));h.click('Actualizar esta página');assert.equal(h.requests[3].query.get('q'),'committed');
});
console.log(JSON.stringify({status:'PASS',checks:checks.length,scenarios:checks,actualComponent:true,externalRequests:0,realPayments:0}));
