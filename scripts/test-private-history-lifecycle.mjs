import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createOwnedRegistration } from '../lib/webmcp/owned-registration.ts';
const compiled = ts.transpileModule(readFileSync('components/OperationHistory.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
async function scenario(mode) {
  const tools = new Map(), removals = [], states = [], refs = [], effects = [];
  let si = 0, ri = 0, ei = 0, calls = 0, signal, resolveFetch;
  const waiting = new Promise(resolve => { resolveFetch = resolve; });
  const registry = {
    registerTool(tool) { tools.set(tool.name, tool); },
    unregisterTool(name) { removals.push(name); return tools.delete(name); },
    ...(mode === 'no-introspection' ? {} : { getTools: mode === 'async' ? async () => [...tools.values()] : () => [...tools.values()] }),
  };
  const module = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(compiled, {
    module, exports: module.exports, AbortController, URLSearchParams,
    window: { modelContext: undefined, location: { hash: '', search: '' } }, navigator: { modelContext: registry },
    fetch: async (_url, options) => { calls++; signal = options.signal; return waiting; },
    require(name) {
      if (name === 'react') return {
        useState(initial) { const index = si++; if (!(index in states)) states[index] = initial; return [states[index], next => { states[index] = next; }]; },
        useRef(initial) { const index = ri++; return refs[index] ?? (refs[index] = { current: initial }); },
        useEffect(fn) { effects[ei++] = fn; }, useCallback: fn => fn,
      };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === '@/lib/webmcp/owned-registration') return { createOwnedRegistration };
      if (name === 'next/link') return { default: 'a' };
      if (name.startsWith('@/components/') || name === './ActivityDashboard') return {};
      throw Error('Unexpected dependency: ' + name);
    },
  });
  const render = () => { si = ri = ei = 0; return module.exports.OperationHistory(); };
  render(); const unmount = effects[0]();
  states[1] = 'bz_read_' + 'a'.repeat(48); states[4] = true;
  render(); const disconnect = effects[1]();
  if (mode === 'async') {
    assert.equal(tools.size, 0, 'Unsupported asynchronous identity enumeration must fail closed before registration');
    assert.equal(states[4], false); disconnect(); unmount(); assert.equal(removals.length, 0); return;
  }
  const tool = tools.get('bazaar_get_operation_history'); assert.ok(tool);
  const pending = tool.execute({}); assert.equal(calls, 1);
  const foreign = { ...tool, execute: async () => 'foreign' };
  if (mode === 'foreign') tools.set(tool.name, foreign);
  disconnect(); assert.equal(signal.aborted, true);
  resolveFetch({ ok: true, json: async () => ({ version: '1', records: [{ private: 'synthetic' }] }) });
  assert.equal((await pending).isError, true, 'Late response cannot expose private data');
  assert.equal((await tool.execute({})).isError, true); assert.equal(calls, 1, 'Detached closure must not fetch again');
  if (mode === 'normal') { assert.equal(tools.size, 0); assert.deepEqual(removals, [tool.name]); }
  else { assert.equal(removals.length, 0); assert.equal(tools.get(tool.name), mode === 'foreign' ? foreign : tool); }
  unmount();
}
for (const mode of ['normal', 'foreign', 'async', 'no-introspection']) await scenario(mode);
console.log('PASS private history component lifecycle: owned removal, foreign replacement preserved, asynchronous introspection fails closed, absent introspection retains only a disconnected closure, in-flight abort and late response rejection. Actual component with React hook double; no browser or network.');
