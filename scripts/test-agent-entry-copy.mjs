import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const slots = [], effects = [];
let cursor = 0, tree;
const hooks = {
  useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
  useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
  useEffect(fn, deps) { const i = cursor++; if (!slots[i]) { slots[i] = { deps }; effects.push(fn); } },
};
const modules = new Map();
function load(path) {
  if (modules.has(path)) return modules.get(path);
  const source = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} }; modules.set(path, module.exports);
  new Function('require', 'module', 'exports', code)(name => name === 'react' ? hooks : name === '@/components/useBazaarOrigin' || name === './useBazaarOrigin' ? load('components/useBazaarOrigin.ts') : name === '@/lib/testnet-funding' ? load('lib/testnet-funding.ts') : name === './bazaar-skills' || name === '@/lib/bazaar-skills' ? load('lib/bazaar-skills.ts') : name === '@/components/ui/CopyText' || name === './ui/CopyText' ? { CopyText: 'CopyText' } : name === '@/components/ui' || name === './ui' ? { ButtonLink: 'ButtonLink', Card:'Card', Button:'button' } : name === './AgentDirectConnectCard' ? {AgentDirectConnectCard:'AgentDirectConnectCard'} : require(name), module, module.exports);
  return module.exports;
}
function nodes(node = tree, found = []) { if (Array.isArray(node)) node.forEach(value => nodes(value, found)); else if (node?.props) { found.push(node); if (node.props.children !== undefined) nodes(node.props.children, found); } return found; }
function render(component, props) { cursor = 0; tree = component(props); while (effects.length) effects.shift()(); return tree; }
function reset() { slots.length = 0; effects.length = 0; cursor = 0; }
const oldWindow = globalThis.window, oldDocument = globalThis.document, oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
let selected = 0, focused = 0, clipboardValue, finishCopy, failCopy;
globalThis.window = { location: { protocol: 'http:', origin: 'http://127.0.0.1:3282' }, getSelection: () => ({ removeAllRanges() {}, addRange() { selected++; } }) };
globalThis.document = { createRange: () => ({ selectNodeContents() {} }) };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw Error('blocked'); } } } });
try {
  const component = load('components/DocsCodeTabs.tsx').DocsCodeTabs;
  render(component); render(component);
  assert.match(nodes().find(node => node.type === 'code').props.children, /http:\/\/127\.0\.0\.1:3282\/api\/mcp/);
  const codeRef = slots.find(slot => slot?.current === null); codeRef.current = { focus() { focused++; } };
  const copy = () => nodes().find(node => node.type === 'button' && node.props.title === 'Copiar código').props.onClick();
  await copy(); render(component);
  assert.match(nodes().find(node => node.props.role === 'status').props.children, /^No se pudo copiar/);
  assert.equal(selected, 1); assert.equal(focused, 1);
  navigator.clipboard.writeText = value => new Promise((resolve, reject) => { clipboardValue = value; finishCopy = resolve; failCopy = reject; });
  const pending = copy(); render(component);
  assert(!nodes().find(node => node.props.role === 'status').props.children.startsWith('Copiado.'));
  finishCopy(); await pending; render(component);
  assert.match(nodes().find(node => node.props.role === 'status').props.children, /^Copiado\./);
  assert.match(clipboardValue, /http:\/\/127\.0\.0\.1:3282\/api\/mcp/);
  const second = copy(); render(component);
  assert.equal(nodes().find(node => node.props.role === 'status').props.children, '', 'New pending attempt must clear the previous success');
  failCopy(Error('blocked')); await second; render(component);
  assert.match(nodes().find(node => node.props.role === 'status').props.children, /^No se pudo copiar/);
  assert.equal(selected, 2);
  const stale = copy();
  nodes().find(node => node.type === 'button' && node.props.children?.[0]?.props?.children === 'Python (LangChain & CrewAI)').props.onClick(); render(component);
  finishCopy(); await stale; render(component);
  assert.equal(nodes().find(node => node.props.role === 'status').props.children, '');
  assert.match(nodes().find(node => node.type === 'code').props.children, /BAZAAR_URL = "http:\/\/127\.0\.0\.1:3282"/);
  nodes().find(node => node.type === 'button' && node.props.children === 'Seleccionar código').props.onClick(); assert.equal(selected, 3);
  const card = load('components/AgentDirectConnectCard.tsx').AgentDirectConnectCard;
  for (const role of ['buyer', 'seller']) {
    reset(); render(card, { role }); render(card, { role });
    const prompt = nodes().find(node => node.type === 'CopyText').props.text;
    assert.match(prompt, /http:\/\/127\.0\.0\.1:3282\/skills\//);
    assert.match(prompt, /http:\/\/127\.0\.0\.1:3282\/api\/mcp/);
    assert(!prompt.includes('https://bazaar.browns.studio'));
  }
  reset(); const hub = load('components/AgentHub.tsx').AgentHub; render(hub, {}); render(hub, {});
  nodes().find(node => node.props.role === 'tab' && node.props.children === 'MCP').props.onClick(); render(hub, {});
  const config = JSON.parse(nodes().find(node => node.type === 'CopyText').props.text);
  assert.equal(config.mcpServers['stellar-bazaar'].url, 'http://127.0.0.1:3282/api/mcp');
  reset(); const brief=load('components/PublisherBrief.tsx').PublisherBrief; render(brief); render(brief);
  const name = '  Servicio humano con espacios  ';
  nodes().find(node => node.props.id === 'brief-name').props.onChange({target:{value:name}}); render(brief);
  const prepared = nodes().find(node => node.props.id === 'brief-instructions-text').props.value;
  assert(prepared.includes('Nombre: '+name)); assert(!prepared.includes('https://bazaar.browns.studio'));
  for(const path of ['/PROVIDER_ONBOARDING.md','/docs','/llms.txt','/skills/seller/SKILL.md','/api/mcp']) assert(prepared.includes('http://127.0.0.1:3282'+path));
  console.log('PASS entry origin and executed clipboard/hook doubles: current localhost references, denied clipboard/manual selection, confirmation only after completion, stale completion ignored, buyer/seller same environment. Not a browser test.');
} finally {
  globalThis.window = oldWindow; globalThis.document = oldDocument;
  if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator;
}
