import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {parsePilotAccess,createPilotAccess} from '../lib/pilot-access.ts';

// Execute the component's real handlers with in-memory hooks and inert children.
// No browser, private capsule, transport, storage or hosted evidence is used.
const source=readFileSync(new URL('../components/HistoryEntry.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const token='A'.repeat(43),other='B'.repeat(43);
const capsule=value=>JSON.stringify({version:1,kind:'bazaar-private-read-access',token,...value});
const jsx=(type,props)=>({type,props});
function harness(initialUrl='https://example.invalid/historial',marketEnabled=true){
 const slots=[],effects=[],cleanups=[],listeners=new Map();let cursor=0,updates=0,tree;
 const react={useState:initial=>{const i=cursor++;slots[i]??={value:initial};return[slots[i].value,value=>{updates++;slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},useRef:initial=>{const i=cursor++;return slots[i]??=( {current:initial} );},useEffect:fn=>{const i=cursor++;if(!slots[i]){slots[i]={effect:true};effects.push(()=>{const cleanup=fn();if(cleanup)cleanups.push(cleanup);});}}};
 const window={location:{href:initialUrl},history:{state:null,replaceState(_state,_title,url){window.location.href=new URL(url,window.location.href).href;}},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
 for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw Error('PERSISTENCE_FORBIDDEN');}});
 const module={exports:{}};
 const require=name=>{
  if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'Fragment'};
  if(name==='next/dynamic')return{__esModule:true,default:()=> 'OperationHistory'};
  if(name==='./ui')return{Button:'Button'};
  if(name==='../lib/pilot-access')return{parsePilotAccess};
  if(name==='./MarketplaceWorkspace')return{__esModule:true,default:'MarketplaceWorkspace'};
  if(['./DeliverableReview','./Navbar','./Footer','./Breadcrumbs'].includes(name)){const label=name.slice(2);return{[label]:label};}
  throw Error('UNEXPECTED_IMPORT:'+name);
 };
 vm.runInNewContext(code,{exports:module.exports,module,require,URL,URLSearchParams,TextEncoder,window,location:{origin:new URL(initialUrl).origin},fetch(){throw Error('NETWORK_FORBIDDEN');}});
 const render=()=>{cursor=0;tree=module.exports.HistoryEntry({marketEnabled});if(effects.length){for(const effect of effects.splice(0))effect();cursor=0;tree=module.exports.HistoryEntry({marketEnabled});}return tree;};
 const walk=(value,predicate)=>{if(!value||typeof value!=='object')return null;if(predicate(value))return value;for(const child of [value.props?.children,value.props?.accessEntry]){for(const item of Array.isArray(child)?child:[child]){const found=walk(item,predicate);if(found)return found;}}return null;};
 const find=predicate=>walk(tree,predicate);
 const input=id=>{const element=find(x=>x.type==='input'&&x.props.id===id);assert.ok(element,'Missing input '+id);return element;};
 const load=file=>{const element=input('history-access-capsule'),target={files:file?[file]:[],value:'fake-access.json'};const result=element.props.onChange({currentTarget:target});assert.equal(target.value,'','File selection must clear immediately');return result;};
 render();
 return{render,find,input,load,window,updates:()=>updates,unmount:()=>{for(const cleanup of cleanups)cleanup();},hash:url=>{window.location.href=url;listeners.get('hashchange')?.();},manual:value=>{input('manual-history-access').props.onChange({target:{value}});render();},submit:()=>{const form=find(x=>x.type==='form');assert.ok(form);form.props.onSubmit({preventDefault(){}});render();},access:()=>find(x=>x.type==='MarketplaceWorkspace')?.props.access,error:()=>find(x=>x.props?.role==='alert')};
}
const file=(raw,{size=Buffer.byteLength(raw),text=()=>Promise.resolve(raw)}={})=>({size,text});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
let checks=0;
const check=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};

