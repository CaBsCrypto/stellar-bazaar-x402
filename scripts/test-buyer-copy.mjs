import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync('components/ui/CopyText.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
for(const fails of [false,true]){
 let status='',copied='',focus=0,selection=0,refIndex=0;
 const alternatives={current:{open:false}},area={current:{focus(){focus++},select(){selection++}}};
 const module={exports:{}};
 const jsx=(type,props)=>({type,props});
 vm.runInNewContext(code,{module,exports:module.exports,navigator:{clipboard:{async writeText(text){if(fails)throw Error('clipboard denied');copied=text}}},require(name){
  if(name==='react')return {useId:()=> 'test-copy',useRef:()=>[alternatives,area][refIndex++],useState:()=>['',next=>status=next]};
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(name==='./index')return {Button:'button'};
  throw Error(name);
 }});
 const tree=module.exports.CopyText({text:'Public buyer instructions',label:'Instrucciones',compact:true});
 const nodes=[];function visit(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(visit);return;}nodes.push(node);visit(node.props?.children)}visit(tree);
 const buttons=nodes.filter(n=>n.type==='button');
 await buttons.find(n=>Array.isArray(n.props.children)&&n.props.children[0]==='Copiar ').props.onClick();
 if(fails){assert.match(status,/No se pudo copiar/);assert.equal(alternatives.current.open,true);assert.equal(focus,1);assert.equal(selection,1);assert.equal(copied,'');}
 else{assert.equal(copied,'Public buyer instructions');assert.match(status,/Copiado/);assert.equal(focus,0);}
 buttons.find(n=>n.props.children==='Seleccionar texto').props.onClick();assert.equal(selection,fails?2:1);
}
console.log('PASS actual CopyText handler: exact text, accessible success, denied clipboard opens manual selection and focuses text. Clipboard API mocked.');
