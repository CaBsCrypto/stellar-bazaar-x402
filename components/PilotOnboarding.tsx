'use client';

import { useEffect, useRef, useState } from 'react';
import { createPilotAccess, parsePilotAccess, pilotHash, type PilotAccess } from '@/lib/pilot-access';
import styles from './PilotOnboarding.module.css';

type Receipt = { workspaceId: string; creationId: string; generation: number; revoked: boolean };
function download(name: string, body: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PilotOnboarding() {
  const [access, setAccess] = useState<PilotAccess | null>(null);
  const [admission, setAdmission] = useState('');
  const [saved, setSaved] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { generation.current++; pending.current?.abort(); }, []);

  function lock() {
    generation.current++; pending.current?.abort(); pending.current = null;
    setAccess(null); setAdmission(''); setSaved(false); setReceipt(null); setBusy(false); setStopped(false);
    if (input.current) input.current.value = '';
    setNotice('Acceso retirado de esta página. Tu archivo privado permite retomar el mismo intento.');
  }
  async function install(packet: PilotAccess, restored: boolean) {
    const current = ++generation.current;
    pending.current?.abort(); setReceipt(null); setSaved(restored); setNotice(''); setStopped(false);
    setAccess(packet); setAdmission(''); setBusy(true);
    try {
      const hash = await pilotHash(packet.bootstrap);
      if (current === generation.current) setAdmission(hash);
    } catch { if (current === generation.current) { setAccess(null); setNotice('Este navegador no permite preparar el acceso. Usa la URL HTTPS del piloto.'); } }
    finally { if (current === generation.current) setBusy(false); }
  }
  async function restore(file: File | undefined) {
    if (!file) return;
    const current = generation.current;
    try {
      if (file.size > 2048) throw new Error('INVALID_PACKET');
      const text = await file.text();
      if (current !== generation.current) return;
      await install(parsePilotAccess(text, location.origin), true);
    } catch { if (current === generation.current) setNotice('El archivo no corresponde a este piloto o está incompleto. No se envió ninguna solicitud.'); }
    finally { if (input.current) input.current.value = ''; }
  }
  async function create() {
    if (!access || !saved || busy || receipt || stopped) return;
    const current = ++generation.current;
    const controller = new AbortController(); pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setBusy(true); setNotice('Creando tu espacio…');
    try {
      const [humanAccessHash, agentAccessHash] = await Promise.all([pilotHash(access.human), pilotHash(access.agent)]);
      if (current !== generation.current) return;
      const response = await fetch('/api/workspaces', {
        method: 'POST', headers: { Authorization: `Bearer ${access.bootstrap}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ creationId: access.creationId, humanAccessHash, agentAccessHash }),
        cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
      });
      if (current !== generation.current) return;
      if (!response.ok) {
        if (response.status === 403) setNotice('Tu código todavía no está admitido. Compártelo con el responsable del piloto y conserva este archivo.');
        else if (response.status === 429) setNotice('Se alcanzó la cuota del piloto. Conserva el archivo y espera antes de volver a intentar.');
        else if (response.status === 409) setNotice('El intento tiene un conflicto. Conserva el archivo y consulta al responsable del piloto.');
        else { setStopped(true); setNotice('No se pudo confirmar la creación. Conserva el archivo; consulta al responsable antes de recuperar este mismo intento.'); }
        return;
      }
      const body = await response.json();
      if (current !== generation.current) return;
      const record = body?.record;
      if (body.version !== '1' || !record || record.creationId !== access.creationId ||
          typeof record.workspaceId !== 'string' || !/^[a-f0-9-]{36}$/i.test(record.workspaceId) ||
          !Number.isSafeInteger(record.generation) || record.generation < 1 || record.revoked !== false) throw new Error('INVALID_RECEIPT');
      setReceipt({ workspaceId: record.workspaceId, creationId: record.creationId, generation: record.generation, revoked: false });
      setNotice('Tu espacio está listo. Guarda el acceso del agente y abre tu conversación privada.');
    } catch {
      if (current === generation.current) { setStopped(true); setNotice('La respuesta no pudo confirmarse. No se repetirá automáticamente. Conserva el archivo y consulta al responsable para recuperar este mismo intento.'); }
    } finally {
      clearTimeout(timeout);
      if (current === generation.current) { pending.current = null; setBusy(false); }
    }
  }

  return <main className={styles.page}>
    <nav className={styles.nav}><a href='/'>Bazaar</a><a href='/history'>Recuperar un espacio</a></nav>
    <header><p className={styles.caption}>Piloto por invitación</p><h1>Un espacio para trabajar con tu agente.</h1>
      <p>Conserva tu conversación y las entregas en privado. Conecta el agente que ya utilizas y vuelve con tu enlace de recuperación.</p></header>
    <section className={styles.flow} aria-labelledby='pilot-access-heading'>
      <h2 id='pilot-access-heading'>Prepara tu acceso</h2>
      {!access ? <>
        <p>Comienza si recibiste una invitación. Primero guardarás un archivo privado; después podrás solicitar la admisión de tu espacio.</p>
        <button type='button' onClick={() => { try { void install(createPilotAccess(location.origin), false); } catch { setNotice('Usa un navegador actualizado desde la URL HTTPS del piloto.'); } }}>Preparar un espacio</button>
        <label className={styles.import}>¿Ya guardaste tu acceso? Recupera el mismo intento.
          <input ref={input} type='file' accept='.json,application/json' onChange={event => { void restore(event.target.files?.[0]); }} />
        </label>
      </> : <>
        <h3>1. Guarda tu archivo privado</h3>
        <p>Permite recuperar este intento y administrar el acceso. Guárdalo en un lugar seguro. No lo envíes al agente ni al responsable del piloto.</p>
        <button type='button' disabled={busy} onClick={() => download('bazaar-acceso-privado.json', access)}>Descargar acceso privado</button>
        <label className={styles.check}><input type='checkbox' checked={saved} disabled={busy} onChange={event => setSaved(event.target.checked)} /> Confirmo que tengo una copia segura del archivo.</label>
        <h3>2. Solicita la admisión</h3>
        <p>Comparte únicamente este código con el responsable del piloto, por el canal de tu invitación.</p>
        <label>Código de admisión<textarea readOnly rows={3} value={admission} aria-label='Código de admisión' spellCheck={false} /></label>
        <h3>3. Crea tu espacio</h3>
        <p>Cuando te confirmen la admisión, crea el espacio con este mismo acceso.</p>
        <button type='button' disabled={!saved || busy || !admission || !!receipt || stopped} onClick={() => { void create(); }}>{busy ? 'Preparando…' : 'Crear mi espacio'}</button>
        {receipt && <div className={styles.ready}>
          <h3>Conecta tu agente</h3>
          <p>El archivo del agente contiene sólo su acceso y la dirección MCP. Entrégalo únicamente al agente que controles.</p>
          <button type='button' onClick={() => download('bazaar-acceso-agente.json', { version: 'bazaar-pilot-agent/v1', url: `${access.origin}/api/mcp`, transport: 'streamable-http', authorization: `Bearer ${access.agent}`, workspaceId: receipt.workspaceId })}>Descargar acceso del agente</button>
          <p>Tu enlace privado abre el historial y la conversación. Puedes guardarlo como marcador privado; quien lo tenga podrá leer tu espacio.</p>
          <a className={styles.open} href={`${access.origin}/history#token=${encodeURIComponent(access.human)}`} referrerPolicy='no-referrer'>Abrir mi espacio privado</a>
          <p>Dentro del espacio puedes bloquear la sesión para retirar el contenido del navegador.</p>
        </div>}
        <button type='button' className={styles.lock} onClick={lock}>Bloquear y retirar este acceso</button>
      </>}
      <p role='status' aria-live='polite' className={styles.notice}>{notice}</p>
    </section>
    <footer>El acceso permanece en memoria mientras esta página esté abierta. Tu agente puede tener sus propios costes. Este piloto entrega texto y referencias.</footer>
  </main>;
}
