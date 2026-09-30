"use client";
import { useEffect, useRef, useState } from 'react';

type Message = { messageId:string; actor:'human'|'agent'; text:string; taskId:string; operationId?:string };
type Task = { taskId:string; status:'pending'|'claimed'|'responded'|'uncertain' };
type Conversation = { conversationId:string; title:string; messages:Message[]; tasks?:Task[] };
const statusLabel={pending:'En cola para tu agente',claimed:'Tu agente tomó esta tarea',responded:'Respuesta registrada',uncertain:'Resultado incierto; tu agente debe recuperar el mismo intento'};
type Pending = { path:string; body:Record<string,string>; kind:'create'|'send' };
function taskLabel(conversation:Conversation, taskId:string){const task=conversation.tasks?.find(item=>item.taskId===taskId);return task?statusLabel[task.status]:'Sin respuesta registrada';}
export function PrivateAgentChat() {
 const [token,setToken]=useState(''), [conversations,setConversations]=useState<Conversation[]>([]), [selected,setSelected]=useState('');
 const [draft,setDraft]=useState(''), [notice,setNotice]=useState(''), [busy,setBusy]=useState(false), [locked,setLocked]=useState(false);
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{if(locked)heading.current?.focus();},[locked]);
 const generation=useRef(0), requests=useRef(new Set<AbortController>()), pending=useRef<Pending|null>(null), capturedAccess=useRef<string|null>(null);
 function lock() { generation.current++; requests.current.forEach(c=>c.abort()); requests.current.clear(); pending.current=null; capturedAccess.current=null; setToken('');setConversations([]);setSelected('');setDraft('');setBusy(false);setNotice('Biblioteca y conversación bloqueadas en este navegador.');setLocked(true); }
 async function api(path:string, access:string, body?:Record<string,string>) {
  const controller=new AbortController(); requests.current.add(controller);
  try {
   const res=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${access}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});
   if(res.status===401 || res.status===403) throw new Error('ACCESS_REJECTED');
   if(!res.ok) throw new Error('REQUEST_UNCONFIRMED');
   return await res.json();
  } finally { requests.current.delete(controller); }
 }
 async function refresh(access=token) {
  if(!access) return;
  const current=generation.current;setBusy(true);setNotice('');
  try { const data=await api('/api/conversations',access); if(current!==generation.current)return; if(!Array.isArray(data.conversations))throw Error();setConversations(data.conversations);setSelected(value=>value||data.conversations[0]?.conversationId||''); }
  catch(error) {if(current!==generation.current)return;if(error instanceof Error && error.message==='ACCESS_REJECTED'){lock();setNotice('Acceso rechazado. Abre un enlace autorizado.');}else setNotice('No se pudo actualizar. Los mensajes no se han reenviado.');}
  finally {if(current===generation.current)setBusy(false);}
 }
 useEffect(()=>{
  function capture(initial=false) {
   const url=new URL(window.location.href), fragment=new URLSearchParams(url.hash.slice(1));
   const supplied=fragment.has('token');
   const access=supplied?fragment.get('token'):(initial?capturedAccess.current:null);
   // Remove credentials before any request, including malformed and replacement links.
   url.hash='';url.searchParams.delete('token');window.history.replaceState(null,'',url.pathname+url.search);
   if(!supplied&&!initial)return;
   generation.current++;requests.current.forEach(c=>c.abort());requests.current.clear();
   pending.current=null;capturedAccess.current=null;setToken('');setConversations([]);setSelected('');setDraft('');setBusy(false);setNotice('');setLocked(false);
   if(access && /^[A-Za-z0-9_-]{32,256}$/.test(access)){capturedAccess.current=access;setToken(access);void refresh(access);}
   else if(supplied)setNotice('El enlace de acceso no es válido.');
  }
  const changed=()=>capture();
  window.addEventListener('hashchange',changed);
  capture(true);
  return ()=>{window.removeEventListener('hashchange',changed);generation.current++;requests.current.forEach(c=>c.abort());requests.current.clear();};
 // Access exists only in memory; replacement fragments reset the whole private session.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 async function submit(recover=false) {
  if(busy||!token)return;
  if(!recover && pending.current){setNotice('Confirma el intento pendiente antes de enviar otro mensaje.');return;}
  if(!recover) pending.current=selected?{path:`/api/conversations/${selected}/messages`,body:{messageId:crypto.randomUUID(),taskId:crypto.randomUUID(),text:draft},kind:'send'}:{path:'/api/conversations',body:{conversationId:crypto.randomUUID(),title:'Mi conversación'},kind:'create'};
  const attempt=pending.current;if(!attempt)return;
  const current=generation.current;setBusy(true);setNotice('');
  try {
   const data=await api(attempt.path,token,attempt.body);if(current!==generation.current)return;
   pending.current=null;if(attempt.kind==='create')setSelected(data.record.conversationId);else setDraft('');
   setNotice(attempt.kind==='send'?'Mensaje registrado. Tu agente debe consultar y responder la tarea.':'Conversación creada.');
   const snapshot=await api('/api/conversations',token);if(current===generation.current)setConversations(snapshot.conversations);
  }catch(error){if(current!==generation.current)return;if(error instanceof Error&&error.message==='ACCESS_REJECTED'){lock();setNotice('Acceso rechazado.');}else setNotice(pending.current?'Resultado sin confirmar. Recupera el mismo intento; no se creará otra tarea.':'Mensaje confirmado; no se pudo actualizar la vista. Usa Actualizar mensajes.');}
  finally{if(current===generation.current)setBusy(false);}
 }
 const conversation=conversations.find(c=>c.conversationId===selected);
 return <section aria-labelledby="private-chat-title" style={{maxWidth:760,margin:'0 auto',padding:'16px',overflowWrap:'anywhere'}}>
  <h1 id="private-chat-title" ref={heading} tabIndex={-1}>Conversa con tu agente</h1><p>Mensajes privados y tareas para tu agente. Este chat no genera respuestas ni ejecuta compras.</p>
  <p role="status" aria-live="polite">{notice}</p>
  {!token?<div><h2>{locked?'Conversación bloqueada':'Abre tu enlace privado'}</h2><p>Tu agente crea el espacio con el helper privado de terminal y te entrega el enlace. Conserva ese enlace para volver a entrar.</p><p>El acceso no se guarda en este navegador. Bloquear no revoca el enlace.</p></div>:<>
   <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:16}}><button type="button" onClick={lock} style={{minHeight:44}}>Bloquear</button><button type="button" disabled={busy} onClick={()=>void refresh()} style={{minHeight:44}}>Actualizar mensajes</button><button type="button" style={{minHeight:44}} onClick={()=>{window.location.assign('/history#token='+encodeURIComponent(token));}}>Abrir mi biblioteca</button></div>
   <label htmlFor="private-conversation">Conversación</label><select id="private-conversation" value={selected} disabled={busy||!!pending.current} onChange={e=>{setSelected(e.target.value);setDraft('');}} style={{width:'100%',minHeight:44}}><option value="">Crear una conversación</option>{conversations.map(c=><option key={c.conversationId} value={c.conversationId}>{c.title}</option>)}</select>
   <ol aria-label="Mensajes" style={{listStyle:'none',padding:0}}>{conversation?.messages.map(m=><li key={m.messageId} style={{padding:'12px 0',borderBottom:'1px solid #ddd'}}><strong>{m.actor==='human'?'Tú':'Tu agente'}</strong><p style={{whiteSpace:'pre-wrap'}}>{m.text}</p>{m.actor==='human'&&!conversation.messages.some(answer=>answer.actor==='agent'&&answer.taskId===m.taskId)&&<small>{taskLabel(conversation,m.taskId)} · actualiza para consultar</small>}{m.operationId&&<small>Entrega registrada: {m.operationId}</small>}</li>)}</ol>
   {selected&&<><label htmlFor="private-chat-draft">Mensaje para tu agente</label><textarea id="private-chat-draft" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={2000} disabled={busy||!!pending.current} rows={4} style={{display:'block',width:'100%',boxSizing:'border-box',fontSize:16}}/></>}
   <button type="button" disabled={busy||!!pending.current||(!!selected&&!draft.trim())} onClick={()=>void submit()} style={{minHeight:44,marginTop:12}}>{selected?'Enviar mensaje':'Crear conversación'}</button>
   {pending.current&&<button type="button" disabled={busy} onClick={()=>void submit(true)} style={{minHeight:44,margin:12}}>Recuperar el mismo intento</button>}
  </>}
 </section>;
}








