import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const source=readFileSync(new URL('../components/PrivateAgentChat.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let cursor=0,tree;const slots=[], effects=[], listeners=new Map(), requests=[];
const hooks={useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value}];},useRef(initial){const i=cursor++;return slots[i]??=( {current:initial} );},useEffect(fn,deps){const i=cursor++;const prior=slots[i];if(!prior||deps.some((value,index)=>value!==prior.deps[index]))effects.push(()=>{prior?.cleanup?.();slots[i]={deps,fn,cleanup:fn()};});}};
const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
globalThis.window={location:{href:'http://localhost/agent-chat',assign(){}},history:{replaceState(_a,_b,path){window.location.href=new URL(path,window.location.href).href;}},addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name);}};
globalThis.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));
const module={exports:{}},require=createRequire(import.meta.url);
new Function('require','module','exports',code)(name=>name==='react'?hooks:require(name),module,module.exports);
function render(){cursor=0;tree=module.exports.PrivateAgentChat();while(effects.length)effects.shift()();return tree;}
function nodes(node=tree,result=[]){if(Array.isArray(node)){node.forEach(x=>nodes(x,result));return result;}if(node&&typeof node==='object'&&node.props){result.push(node);if(node.props.children!==undefined)nodes(node.props.children,result);}return result;}
function button(text){return nodes().find(n=>n.type==='button'&&n.props.children===text);}
function change(access){window.location.href='http://localhost/agent-chat#token='+access;listeners.get('hashchange')();render();assert(!window.location.href.includes('token='));}
async function resolve(index,title){requests[index].resolve({ok:true,status:200,json:async()=>({conversations:[{conversationId:title,title,messages:[],tasks:[]}]})});await new Promise(r=>setImmediate(r));render();}
const tokenA='a'.repeat(48),tokenB='b'.repeat(48);
try {
 render();assert.equal(requests.length,0);change(tokenA);assert.equal(requests.length,1);await resolve(0,'Owner A');
 assert(nodes().some(n=>n.type==='option'&&n.props.children==='Owner A'));
 nodes().find(n=>n.type==='textarea').props.onChange({target:{value:'Private draft'}});render();
 button('Bloquear').props.onClick();render();assert(!nodes().some(n=>n.type==='textarea'));
 change('invalid');assert.equal(requests.length,1);change(tokenA);assert.equal(requests.length,2);await resolve(1,'Owner A');
 assert.equal(nodes().find(n=>n.type==='textarea').props.value,'');
 // Begin an old owner request, then replace its access while that response is delayed.
 button('Actualizar mensajes').props.onClick();render();assert.equal(requests.length,3);change(tokenB);assert.equal(requests.length,4);assert(requests[2].options.signal.aborted);
 assert(!nodes().some(n=>n.type==='option'&&n.props.children==='Owner A'));
 await resolve(2,'STALE OWNER A');assert(!nodes().some(n=>n.type==='option'&&n.props.children==='STALE OWNER A'));
 await resolve(3,'Owner B');assert(nodes().some(n=>n.type==='option'&&n.props.children==='Owner B'));
 const mountEffect=slots.find(slot=>slot?.deps?.length===0);mountEffect.cleanup();mountEffect.cleanup=mountEffect.fn();assert.equal(requests.length,5);assert.equal(requests[4].options.headers.Authorization,'Bearer '+tokenB);await resolve(4,'Owner B');
 for(const slot of slots)slot?.cleanup?.();assert(!listeners.has('hashchange'));
 console.log('PASS executed component lifecycle with hook/HTTP doubles: same-page reentry, malformed fragment removal, owner replacement, draft clearing, abort, late response isolation and listener cleanup. Not a browser test.');
} finally {globalThis.window=oldWindow;globalThis.fetch=oldFetch;}


