import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {services,getService} from '../lib/catalog.ts';
import {toServiceCard,toPaidService} from '../lib/service-card.ts';
import {parseServiceCardShape} from '../lib/service-card-schema.ts';
import {paymentLabel} from '../lib/payment-options.ts';
const require=createRequire(import.meta.url);
const fixture={...toServiceCard(services[0]),id:'dynamic-render',name:'Dynamic render fixture'};
let registry={entries:[{id:fixture.id,card:fixture}],available:true};
const compiled=ts.transpileModule(readFileSync('app/resources/[id]/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const module={exports:{}};
const deps={
 '@/lib/payment-options':{paymentLabel},'next/navigation':{notFound(){throw Error('NOT_FOUND')}},
 '@/lib/catalog':{services,getService},'@/lib/dynamic-registry':{readDynamicServiceCards:async()=>registry},
 '@/lib/service-card':{toPaidService},'@/lib/service-card-schema':{parseServiceCardShape},
 '@/lib/service-portfolio':{getServicePortfolio:()=>undefined},
};
vm.runInNewContext(compiled,{module,exports:module.exports,require:name=>{
 if(name.endsWith('.css'))return {};
 if(deps[name])return deps[name];
 if(name==='@/components/ui')return {Pill:({children})=>React.createElement('span',null,children)};
 if(name.startsWith('@/components/'))return {[name.split('/').at(-1)]:()=>null};
 return require(name);
}});
const render=async(id)=>renderToStaticMarkup(await module.exports.default({params:Promise.resolve({id})}));
const html=await render(fixture.id);assert.match(html,/Dynamic render fixture/);assert.match(html,/No declarada/);assert.match(html,/Formato no declarado/);assert(!html.includes('&lt;500ms'));assert(!html.includes('<li>result</li>'));assert(!html.includes('<li>data</li>'));
await assert.rejects(()=>render('pending-submission'),/NOT_FOUND/);
registry={entries:[],available:false};await assert.rejects(()=>render(fixture.id),/UNAVAILABLE/);
// Static entry remains renderable even while the external registry is unavailable.
assert.match(await render(services[0].id),/Swap Risk/);
console.log('PASS actual detail component rendered with synthetic public entry, no invented latency/output; missing/pending absent; unavailable explicit; static preserved. No network.');
