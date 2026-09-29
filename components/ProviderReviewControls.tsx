"use client";
import {useRef,useState} from "react";
import type {ServiceCard} from "@/lib/types";

type Intent={submissionId:string;submissionToken:string;card:ServiceCard;controlProof:{method:"dns-txt"|"http-well-known";domain:string}};
export function ProviderReviewControls({card,method,domain,disabled}:{card:ServiceCard;method:Intent["controlProof"]["method"];domain:string;disabled:boolean}) {
  const [intent,setIntent]=useState<Intent|null>(null),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false);
  const [notice,setNotice]=useState(""),[receipt,setReceipt]=useState<Record<string,any>|null>(null);
  const [recoveryId,setRecoveryId]=useState(""),[recoveryToken,setRecoveryToken]=useState("");
  const [retained,setRetained]=useState(false);
  const access=useRef<HTMLTextAreaElement>(null);
  function prepare(){
    if(intent)return;
    const bytes=crypto.getRandomValues(new Uint8Array(32));
    const next={submissionId:crypto.randomUUID(),submissionToken:Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join(""),card:structuredClone(card),controlProof:{method,domain}};
    setIntent(next);setNotice("Solicitud preparada, todavía no enviada. Guarda su acceso privado antes de continuar.");
  }
  async function copyAccess(){
    if(!intent)return;
    try{await navigator.clipboard.writeText(JSON.stringify(intent,null,2));setNotice("Acceso copiado. Guárdalo en un archivo privado; no lo compartas en el chat público.");}
    catch{setNotice("No se pudo copiar. Selecciona y conserva el acceso manualmente.");access.current?.focus();access.current?.select();}
  }
  async function request(kind:"submit"|"status",id:string,token:string){
    if(busy)return;setBusy(true);setNotice("");setRetained(false);
    try{
      const response=await fetch(kind==="submit"?"/api/provider-self-listing":`/api/provider-self-listing/${encodeURIComponent(id)}`,{
        method:kind==="submit"?"POST":"GET",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
        ...(kind==="submit"?{body:JSON.stringify({submissionId:id,card:intent?.card,controlProof:intent?.controlProof})}:{}),redirect:"error",cache:"no-store",
      });
      const body=await response.json();
      if(!response.ok){setReceipt(null);setNotice(`${body.error?.code??"ERROR"}: ${body.error?.message??"No se pudo recuperar la solicitud. Conserva el acceso y consulta el mismo identificador."}`);return;}
      setReceipt(body);setNotice("Estado recuperado. Enviar o validar no equivale a aprobación ni publicación.");
    }catch{setReceipt(null);setNotice("Respuesta incierta. Conserva el acceso y consulta esta misma solicitud; no prepares otra para evitar el error.");}
    finally{setBusy(false);}
  }
  return <section aria-label="Solicitud de revisión">
    {!intent?<button type="button" className="submit-button" disabled={disabled} onClick={prepare}>Preparar solicitud de revisión</button>:<>
      <p>La solicitud conserva la ficha y el dominio del momento de preparación. No se envía automáticamente.</p>
      <details><summary>Guardar acceso privado de esta solicitud</summary>
        <p>Este acceso permite consultar la solicitud. No autoriza pagos ni aprobación. No se guarda en el navegador.</p>
        <textarea ref={access} aria-label="Acceso privado de solicitud" readOnly value={JSON.stringify(intent,null,2)} rows={8} style={{width:"100%",boxSizing:"border-box"}} onFocus={e=>e.currentTarget.select()}/>
        <button type="button" onClick={copyAccess}>Copiar acceso privado</button>
      </details>
      <label><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/> He guardado el acceso en un lugar privado</label>
      <button type="button" className="submit-button" disabled={!saved||busy} onClick={()=>request("submit",intent.submissionId,intent.submissionToken)}>Enviar la misma solicitud</button>
      <button type="button" disabled={busy} onClick={()=>request("status",intent.submissionId,intent.submissionToken)}>Consultar esta solicitud</button>
    </>}
    <p role="status" aria-live="polite">{notice}</p>
    {receipt?.submission&&<div className="validation-summary">
      <strong>Estado: {receipt.submission.status}</strong>
      <span>Solicitud: {receipt.submission.submissionId}</span>
      <span>Prueba válida hasta: {receipt.submission.expiresAt}</span>
      <span>Dominio: {receipt.submission.control?.domain}</span>
      <code style={{overflowWrap:"anywhere"}}>{receipt.submission.control?.expectedRecord}</code>
      <span>{receipt.submission.control?.method==="dns-txt"?"Publica el TXT en el dominio indicado y pide la verificación al operador.":`Publica el texto en HTTPS en ${receipt.submission.control?.verificationPath} y pide la verificación al operador.`}</span>
      {receipt.submission.review&&<><strong>Decisión: {receipt.submission.review.decision}</strong><ul>{receipt.submission.review.reasons?.map((reason:string,i:number)=><li key={i}>{reason}</li>)}</ul></>}
      {receipt.submission.status==="rejected"&&<p>Conserva esta decisión. Corrige tu ficha y prepara expresamente una nueva solicitud; la anterior no se sobrescribe.</p>}
      {intent&&receipt.submission.submissionId===intent.submissionId&&["rejected","expired"].includes(receipt.submission.status)&&<>
        <label><input type="checkbox" checked={retained} onChange={e=>setRetained(e.target.checked)}/> He conservado el acceso y el comprobante de la solicitud anterior</label>
        <button type="button" disabled={busy||!retained} onClick={()=>{if(busy||!retained)return;setIntent(null);setSaved(false);setReceipt(null);setRetained(false);setNotice("La solicitud anterior se conserva. Revisa tu ficha editada y prepara una nueva solicitud explícitamente.");}}>Preparar una corrección nueva</button>
      </>}
      <details><summary>Conservar comprobante sin credencial</summary><textarea aria-label="Comprobante de solicitud" readOnly value={JSON.stringify(receipt,null,2)} rows={8} style={{width:"100%",boxSizing:"border-box"}}/></details>
    </div>}
    <details><summary>Recuperar una solicitud guardada</summary>
      <label>Identificador de solicitud<input value={recoveryId} onChange={e=>setRecoveryId(e.target.value)} autoComplete="off"/></label>
      <label>Acceso privado<input type="password" value={recoveryToken} onChange={e=>setRecoveryToken(e.target.value)} autoComplete="off"/></label>
      <button type="button" disabled={busy||!recoveryId||!recoveryToken} onClick={()=>request("status",recoveryId,recoveryToken)}>Recuperar estado</button>
    </details>
    <a href="/PROVIDER_ONBOARDING.md">Guía de revisión del servicio</a>
  </section>;
}
