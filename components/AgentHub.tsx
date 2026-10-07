"use client";
import {useRef,useState} from "react";
import {AgentDirectConnectCard} from "./AgentDirectConnectCard";
import {ButtonLink,Card} from "./ui";
import {CopyText} from "./ui/CopyText";
import {useBazaarOrigin} from "./useBazaarOrigin";
const tabs=["Comprar","Publicar","MCP"];
export function AgentHub({compact=false}:{compact?:boolean}){const [selected,setSelected]=useState(0);const refs=useRef<Array<HTMLButtonElement|null>>([]);
 const origin=useBazaarOrigin(),config=JSON.stringify({mcpServers:{bazaar:{type:'http',url:origin+"/api/mcp"}}},null,2);
 const Panel=compact?"div":Card;
 return <><div role="tablist" aria-label="Cómo conectar tu agente" className="ui-tabs">{tabs.map((label,index)=><button key={label} ref={el=>{refs.current[index]=el;}} type="button" role="tab" id={`hub-tab-${index}`} aria-controls={`hub-panel-${index}`} aria-selected={selected===index} tabIndex={selected===index?0:-1} onClick={()=>setSelected(index)} onKeyDown={event=>{let next=index;if(event.key==="ArrowRight")next=(index+1)%3;else if(event.key==="ArrowLeft")next=(index+2)%3;else if(event.key==="Home")next=0;else if(event.key==="End")next=2;else return;event.preventDefault();setSelected(next);refs.current[next]?.focus();}}>{label}</button>)}</div>
 <Panel role="tabpanel" id={`hub-panel-${selected}`} aria-labelledby={`hub-tab-${selected}`} tabIndex={0}>{selected<2?<AgentDirectConnectCard key={selected} compact={compact} role={selected===0?"buyer":"seller"}/>:<>{!compact&&<h2>Conecta tu cliente MCP</h2>}<p className="ui-muted">Conecta cualquier cliente MCP compatible por HTTP. El catálogo público funciona sin credencial. Tu conexión privada utiliza exclusivamente el acceso de agente de tu propio espacio.</p><CopyText text={origin+'/api/mcp'} label='URL MCP' rows={2} compact/><CopyText text={config} label="Configuración MCP pública" compact={compact}/><div className="ui-actions"><ButtonLink href="/open" variant="secondary">Descargar configuración y crear espacio</ButtonLink><ButtonLink href="/MARKETPLACE_PILOT.md" variant="quiet">Guía de integración y recuperación</ButtonLink></div></>}</Panel></>;
}
