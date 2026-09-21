import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync('lib/market-visitor.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {createVisitor,advanceVisitor}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
let state=createVisitor();const visits=new Set();let prior=state;
for(let i=0;i<1800;i++){state=advanceVisitor(state,.033,0,5);if(state.phase==='collect')visits.add(state.target);assert.ok(state.x>=2.8-1e-6&&state.x<=3.65+1e-6);assert.ok(Math.hypot(state.x-prior.x,state.z-prior.z)<=.033*1.15+1e-6);if(state.x<3.4)assert.ok(Math.abs(state.z+.48)<1e-6||Math.abs(state.z-2.77)<1e-6);prior=state;}
assert.deepEqual([...visits].sort(),[1,3]);state=createVisitor();for(let i=0;i<500;i++)state=advanceVisitor(state,.033,1,5);assert.equal(state.phase,'wait');assert.equal(state.x,3.65);const frozen=advanceVisitor(state,0,0,15);assert.deepEqual(frozen,state);for(let i=0;i<150;i++)state=advanceVisitor(state,.033,0,15);assert.ok(state.carrying);state={...createVisitor(),phase:'observe',x:2.8,z:-.48};for(let i=0;i<50;i++)state=advanceVisitor(state,.033,1,5);assert.equal(state.phase,'wait');assert.equal(state.x,3.65);console.log('PASS two destinations, continuous safe lane, occupied wait, collection, yielding, pause');
