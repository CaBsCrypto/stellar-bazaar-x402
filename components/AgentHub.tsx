"use client";
import {UiText,useUiLanguage} from '@/components/UiLanguage';
import {useId,useRef,useState} from 'react';
import {AgentDirectConnectCard} from './AgentDirectConnectCard';
import {ButtonLink,Card} from './ui';
import {CopyText} from './ui/CopyText';
import {useBazaarOrigin} from './useBazaarOrigin';
import {serviceSelectionHref} from '@/lib/service-selection';
import {SelectedServiceContext} from './SelectedServiceContext';
import {AgentEntry} from './AgentEntry';
import {BazaarRules} from './BazaarRules';

export type AgentHubTab='buy'|'sell'|'connect';
const tabs:readonly AgentHubTab[]=['buy','sell','connect'];

export function AgentHub({compact=false,serviceId,headingLevel=2,initialTab='connect'}:{compact?:boolean;serviceId?:string;headingLevel?:1|2;initialTab?:AgentHubTab}){
 const {t,language}=useUiLanguage(),es=language==='es',baseId=useId();
 const [selected,setSelected]=useState<AgentHubTab>(tabs.includes(initialTab)?initialTab:'connect');
 const refs=useRef<Array<HTMLButtonElement|null>>([]),origin=useBazaarOrigin();
 const config=JSON.stringify({mcpServers:{bazaar:{type:'http',url:origin+'/api/mcp'}}},null,2);
 const chatGptConfig=JSON.stringify({mcpServers:{'bazaar-public-catalogue':{type:'streamable-http',url:origin+'/api/chatgpt/mcp',extensions:{'com.openai':{auth:{type:'none'}}}}}},null,2);
 const labels=es?{buy:'Comprar',sell:'Vender',connect:'Conectar'}:{buy:'Buy',sell:'Sell',connect:'Connect'};
 return <>
  {headingLevel===1&&<header className="connect-heading"><h1 className="ui-page-title">{es?'Conectar mi agente':'Connect My Agent'}</h1><p className="ui-muted">{es?'Elige comprar, vender o conectar tu agente con Bazaar.':'Choose to buy, sell or connect your agent to Bazaar.'}</p></header>}
  <SelectedServiceContext serviceId={serviceId}/>
  <div role="tablist" aria-label={es?'Conectar mi agente':'Connect My Agent'} className="ui-tabs" data-agent-hub-tabs>
   {tabs.map((tab,index)=><button key={tab} ref={element=>{refs.current[index]=element;}} type="button" role="tab" id={baseId+'-tab-'+tab} aria-controls={baseId+'-panel-'+tab} aria-selected={selected===tab} tabIndex={selected===tab?0:-1} onClick={()=>setSelected(tab)} onKeyDown={event=>{
    let next=index;
    if(event.key==='ArrowRight')next=(index+1)%tabs.length;
    else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=tabs.length-1;
    else return;
    event.preventDefault();setSelected(tabs[next]);refs.current[next]?.focus();
   }}>{labels[tab]}</button>)}
  </div>
  {tabs.map(tab=>{
   const Panel=compact||tab==='connect'?'div':Card,active=selected===tab;
   return <Panel key={tab} className="agent-hub-panel" role="tabpanel" id={baseId+'-panel-'+tab} aria-labelledby={baseId+'-tab-'+tab} tabIndex={active?0:-1} hidden={!active}>
    {active&&(tab!=='connect'?<AgentDirectConnectCard key={tab} compact={compact} role={tab==='buy'?'buyer':'seller'} serviceId={serviceId}/>:<>
     <AgentEntry compact={compact} headingLevel={compact?3:2} title={es?'Conecta con Bazaar':'Connect to Bazaar'}/>
     <div className="ui-actions" data-self-service-entry><ButtonLink href={serviceSelectionHref('/open',serviceId)}>{es?'Crear o recuperar mi espacio':'Create or restore my workspace'}</ButtonLink><ButtonLink href={serviceSelectionHref('/history',serviceId)} variant="secondary">{es?'Abrir mi historial privado':'Open my private history'}</ButtonLink></div>
     <p className="ui-muted">{es?'Prepara tu acceso en tu propio dispositivo. Conserva la recuperación y entrega sólo el acceso de agente a tu cliente. El alta y los pedidos dependen de los recursos disponibles.':'Prepare access on your own device. Keep your recovery file and give only agent access to your client. Registration and orders depend on available resources.'}</p>
     <details className="agent-hub-mcp"><summary>{es?'Configuración MCP avanzada':'Advanced MCP configuration'}</summary>
      <p className="ui-muted"><UiText text="Conecta cualquier cliente MCP compatible por HTTP. El catálogo público funciona sin credencial. Tu conexión privada utiliza exclusivamente el acceso de agente de tu propio espacio."/></p>
      <CopyText text={origin+'/api/mcp'} label="URL MCP" rows={2} compact/>
      <CopyText text={config} label={es?'Conexión MCP general: añade sólo tu acceso de agente para acciones privadas':'General MCP connection: add only your agent access for private actions'} compact={compact}/>
      <section aria-label={es?'Conexión pública en ChatGPT':'Public connection in ChatGPT'}>
       <h3>{es?'ChatGPT: conexión pública':'ChatGPT: public connection'}</h3>
       <p>{es?'Agrega esta URL como servidor MCP personalizado en ChatGPT y elige Sin autenticación. Ofrece el catálogo público y la documentación de integración.':'Add this URL as a custom MCP server in ChatGPT and choose No authentication. It provides the public catalogue and integration documentation.'}</p>
       <CopyText text={origin+'/api/chatgpt/mcp'} label={es?'URL de catálogo para ChatGPT':'ChatGPT catalogue URL'} rows={2} compact/>
       <CopyText text={chatGptConfig} label={es?'Configuración ChatGPT sin credenciales':'ChatGPT configuration without credentials'} compact={compact}/>
       <p className="ui-muted">{es?'Los pedidos y el historial privados utilizan la conexión de agente separada de tu propio cliente.':'Private orders and history use the separate agent connection in your own client.'}</p>
       <a href="/chatgpt-mcp.json" download>{es?'Descargar configuración pública':'Download public configuration'}</a>
      </section>
      <div className="ui-actions"><ButtonLink href="/INTEGRATION.md" variant="quiet"><UiText text="Guía de integración y recuperación"/></ButtonLink></div>
     </details>
    </>)}
   </Panel>;
  })}
  <BazaarRules/>
 </>;
}
