"use client";
import {useId,useRef,useState} from "react";
import {Button} from "./index";
export function CopyText({text,label}: {text:string;label:string}) {
 const id=useId(); const area=useRef<HTMLTextAreaElement>(null); const [status,setStatus]=useState("");
 async function copy(){try {await navigator.clipboard.writeText(text);setStatus("Copiado. Pégalo en el chat o en la configuración de tu agente.");}catch{setStatus("No se pudo copiar. Selecciona el texto y cópialo manualmente.");area.current?.focus();area.current?.select();}}
 return <div className="ui-copy"><label className="ui-copy-label" htmlFor={id}>{label}</label><textarea id={id} ref={area} readOnly value={text} rows={12} spellCheck={false}/><div className="ui-actions"><Button onClick={copy}>Copiar {label.toLowerCase()}</Button><Button variant="secondary" onClick={()=>{area.current?.focus();area.current?.select();}}>Seleccionar texto</Button></div><p role="status" className="ui-muted">{status}</p></div>;
}
