"use client";
import {useRef,useState} from "react";
import {AgentDirectConnectCard} from "./AgentDirectConnectCard";
import {ButtonLink,Card} from "./ui";
import {CopyText} from "./ui/CopyText";
const tabs=["Comprar","Publicar","MCP"];
const config=JSON.stringify({mcpServers:{"stellar-bazaar":{url:"https://bazaar.browns.studio/api/mcp"}}},null,2);
export function AgentHub(){const [selected,setSelected]=useState(0);const refs=useRef<Array<HTMLButtonElement|null>>([]);
 return <><div role="tablist" aria-label="Cómo conectar tu agente" className="ui-tabs">{tabs.map((label,index)=><button key={label} ref={el=>{refs.current[index]=el;}} type="button" role="tab" id={`hub-tab-${index}`} aria-controls={`hub-panel-${index}`} aria-selected={selected===index} tabIndex={selected===index?0:-1} onClick={()=>setSelected(index)} onKeyDown={event=>{let next=index;if(event.key==="ArrowRight")next=(index+1)%3;else if(event.key==="ArrowLeft")next=(index+2)%3;else if(event.key==="Home")next=0;else if(event.key==="End")next=2;else return;event.preventDefault();setSelected(next);refs.current[next]?.focus();}}>{label}</button>)}</div>
 <Card role="tabpanel" id={`hub-panel-${selected}`} aria-labelledby={`hub-tab-${selected}`} tabIndex={0}>{selected<2?<AgentDirectConnectCard key={selected} role={selected===0?"buyer":"seller"}/>:<><h2>Conecta tu cliente MCP</h2><p className="ui-muted">Usa esta configuración en un cliente compatible. No requiere pegar credenciales de la biblioteca. Revisa las herramientas disponibles en el playground.</p><CopyText text={config} label="Configuración MCP"/><div className="ui-actions"><ButtonLink href="/webmcp-playground" variant="secondary">Explorar herramientas WebMCP</ButtonLink><ButtonLink href="/docs" variant="quiet">Documentación de integración</ButtonLink></div></>}</Card></>;
}
