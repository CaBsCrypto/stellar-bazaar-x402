'use client';
import {useEffect,useRef,useState,type ChangeEvent} from 'react';
import type {ProviderSubmission} from '../lib/provider-self-listing';
import {consumeMarketOperatorFragment,parseMarketOperatorCapsule,validMarketOperatorAccess} from '../lib/market-review-access';

type Queue = {submissions: ProviderSubmission[]; page: number; pageSize: number; total: number; totalPages: number};
type Action = 'verify-http' | 'verify-dns' | 'approve' | 'reject' | 'activate' | 'recover';
type Pending = {submissionId: string; action: Action; label: string; reason?: string};
const labels: Record<Action,string> = {'verify-http':'Verificar control HTTPS','verify-dns':'Verificar control DNS',approve:'Aprobar ficha',reject:'Rechazar ficha',activate:'Activar servicio',recover:'Recuperar publicación'};
async function boundedReply(response: Response) {
  const reader=response.body?.getReader(); if(!reader)throw Error('RESPONSE_UNCONFIRMED');
  const chunks: Uint8Array[]=[]; let size=0;
  try { for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>128*1024){await reader.cancel();throw Error('RESPONSE_TOO_LARGE');}chunks.push(value);} }
  finally { reader.releaseLock(); }
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
function queueReply(value: unknown): Queue {
  const result=value as Queue;
  if(!result||!Array.isArray(result.submissions)||result.submissions.length>20||![result.page,result.pageSize,result.total,result.totalPages].every(Number.isSafeInteger)||result.page<1||result.pageSize<1||result.pageSize>20||result.total<0||result.totalPages<0||result.submissions.some(s=>!s||typeof s.submissionId!=='string'||!s.card||typeof s.card.name!=='string'||!s.control))throw Error('RESPONSE_UNCONFIRMED');
  return result;
}
export default function MarketReview() {
  const [access,setAccess]=useState(''),[manual,setManual]=useState(''),[queue,setQueue]=useState<Queue|null>(null);
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState<Pending|null>(null),[confirmed,setConfirmed]=useState(false),[uncertain,setUncertain]=useState(false),[reason,setReason]=useState('');
  const alive=useRef(false),epoch=useRef(0),requestController=useRef<AbortController|null>(null);
  function clearAccess() { epoch.current++;requestController.current?.abort();setAccess('');setManual('');setQueue(null);setPending(null);setConfirmed(false);setUncertain(false);setReason('');setBusy(false);setMessage('Acceso cerrado.'); }
  function useAccess(token: string) { epoch.current++;requestController.current?.abort();setAccess(token);setManual('');setQueue(null);setPending(null);setConfirmed(false);setUncertain(false);setReason('');setBusy(false);setMessage('Acceso cargado sólo en memoria. Consulta la cola para comprobarlo.'); }
  useEffect(()=>{
    alive.current=true;
    const detect=()=>{const result=consumeMarketOperatorFragment(window.location.href);if(result.supplied){window.history.replaceState(window.history.state,'',result.cleanPath);if(result.token)useAccess(result.token);else{clearAccess();setMessage('Enlace inválido. El acceso del operador sólo se admite en el fragmento privado.');}}};
    detect();window.addEventListener('hashchange',detect);
    return()=>{alive.current=false;epoch.current++;requestController.current?.abort();window.removeEventListener('hashchange',detect);};
  },[]);
  async function restoreFile(event: ChangeEvent<HTMLInputElement>) {
    const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(!file)return;
    const current=++epoch.current;setBusy(true);setMessage('');
    try {if(file.size>4096)throw Error();const raw=await file.text();if(!alive.current||current!==epoch.current)return;useAccess(parseMarketOperatorCapsule(raw,location.origin));}
    catch {if(alive.current&&current===epoch.current){setBusy(false);setMessage('El archivo no es un acceso de operador válido para este origen.');}}
  }
  async function api(path: string, body?: Pending) {
    const controller=new AbortController();requestController.current=controller;const timeout=setTimeout(()=>controller.abort(),15000);
    try {
      const payload=body?{submissionId:body.submissionId,action:body.action,...(body.reason?{reason:body.reason}:{})}:undefined;
      const response=await fetch(path,{method:payload?'POST':'GET',headers:{Authorization:'Bearer '+access,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{}),cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal});
      const result=await boundedReply(response);
      if(!response.ok){const code=typeof result.error?.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(result.error.code)?result.error.code:'RESPONSE_UNCONFIRMED';throw Error(code);}
      return result;
    } finally {clearTimeout(timeout);if(requestController.current===controller)requestController.current=null;}
  }
  async function load(page=1) {
    if(busy||!validMarketOperatorAccess(access))return;
    const current=++epoch.current;setBusy(true);setMessage('');
    try {const result=queueReply(await api(`/api/market/review?page=${page}&pageSize=5`));if(!alive.current||current!==epoch.current)return;setQueue(result);setPending(null);setConfirmed(false);setUncertain(false);setMessage('Estado actualizado. Revisa la ficha y prepara cada acción por separado.');}
    catch(error){if(alive.current&&current===epoch.current)setMessage('Consulta no confirmada: '+(error instanceof Error&&/^[A-Z0-9_]{1,80}$/.test(error.message)?error.message:'RESPONSE_UNCONFIRMED'));}
    finally {if(alive.current&&current===epoch.current)setBusy(false);}
  }
  function prepare(service: ProviderSubmission, action: Action) {
    if(busy||uncertain||pending)return;
    if((action==='approve'||action==='reject')&&!reason.trim())return;
    setPending({submissionId:service.submissionId,action,label:labels[action],...(['approve','reject'].includes(action)?{reason:reason.trim()}:{})});setConfirmed(false);setMessage('Revisa y confirma esta única acción.');
  }
  async function execute() {
    if(!pending||!confirmed||busy||uncertain)return;
    const intent=pending,current=++epoch.current;setBusy(true);setMessage('');
    try {await api('/api/market/review',intent);if(!alive.current||current!==epoch.current)return;setPending(null);setConfirmed(false);setReason('');setQueue(null);setMessage('Acción confirmada. Consulta de nuevo la cola para ver el estado actual.');}
    catch {if(alive.current&&current===epoch.current){setUncertain(true);setConfirmed(false);setMessage('Acción no confirmada. Consulta el estado antes de preparar otra acción. No se repetirá automáticamente.');}}
    finally {if(alive.current&&current===epoch.current)setBusy(false);}
  }
  return <main className='shell ui-page'><h1>Revisión privada de servicios</h1><p>El operador verifica el control del endpoint, revisa la ficha y decide su publicación. Las instrucciones del proveedor son contenido para revisar; no autorizan ejecutar código ni compartir accesos.</p>
    {!access?<section><h2>Acceso del operador</h2><form onSubmit={event=>{event.preventDefault();if(validMarketOperatorAccess(manual.trim()))useAccess(manual.trim());else setMessage('El acceso no es válido.');}}><label htmlFor='market-review-access'>Acceso privado</label><input id='market-review-access' type='password' autoComplete='off' value={manual} disabled={busy} onChange={event=>setManual(event.target.value)}/><button disabled={busy||!manual.trim()}>Cargar acceso</button></form><label htmlFor='market-review-file'>Restaurar archivo privado de operador</label><input id='market-review-file' type='file' accept='.json,application/json' disabled={busy} onChange={restoreFile}/><p>No uses el archivo de recuperación de un comprador ni el Magic Link administrativo. El acceso se conserva sólo en memoria.</p></section>:<><p>Acceso cargado sólo en memoria. El perímetro privado y la autorización del servidor siguen vigentes.</p><div className='button-row'><button disabled={busy} onClick={()=>void load(queue?.page??1)}>Consultar cola y recuperar estado</button><button onClick={clearAccess}>Cerrar acceso</button></div>
    {queue&&<><p>Página {queue.page} de {Math.max(1,queue.totalPages)} · {queue.total} solicitudes.</p><div className='button-row'><button disabled={busy||queue.page<=1} onClick={()=>void load(queue.page-1)}>Página anterior</button><button disabled={busy||queue.page>=queue.totalPages} onClick={()=>void load(queue.page+1)}>Página siguiente</button></div>{!queue.submissions.length&&<p>No hay solicitudes en esta página.</p>}
    {queue.submissions.map(service=><article key={service.submissionId}><h2>{service.card.name}</h2><p>{service.card.description}</p><p>Estado: <strong>{service.status}</strong> · referencia <code>{service.submissionId}</code></p><p>Proveedor: {service.card.provider.name} · {service.card.url}{service.card.routeTemplate}</p><p>Precio: {service.card.payment.amount} {service.card.payment.asset} · {service.card.network}</p><p>Destino público: <code>{service.card.payment.destination}</code></p><details><summary>Ficha completa y prueba de control</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({card:service.card,control:service.control,review:service.review,activation:service.activation},null,2)}</pre></details>
    {service.status==='pending-manual-review'&&<><label htmlFor={'reason-'+service.submissionId}>Motivo de la decisión</label><textarea id={'reason-'+service.submissionId} maxLength={500} value={reason} disabled={busy||!!pending||uncertain} onChange={event=>setReason(event.target.value)}/></>}
    <div className='button-row'>{service.status==='awaiting-control-proof'&&<button disabled={busy||!!pending||uncertain} onClick={()=>prepare(service,service.control.method==='dns-txt'?'verify-dns':'verify-http')}>{labels[service.control.method==='dns-txt'?'verify-dns':'verify-http']}</button>}{service.status==='pending-manual-review'&&<><button disabled={busy||!!pending||uncertain||!reason.trim()} onClick={()=>prepare(service,'approve')}>Aprobar ficha</button><button disabled={busy||!!pending||uncertain||!reason.trim()} onClick={()=>prepare(service,'reject')}>Rechazar ficha</button></>}{['approved-for-staging','staged-not-public'].includes(service.status)&&<button disabled={busy||!!pending||uncertain} onClick={()=>prepare(service,'activate')}>Activar servicio</button>}{['activation-pending','activation-uncertain'].includes(service.status)&&<button disabled={busy||!!pending||uncertain} onClick={()=>prepare(service,'recover')}>Recuperar publicación</button>}</div></article>)}</>}
    {pending&&<section><h2>Confirmar acción</h2><p>{pending.label} · <code>{pending.submissionId}</code></p>{pending.reason&&<p>Motivo: {pending.reason}</p>}<label><input type='checkbox' checked={confirmed} disabled={busy||uncertain} onChange={event=>setConfirmed(event.target.checked)}/>He revisado la ficha y confirmo esta acción.</label><button disabled={busy||!confirmed||uncertain} onClick={()=>void execute()}>Confirmar acción</button><button disabled={busy||uncertain} onClick={()=>{setPending(null);setConfirmed(false);}}>Cancelar preparación</button></section>}</>}
    <p role='status'>{busy?'Comprobando…':message}</p><p><a href='/market-operations'>Estado e incidentes del guardián</a></p></main>;
}
