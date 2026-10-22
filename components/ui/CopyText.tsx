"use client";
import {UiText, useUiLanguage} from "@/components/UiLanguage";

import {useId,useRef,useState, type ReactNode} from "react";
import {Button} from "./index";
export function CopyText({text,label,compact=false,extraActions,rows=12}: {text:string;label:string;compact?:boolean;extraActions?:ReactNode;rows?:number}) {
 const {t} = useUiLanguage();
 const alternatives=useRef<HTMLDetailsElement>(null);
 const id=useId(); const area=useRef<HTMLTextAreaElement>(null); const [status,setStatus]=useState("");
 async function copy(){setStatus("");try {await navigator.clipboard.writeText(text);setStatus("Copiado. Pégalo en el chat o en la configuración de tu agente.");}catch{if(alternatives.current) alternatives.current.open=true;setStatus("No se pudo copiar. Selecciona el texto y cópialo manualmente.");area.current?.focus();area.current?.select();}}
 const manual=<Button variant="secondary" onClick={()=>{area.current?.focus();area.current?.select();}}><UiText text="Seleccionar texto"/></Button>;
 return <div className="ui-copy"><label className="ui-copy-label" htmlFor={id}>{t(label)}</label><textarea id={id} ref={area} readOnly value={text} rows={rows} style={rows<4?{minHeight:'5rem',height:'5rem'}:undefined} spellCheck={false}/><div className="ui-actions"><Button onClick={copy}><UiText text="Copiar"/>{" "}{t(label).toLowerCase()}</Button>{!compact && manual}</div>{compact && <details ref={alternatives} className="connect-help"><summary><UiText text="Más opciones"/></summary><div className="ui-actions">{manual}{extraActions}</div></details>}<p role="status" className="ui-muted">{t(status)}</p></div>;
}