await check('valid capsule restores existing private view without URL or storage',async()=>{const h=harness(),url=h.window.location.href;await h.load(file(capsule()));h.render();assert.equal(h.access(),token);assert.equal(h.window.location.href,url);const lock=h.find(x=>x.type==='MarketplaceWorkspace').props.onLock;lock();h.render();assert.equal(h.access(),undefined);assert.ok(h.input('history-access-capsule'));});
await check('exact 4096-byte valid capsule accepted',async()=>{const raw=capsule()+' '.repeat(4096-Buffer.byteLength(capsule())),h=harness();await h.load(file(raw));h.render();assert.equal(h.access(),token);});
const rejected=[['malformed','{'],['null','null'],['array','[]'],['missing token',JSON.stringify({version:1,kind:'bazaar-private-read-access'})],['wrong version',capsule({version:2})],['string version',capsule({version:'1'})],['wrong kind',capsule({kind:'other'})],['short token',capsule({token:'A'.repeat(42)})],['long token',capsule({token:'A'.repeat(44)})],['invalid token character',capsule({token:'!'+token.slice(1)})],['nonstring token',capsule({token:1})],['extra field',capsule({anything:true})],['seed field',capsule({seed:'NEVER_RENDER_THIS_FAKE_SEED'})],['private key field',capsule({privateKey:'NEVER_RENDER_THIS_FAKE_PRIVATE_KEY'})],['prototype field','{"version":1,"kind":"bazaar-private-read-access","token":"'+token+'","__proto__":{}}']];
for(const[name,raw]of rejected)await check(name+' rejected without payload disclosure',async()=>{const h=harness();await h.load(file(raw));h.render();assert.equal(h.access(),undefined);const error=h.error();assert.ok(error);assert.equal(h.input('history-access-capsule').props['aria-invalid'],true);assert.match(h.input('history-access-capsule').props['aria-describedby'],/history-capsule-error/);assert.ok(!JSON.stringify(error).includes('NEVER_RENDER'));});
await check('oversize file rejects before reading its contents',async()=>{let reads=0;const h=harness();await h.load(file(capsule(),{size:4097,text:()=>{reads++;return Promise.resolve(capsule());}}));h.render();assert.equal(reads,0);assert.ok(h.error());assert.equal(h.access(),undefined);});
await check('decoded byte bound enforced independently of file metadata',async()=>{const h=harness();await h.load(file(capsule()+' '.repeat(4096),{size:1}));h.render();assert.ok(h.error());assert.equal(h.access(),undefined);});
await check('unreadable file exposes only the generic alert',async()=>{const h=harness();await h.load(file(capsule(),{text:()=>Promise.reject(Error('NEVER_RENDER_THIS_FAKE_READ_ERROR'))}));h.render();assert.ok(h.error());assert.ok(!JSON.stringify(h.error()).includes('NEVER_RENDER'));});
await check('late file cannot replace manually submitted access',async()=>{const h=harness(),d=deferred(),pending=h.load(file(capsule(),{text:()=>d.promise}));h.render();assert.ok(h.find(x=>x.props?.role==='status'));h.manual(other);h.submit();assert.equal(h.access(),other);d.resolve(capsule());await pending;h.render();assert.equal(h.access(),other);assert.equal(h.error(),null);});
await check('manual editing cancels a pending file without submitting',async()=>{const h=harness(),d=deferred(),pending=h.load(file(capsule(),{text:()=>d.promise}));h.manual(other);d.resolve(capsule());await pending;h.render();assert.equal(h.access(),undefined);assert.equal(h.input('manual-history-access').props.value,other);});
await check('late file cannot reopen after lock',async()=>{const h=harness('https://example.invalid/historial#token='+other),lock=h.find(x=>x.type==='MarketplaceWorkspace').props.onLock;lock();h.render();const d=deferred(),pending=h.load(file(capsule(),{text:()=>d.promise}));lock();d.resolve(capsule());await pending;h.render();assert.equal(h.access(),undefined);assert.ok(h.input('history-access-capsule'));});
await check('market starts locked without showing fixtures or a demo action',async()=>{const h=harness();assert.equal(h.access(),undefined);assert.equal(h.find(x=>x.type==='DeliverableReview'),null);assert.equal(h.find(x=>x.type==='Button'&&x.props.children==='Explorar demostración'),null);});
await check('root recovery file restores human only at the same origin',async()=>{const packet=createPilotAccess('https://example.invalid'),h=harness();await h.load(file(JSON.stringify(packet)));h.render();assert.equal(h.access(),packet.human);assert.notEqual(h.access(),packet.agent);const otherOrigin=harness('https://other.invalid/history');await otherOrigin.load(file(JSON.stringify(packet)));otherOrigin.render();assert.equal(otherOrigin.access(),undefined);assert.ok(otherOrigin.error());});
await check('late completion after unmount makes no state updates',async()=>{const h=harness(),d=deferred(),pending=h.load(file(capsule(),{text:()=>d.promise}));h.unmount();const before=h.updates();d.resolve(capsule());await pending;assert.equal(h.updates(),before);});
await check('late read error after unmount makes no state updates',async()=>{const h=harness(),d=deferred(),pending=h.load(file(capsule(),{text:()=>d.promise}));h.unmount();const before=h.updates();d.reject(Error('fake error'));await pending;assert.equal(h.updates(),before);});
await check('a newer capsule wins over an older pending file',async()=>{const h=harness(),d=deferred(),pending=h.load(file(capsule(),{text:()=>d.promise}));await h.load(file(capsule({token:other})));d.resolve(capsule());await pending;h.render();assert.equal(h.access(),other);});
await check('hash access invalidates pending file and preserves URL cleanup',async()=>{const h=harness(),d=deferred(),pending=h.load(file(capsule(),{text:()=>d.promise}));h.hash('https://example.invalid/historial?keep=yes&token='+token+'#token='+other+'&view=market');d.resolve(capsule());await pending;h.render();assert.equal(h.access(),other);assert.equal(h.window.location.href,'https://example.invalid/historial?keep=yes#view=market');});
await check('canceling selection clears pending state and alerts',async()=>{const h=harness();await h.load(file('{'));h.render();assert.ok(h.error());await h.load(undefined);h.render();assert.equal(h.error(),null);assert.equal(h.access(),undefined);});
console.log(`${checks} offline capsule/async checks PASS; 0 hosted requests, no real tokens, no browser acceptance claim.`);
