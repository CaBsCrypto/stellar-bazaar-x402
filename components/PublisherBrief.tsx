"use client";
import {useRef,useState} from "react";
import {Button} from "./ui";
export function PublisherBrief(){
 const [draft,setDraft]=useState({name:"",description:"",audience:"",result:"",price:""});
 const [attempted,setAttempted]=useState(false),[notice,setNotice]=useState("");
 const details=useRef<HTMLDetailsElement>(null),area=useRef<HTMLTextAreaElement>(null);
 const fields=[{key:"name",label:"Nombre del servicio",help:"Ejemplo: Guiones para videos cortos",required:true},{key:"description",label:"¿Qué hace?",help:"Describe el problema que resuelve.",required:true},{key:"audience",label:"¿Para quién sirve?",help:"Ejemplo: creadores de contenido o pequeños negocios.",required:false},{key:"result",label:"¿Qué recibe el cliente?",help:"Ejemplo: un guion por escenas con narración e indicaciones visuales.",required:true},{key:"price",label:"Precio previsto · USDC de Testnet",help:"Déjalo vacío si está por definir.",required:false}] as const;
 const priceValid=!draft.price.trim() || (/^\d+(?:[.,]\d+)?$/.test(draft.price.trim()) && Number(draft.price.replace(",","."))>0 && Number.isFinite(Number(draft.price.replace(",","."))));
 const errors:Record<string,string>={};for(const field of fields)if(field.required&&!draft[field.key].trim())errors[field.key]="Completa este campo para preparar las instrucciones.";
 if(!priceValid)errors.price="Introduce un importe mayor que cero o déjalo por definir.";
 const text=`Ayúdame a preparar este servicio para Stellar Bazaar. Este es un borrador editorial, no una integración validada ni una publicación aprobada.

Nombre: ${draft.name || "Pendiente de definir"}
Qué hace: ${draft.description || "Pendiente de definir"}
Para quién sirve: ${draft.audience || "Pendiente de definir"}
Qué recibe el cliente: ${draft.result || "Pendiente de definir"}
Precio previsto: ${!draft.price.trim()?"Por definir":priceValid?draft.price+" USDC de Testnet":"Pendiente de corregir"}

Revisa conmigo los datos pendientes. Prepara la integración y la ficha técnica del servicio siguiendo estas referencias:
https://bazaar.browns.studio/docs
https://bazaar.browns.studio/llms.txt
MCP: https://bazaar.browns.studio/api/mcp (permite validar fichas; no completa por sí solo todo el alta).

Determina las entradas, salidas y la conexión necesaria. Confirma disponibilidad, condiciones, precio y destino público de cobro antes de solicitar revisión. No inventes datos faltantes ni solicites claves privadas. Prepara la prueba de control requerida y explica los pasos para solicitar revisión manual. Validar la ficha no implica aprobación ni publicación. No ejecutes pagos ni publiques automáticamente.`;
 function select(){if(details.current)details.current.open=true;requestAnimationFrame(()=>{area.current?.focus();area.current?.select();});}
 async function copy(){setAttempted(true);setNotice("");if(Object.keys(errors).length){document.getElementById("brief-"+Object.keys(errors)[0])?.focus();return;}try{await navigator.clipboard.writeText(text);setNotice("Copiado. Pégalo en el chat de tu agente");}catch{setNotice("No se pudo copiar. Selecciona el texto y cópialo manualmente.");select();}}
 return <><div className="brief-grid"><section className="ui-card"><h2>Describe tu servicio</h2><p className="ui-muted">Nombre, descripción y resultado son obligatorios.</p><form onSubmit={e=>{e.preventDefault();void copy();}} noValidate>{fields.map(field=><div className="brief-field" key={field.key}><label htmlFor={"brief-"+field.key}>{field.label}</label>{field.key==="description"||field.key==="result"?<textarea id={"brief-"+field.key} value={draft[field.key]} aria-required={field.required} aria-invalid={attempted&&!!errors[field.key]} aria-describedby={"help-"+field.key} onChange={e=>{setDraft({...draft,[field.key]:e.target.value});setNotice("");}} rows={3}/>:<input id={"brief-"+field.key} value={draft[field.key]} inputMode={field.key==="price"?"decimal":undefined} aria-required={field.required} aria-invalid={attempted&&!!errors[field.key]} aria-describedby={"help-"+field.key} onChange={e=>{setDraft({...draft,[field.key]:e.target.value});setNotice("");}}/>}<small id={"help-"+field.key}>{attempted&&errors[field.key]?errors[field.key]:field.help}</small></div>)}<Button type="submit">Copiar instrucciones para mi agente</Button><p role="status" className="brief-notice">{notice}</p></form><p className="brief-memory">El borrador vive solo en esta página y se pierde al recargar. Copiar no envía mensajes ni solicita una revisión.</p></section><aside className="ui-card brief-preview" aria-label="Vista previa del servicio"><span className="ui-pill ui-pill--warning">Borrador · no publicado</span><p className="kicker">VISTA PREVIA</p><h2>{draft.name || "Añade el nombre de tu servicio"}</h2><p>{draft.description || "Explica qué hace tu servicio para mostrarlo aquí."}</p><h3>Para quién</h3><p>{draft.audience || "Público por definir"}</p><h3>Qué recibirá el cliente</h3><p>{draft.result || "Describe el resultado que entregarás."}</p><div className="brief-price"><strong>{!draft.price.trim()?"Precio por definir":priceValid?draft.price+" USDC":"Precio pendiente de corregir"}</strong><span>Stellar Testnet</span></div><small>Presentación preliminar. No es una ficha técnica validada.</small></aside></div><details className="brief-instructions" ref={details}><summary>Ver instrucciones para mi agente</summary><label htmlFor="brief-instructions-text">Instrucciones preparadas</label><textarea ref={area} id="brief-instructions-text" readOnly value={text} rows={14}/><Button variant="secondary" onClick={select}>Seleccionar texto</Button></details></>;
}
