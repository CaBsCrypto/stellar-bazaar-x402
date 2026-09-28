import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync('components/AdminOperationsDashboard.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
async function scenario({lost=false,late=false}={}) {
 const state=[],refs=[],effects=[];let si=0,ri=0,ei=0,calls=0,resolveFetch,rejectFetch,focused=0,hash='#key=bz_magic_'+'a'.repeat(48);
 const storage={removeItem(){},getItem(){throw Error('must not read credentials')},setItem(){throw Error('must not persist credentials')}};
 const pending=new Promise((resolve,reject)=>{resolveFetch=resolve;rejectFetch=reject});
 const module={exports:{}};
 const jsx=(type,props)=>({type,props});
 vm.runInNewContext(code,{module,exports:module.exports,URLSearchParams,AbortController,localStorage:storage,
  window:{location:{get hash(){return hash},pathname:'/admin',search:''},history:{replaceState(){hash=''}}},
  fetch:async()=>{calls++;return pending},setInterval(){throw Error('must not poll')},console:{log(){throw Error('must not log')}},
  require(name){if(name==='react')return {
   useState(initial){const i=si++;if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=value}]},
   useRef(initial){const i=ri++;return refs[i]??(refs[i]={current:initial})},useCallback:fn=>fn,
   useEffect(fn,deps){const i=ei++;effects[i]={fn,deps}}
  };if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};if(name==='next/link')return {default:'a'};throw Error(name)}
 });
 const render=()=>{si=ri=ei=0;return module.exports.AdminOperationsDashboard()};
 const nodes=tree=>{const out=[];const visit=n=>{if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(visit);return}out.push(n);visit(n.props?.children)};visit(tree);return out};
 render(); const mount=effects[1].fn;const cleanup=mount();cleanup();mount();assert.equal(calls,1,'StrictMode cannot redeem twice');assert.equal(hash,'');
 const stats={totalVolumeUSDC:'0',bazaarTreasuryFeesUSDC:'0',providerDisbursementsUSDC:'0',totalInvocations:0,totalSettlements:0,settlementSuccessRate:'0',averageSettlementLatencyMs:0,network:'test',sorobanFeeSplitRouter:'test',storageMode:'double',servicesCount:0,activeAgents:[]};
 if(late) {
  const logout=nodes(render()).find(x=>x.type==='button'&&JSON.stringify(x.props.children).match(/Cerrar sesi/i));
  assert.ok(logout);logout.props.onClick();
 }
 if(lost) rejectFetch(new Error('synthetic connection lost'));
 else resolveFetch({ok:true,json:async()=>({stats,builtInServices:[],dynamicServices:[]})});
 await new Promise(resolve=>setImmediate(resolve));
 let tree=render();assert.equal(calls,1);assert.equal(state.includes('bz_magic_'+'a'.repeat(48)),false);
 if(late){assert.equal(state.includes(stats),false);assert.equal(state[7],false,'late result must not authenticate');return;}
 if(lost){assert.ok(state.some(x=>typeof x==='string'&&x.includes('Solicita un enlace nuevo')));return;}
 const all=nodes(tree);const title=all.find(x=>x.type==='h1');title.props.ref.current={focus(){focused++}};effects[0].fn();assert.equal(focused,1);
 const refresh=all.find(x=>x.type==='button'&&x.props.children==='Consulta de un solo uso');assert.ok(refresh);assert.equal(refresh.props.disabled,true);
 const logout=all.find(x=>x.type==='button'&&JSON.stringify(x.props.children).match(/Bloquear|Cerrar sesi/i));assert.ok(logout,'logout present');logout.props.onClick();render();assert.equal(state.includes(stats),false);assert.equal(calls,1);
}
await scenario();await scenario({lost:true});await scenario({late:true});
console.log('PASS admin component hooks: StrictMode setup replay has one OTP request, URL cleared, no storage/polling/retry, result focus, disabled refresh, logout clears stats, lost response requires new link. React hook double, not browser evidence.');
