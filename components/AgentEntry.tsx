"use client";

import {useId,useRef,useState} from 'react';
import {bazaarAgentEntryPrompt,BAZAAR_PUBLIC_MCP_PATH} from '@/lib/bazaar-integration-contract';
import {useUiLanguage} from './UiLanguage';
import {useBazaarOrigin} from './useBazaarOrigin';
import {Button,Card} from './ui';

export function AgentEntry({id,compact=false,headingLevel=2,title}:{id?:string;compact?:boolean;headingLevel?:1|2|3;title?:string}){
 const {language}=useUiLanguage(),origin=useBazaarOrigin(),titleId=useId(),promptId=useId();
 const area=useRef<HTMLTextAreaElement>(null);
 const [result,setResult]=useState<{text:string;state:'copied'|'manual'}|null>(null);
 const prompt=bazaarAgentEntryPrompt(origin,language),publicMcp=origin+BAZAAR_PUBLIC_MCP_PATH;
 const es=language==='es';
 const Heading=headingLevel===1?'h1':headingLevel===3?'h3':'h2';
 const status=result?.text===prompt?result.state==='copied'?(es?'Copiado.':'Copied.'):(es?'Selecciona el texto y cópialo.':'Select the text and copy it.'):'';
 async function copy(){
  setResult(null);
  try{await navigator.clipboard.writeText(prompt);setResult({text:prompt,state:'copied'});}
  catch{area.current?.focus();area.current?.select();setResult({text:prompt,state:'manual'});}
 }
 return <Card id={id} className={`agent-entry${compact?' agent-entry--compact':''}`} aria-labelledby={titleId} data-agent-entry>
  <Heading id={titleId}>{title??(es?'Conecta tu agente':'Connect your agent')}</Heading>
  <p className="ui-muted">{es?'Copia estas instrucciones en tu agente para conectar con Bazaar y descubrir su integración.':'Give your agent these instructions to connect to Bazaar and discover its integration.'}</p>
  <a className="agent-entry-url" href={publicMcp}><code>{publicMcp}</code></a>
  <label className="agent-entry-label" htmlFor={promptId}>{es?'Instrucciones de conexión':'Connection prompt'}</label>
  <textarea id={promptId} ref={area} readOnly value={prompt} rows={3} spellCheck={false} data-agent-entry-prompt/>
  <div className="agent-entry-actions">
   <Button onClick={copy}>{es?'Copiar instrucciones':'Copy connection prompt'}</Button>
   <a href="/INTEGRATION.md">{es?'Leer guía de integración':'Read integration guide'}</a>
  </div>
  <p role="status" aria-live="polite" className="agent-entry-status ui-muted">{status}</p>
  <details className="agent-entry-formats"><summary>{es?'Otros formatos':'Other formats'}</summary><div><a href="/api/integration">{es?'Contrato JSON':'JSON contract'}</a><a href="/chatgpt-mcp.json">{es?'Configuración MCP pública':'Public MCP configuration'}</a></div></details>
 </Card>;
}
