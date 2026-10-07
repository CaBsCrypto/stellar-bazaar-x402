'use client';

import { useEffect, useRef, useState } from 'react';
import { createPilotAccess, parsePilotAccess, pilotHash, type PilotAccess } from '@/lib/pilot-access';
import { CopyText } from './ui/CopyText';
import { useBazaarOrigin } from './useBazaarOrigin';
import styles from './PilotOnboarding.module.css';

type Receipt = { workspaceId: string; creationId: string; generation: number; revoked: boolean };
function download(name: string, body: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function PilotOnboarding({ enabled = true, paused = false }: { enabled?: boolean; paused?: boolean }) {
  const origin = useBazaarOrigin(), publicConfig = { mcpServers: { bazaar: { type: 'http', url: `${origin}/api/mcp` } } };
  const [access, setAccess] = useState<PilotAccess | null>(null), [downloaded, setDownloaded] = useState(false), [saved, setSaved] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [restored, setRestored] = useState(false);
  const [notice, setNotice] = useState(''), [serverPaused, setServerPaused] = useState(paused);
  const generation = useRef(0), pending = useRef<AbortController | null>(null), input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { generation.current++; pending.current?.abort(); }, []);
  function lock() {
    generation.current++; pending.current?.abort(); pending.current = null;
    setAccess(null); setDownloaded(false); setSaved(false); setReceipt(null); setBusy(false); setUncertain(false); setRestored(false);
    if (input.current) input.current.value = '';
    setNotice('Acceso retirado de esta página. Tu archivo privado permite recuperar el mismo espacio.');
  }
  function install(packet: PilotAccess, recovered: boolean) {
    generation.current++; pending.current?.abort(); setBusy(false); setReceipt(null); setDownloaded(recovered); setSaved(recovered); setNotice(''); setUncertain(false); setRestored(recovered); setAccess(packet);
  }
  async function restore(file: File | undefined) {
    if (!file) return;
    const current = ++generation.current; pending.current?.abort();
    try {
      if (file.size > 2048) throw Error('INVALID_PACKET');
      const text = await file.text(); if (current !== generation.current) return;
      install(parsePilotAccess(text, location.origin), true);
    } catch { if (current === generation.current) setNotice('Elige el archivo raíz de este Bazaar. No se envió ninguna solicitud.'); }
    finally { if (input.current) input.current.value = ''; }
  }
  async function create(recover = false) {
    if (!access || !saved || !downloaded || busy || receipt || (!recover && (uncertain || serverPaused || !enabled))) return;
    const current = ++generation.current, controller = new AbortController(); pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setBusy(true); setNotice(recover ? 'Recuperando el mismo identificador…' : 'Creando tu espacio…');
    try {
      const [humanAccessHash, agentAccessHash] = await Promise.all([pilotHash(access.human), pilotHash(access.agent)]);
      if (current !== generation.current) return;
      const response = await fetch('/api/workspaces', { method: 'POST', headers: { Authorization: `Bearer ${access.bootstrap}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ creationId: access.creationId, humanAccessHash, agentAccessHash }), cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal });
      const body = await response.json(); if (current !== generation.current) return;
      if (!response.ok) {
        const code = body?.error?.code;
        if (/PAUSED|BUDGET|ADMISSION|INVITE|DISABLED/.test(code ?? '')) { setServerPaused(true); setNotice('Las nuevas altas están pausadas. Conserva tu archivo; puedes recuperar un espacio ya creado con el mismo identificador.'); }
        else if (response.status === 429) setNotice(`Hay demasiadas solicitudes. Espera ${response.headers.get('retry-after') ?? '60'} segundos y recupera este mismo intento.`);
        else if (response.status === 409) { setUncertain(true); setNotice('El acceso tiene un conflicto. Conserva este archivo y comprueba el mismo intento; no prepares otro espacio para resolverlo.'); }
        else { setUncertain(true); setNotice('La creación no está confirmada. Conserva el archivo y recupera este mismo intento.'); }
        return;
      }
      const record = body?.record;
      if (body.version !== '1' || !record || record.creationId !== access.creationId || typeof record.workspaceId !== 'string' || !/^[a-f0-9-]{36}$/i.test(record.workspaceId) || !Number.isSafeInteger(record.generation) || record.generation < 1 || record.revoked !== false) throw Error('INVALID_RECEIPT');
      setReceipt({ workspaceId: record.workspaceId, creationId: record.creationId, generation: record.generation, revoked: false }); setUncertain(false);
      setNotice('Tu espacio está listo. Importa la conexión de tu agente y abre tu acceso humano.');
    } catch { if (current === generation.current) { setUncertain(true); setNotice('La respuesta no está confirmada. No se repetirá automáticamente. Recupera el mismo intento con el archivo que ya guardaste.'); } }
    finally { clearTimeout(timeout); if (current === generation.current) { pending.current = null; setBusy(false); } }
  }
  return <main className={styles.page}>
    <nav className={styles.nav} aria-label='Navegación de alta'><a href='/'>Bazaar</a><a href='/history'>Recuperar mi espacio</a></nav>
    <header><h1>Un espacio para tu agente.</h1><p>Conecta el agente que utilizas, ofrece servicios y conserva tus compras y ventas. Alta abierta, sin correo. Tu agente corre en tu infraestructura.</p></header>
    <section aria-labelledby='open-mcp-heading'><h2 id='open-mcp-heading'>Conecta por MCP</h2><p>El catálogo es público. Copia esta URL en cualquier cliente compatible con MCP por HTTP.</p><CopyText text={`${origin}/api/mcp`} label='URL MCP' rows={2} compact/><button type='button' onClick={() => download('bazaar-mcp-publico.json', publicConfig)}>Descargar configuración MCP pública</button><p><a href='/hub'>Instrucciones para comprar o publicar con tu agente</a></p></section>
    <section className={styles.flow} aria-labelledby='open-access-heading'>
      <h2 id='open-access-heading'>Tu acceso privado</h2>
      {(!enabled || serverPaused) && <p role='status'>Nuevas altas pausadas. El catálogo y la recuperación de espacios existentes siguen disponibles.</p>}
      {!access ? <><p>Guarda primero tu archivo de recuperación. Contiene tu acceso humano, el del agente y el acceso raíz para renovar o revocar.</p><button type='button' onClick={() => { try { install(createPilotAccess(location.origin), false); } catch { setNotice('Usa un navegador actualizado desde HTTPS o localhost.'); } }}>Preparar mi acceso privado</button><label className={styles.import}>Ya tengo mi archivo de recuperación<input ref={input} type='file' accept='.json,application/json' onChange={event => { void restore(event.target.files?.[0]); }}/></label></> : <>
        <h3>Guarda tu recuperación antes de crear el espacio</h3><p>Conserva este archivo raíz en un lugar privado. Comparte con tu agente únicamente su configuración MCP.</p>
        <button type='button' disabled={busy} onClick={() => { download('bazaar-acceso-privado.json', access); setDownloaded(true); }}>Descargar archivo de recuperación</button>
        <label className={styles.check}><input type='checkbox' checked={saved} disabled={busy || !downloaded} onChange={event => setSaved(event.target.checked)}/> Tengo una copia segura del archivo.</label>
        <p>Referencia de alta: <code>{access.creationId}</code>. Se conserva al recuperar este intento.</p>
        <button type='button' disabled={!saved || !downloaded || busy || !!receipt || uncertain || restored || serverPaused || !enabled} onClick={() => void create()}>Crear mi espacio</button>
        {(uncertain || restored || serverPaused) && !receipt && <button type='button' disabled={!saved || !downloaded || busy} onClick={() => void create(true)}>Recuperar el mismo intento</button>}
        {receipt && <div className={styles.ready}><h3>Importa el acceso de tu agente</h3><p>La configuración contiene sólo el acceso de agente. Le permite trabajar en tu espacio; para enviar servicios debes concederle el permiso desde Mis servicios.</p>
          <button type='button' onClick={() => download('bazaar-mcp-agente.json', { mcpServers: { bazaar: { type:'http',url:`${access.origin}/api/mcp`,headers:{Authorization:`Bearer ${access.agent}`} } } })}>Descargar configuración privada del agente</button>
          <p>Tu acceso humano permite revisar pedidos y administrar el permiso de publicación.</p><a className={styles.open} href={`${access.origin}/history#token=${encodeURIComponent(access.human)}`} referrerPolicy='no-referrer'>Abrir mi espacio privado</a><p>Tu enlace permite leer el espacio. El acceso se retira de la URL al entrar y permanece sólo en memoria.</p></div>}
        <button type='button' className={styles.lock} onClick={lock}>Bloquear y retirar este acceso</button>
      </>}
      <p role='status' aria-live='polite' className={styles.notice}>{busy ? 'Procesando el acceso… ' : ''}{notice}</p>
    </section><footer>Servicios nuevos a 0,01 USDC oficial en Stellar testnet. El agente comprador firma localmente. Bazaar no aloja agentes ni guarda claves de wallet.</footer>
  </main>;
}
