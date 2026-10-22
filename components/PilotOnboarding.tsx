'use client';
import {UiText, useUiLanguage, LanguageSwitch} from "@/components/UiLanguage";


import { useEffect, useRef, useState } from 'react';
import { createPilotAccess, parsePilotAccess, pilotHash, type PilotAccess } from '@/lib/pilot-access';
import { CopyText } from './ui/CopyText';
import { useBazaarOrigin } from './useBazaarOrigin';
import styles from './PilotOnboarding.module.css';
import { serviceSelectionHref } from '@/lib/service-selection';
import { SelectedServiceContext } from './SelectedServiceContext';

export type WorkspaceReceipt = { workspaceId: string; ownerId: string; agentId: string; creationId: string; generation: number; revoked: false; createdAt: string };
export function parseWorkspaceReceipt(value: unknown, creationId: string): WorkspaceReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('INVALID_RECEIPT');
  const record = value as Record<string, unknown>;
  if (record.creationId !== creationId || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(creationId) ||
      typeof record.workspaceId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(record.workspaceId) ||
      typeof record.ownerId !== 'string' || !/^ow_[a-f0-9]{32}$/.test(record.ownerId) || typeof record.agentId !== 'string' || !/^agent_[a-f0-9]{32}$/.test(record.agentId) ||
      !Number.isSafeInteger(record.generation) || (record.generation as number) < 1 || record.revoked !== false ||
      typeof record.createdAt !== 'string' || record.createdAt.length > 40 || !Number.isFinite(Date.parse(record.createdAt)) || new Date(record.createdAt).toISOString() !== record.createdAt) throw Error('INVALID_RECEIPT');
  return { workspaceId: record.workspaceId, ownerId: record.ownerId, agentId: record.agentId, creationId,
    generation: record.generation as number, revoked: false, createdAt: record.createdAt };
}
export function agentConnectionConfiguration(access: PilotAccess) {
  return { mcpServers: { bazaar: { type: 'http', url: `${access.origin}/api/mcp`, headers: { Authorization: `Bearer ${access.agent}` } } } };
}
export function publicWorkspaceReceipt(receipt: WorkspaceReceipt, origin: string) {
  return { version: 'bazaar-workspace-receipt/v1', origin, creationId: receipt.creationId, ownerId: receipt.ownerId,
    workspaceId: receipt.workspaceId, agentId: receipt.agentId, generation: receipt.generation, revoked: receipt.revoked, createdAt: receipt.createdAt };
}
export function WorkspaceIdentityReceipt({receipt, origin, language = 'en'}: {receipt: WorkspaceReceipt; origin: string; language?: 'en' | 'es'}) {
  const es = language === 'es';
  return <><h3>{es?'Identidad de tu espacio':'Your workspace identity'}</h3><p>{es?'Guarda este recibo sin secretos para comprobar a qué espacio se conecta tu agente. Usa el Owner ID como expected-owner en el cliente.':'Save this receipt without secrets to check which workspace your agent connects to. Use the Owner ID as expected-owner in the client.'}</p>
    <dl><dt>Owner ID</dt><dd><code>{receipt.ownerId}</code></dd><dt>Workspace ID</dt><dd><code>{receipt.workspaceId}</code></dd><dt>Agent ID</dt><dd><code>{receipt.agentId}</code></dd><dt>{es?'Generación':'Generation'}</dt><dd>{receipt.generation}</dd></dl>
    <button type='button' onClick={() => download('bazaar-workspace-receipt.json', publicWorkspaceReceipt(receipt, origin))}>{es?'Descargar recibo de identidad':'Download identity receipt'}</button></>;
}
function download(name: string, body: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function PilotOnboarding({ enabled = true, paused = false, serviceId }: { enabled?: boolean; paused?: boolean; serviceId?: string }) {
 const {t, language} = useUiLanguage();
  const origin = useBazaarOrigin(), es = language === 'es', publicConfig = { mcpServers: { bazaar: { type: 'http', url: `${origin}/api/chatgpt/mcp` } } };
  const [access, setAccess] = useState<PilotAccess | null>(null), [downloaded, setDownloaded] = useState(false), [saved, setSaved] = useState(false);
  const [receipt, setReceipt] = useState<WorkspaceReceipt | null>(null), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [restored, setRestored] = useState(false);
  const [notice, setNotice] = useState<string | {text: string; values: readonly unknown[]}>(''), [serverPaused, setServerPaused] = useState(paused);
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
        else if (response.status === 429) setNotice({text: 'Hay demasiadas solicitudes. Espera {0} segundos y recupera este mismo intento.', values: [response.headers.get('retry-after') ?? '60']});
        else if (response.status === 409) { setUncertain(true); setNotice('El acceso tiene un conflicto. Conserva este archivo y comprueba el mismo intento; no prepares otro espacio para resolverlo.'); }
        else { setUncertain(true); setNotice('La creación no está confirmada. Conserva el archivo y recupera este mismo intento.'); }
        return;
      }
      if (body.version !== '1') throw Error('INVALID_RECEIPT');
      setReceipt(parseWorkspaceReceipt(body.record, access.creationId)); setUncertain(false);
      setNotice('Tu espacio está listo. Importa la conexión de tu agente y abre tu acceso humano.');
    } catch { if (current === generation.current) { setUncertain(true); setNotice('La respuesta no está confirmada. No se repetirá automáticamente. Recupera el mismo intento con el archivo que ya guardaste.'); } }
    finally { clearTimeout(timeout); if (current === generation.current) { pending.current = null; setBusy(false); } }
  }
  return <main className={styles.page}>
    <nav className={styles.nav} aria-label={t("Navegación de alta")}><a href='/'>Bazaar</a><a href={serviceSelectionHref('/history', serviceId)}><UiText text="Recuperar mi espacio"/></a><LanguageSwitch/></nav>
    <header><h1><UiText text="Un espacio para tu agente."/></h1><p>{es?'Conecta tu propio agente y consulta su historial. Sin correo ni entrega de credenciales al operador. El alta y las compras dependen de la configuración y los recursos disponibles.':'Connect your own agent and view its history. No email or credentials handed to the operator. Registration and purchases depend on current configuration and available resources.'}</p></header>
    <SelectedServiceContext serviceId={serviceId}/>
    <section aria-labelledby='open-mcp-heading'><h2 id='open-mcp-heading'>{es?'Descubrimiento público':'Public discovery'}</h2><p>{es?'Explora el contrato y el catálogo desde un cliente MCP compatible, sin cuenta ni credencial. Esta conexión pública no abre tu espacio privado.':'Explore the contract and catalogue from a compatible MCP client without an account or credential. This public connection does not open your private workspace.'}</p><CopyText text={`${origin}/api/chatgpt/mcp`} label={es?'URL MCP pública':'Public MCP URL'} rows={2} compact/><button type='button' onClick={() => download('bazaar-mcp-publico.json', publicConfig)}><UiText text="Descargar configuración MCP pública"/></button><p><a href={serviceSelectionHref('/hub', serviceId)}><UiText text="Instrucciones para comprar o publicar con tu agente"/></a></p></section>
    <section className={styles.flow} aria-labelledby='open-access-heading'>
      <h2 id='open-access-heading'><UiText text="Tu acceso privado"/></h2>
      {(!enabled || serverPaused) && <p role='status'><UiText text="Nuevas altas pausadas. El catálogo y la recuperación de espacios existentes siguen disponibles."/></p>}
      {!access ? <><p><UiText text="Guarda primero tu archivo de recuperación. Contiene tu acceso humano, el del agente y el acceso raíz para renovar o revocar."/></p><button type='button' onClick={() => { try { install(createPilotAccess(location.origin), false); } catch { setNotice("Usa un navegador actualizado desde HTTPS o localhost."); } }}><UiText text="Preparar mi acceso privado"/></button><label className={styles.import}><UiText text="Ya tengo mi archivo de recuperación"/><input ref={input} type='file' accept='.json,application/json' onChange={event => { void restore(event.target.files?.[0]); }}/></label></> : <>
        <h3><UiText text="Guarda tu recuperación antes de crear el espacio"/></h3><p><UiText text="Conserva este archivo raíz en un lugar privado. Comparte con tu agente únicamente su configuración MCP."/></p>
        <button type='button' disabled={busy} onClick={() => { download('bazaar-acceso-privado.json', access); setDownloaded(true); }}><UiText text="Descargar archivo de recuperación"/></button>
        <label className={styles.check}><input type='checkbox' checked={saved} disabled={busy || !downloaded} onChange={event => setSaved(event.target.checked)}/> {" "}<UiText text="Tengo una copia segura del archivo."/></label>
        <p><UiText text="Referencia de alta:"/>{" "}<code>{access.creationId}</code><UiText text=". Se conserva al recuperar este intento."/></p>
        <button type='button' disabled={!saved || !downloaded || busy || !!receipt || uncertain || restored || serverPaused || !enabled} onClick={() => void create()}><UiText text="Crear mi espacio"/></button>
        {(uncertain || restored || serverPaused) && !receipt && <button type='button' disabled={!saved || !downloaded || busy} onClick={() => void create(true)}><UiText text="Recuperar el mismo intento"/></button>}
        {receipt && <div className={styles.ready}><WorkspaceIdentityReceipt receipt={receipt} origin={access.origin} language={es?'es':'en'}/>
          <h3>{es?'Conexión privada del agente':'Private agent connection'}</h3><p><UiText text="La configuración contiene sólo el acceso de agente. Le permite trabajar en tu espacio; para enviar servicios debes concederle el permiso desde Mis servicios."/></p>
          <button type='button' onClick={() => download('bazaar-mcp-agente.json', agentConnectionConfiguration(access))}><UiText text="Descargar configuración privada del agente"/></button>
          <p>{es?'Configura este archivo sólo en tu propio cliente. Comprueba identidad, rol de agente y generación antes de consultar historial. No necesitas una wallet para esa comprobación.':'Configure this file only in your own client. Check identity, agent role and generation before reading history. This check does not require a wallet.'} <a href='/AGENT_CONNECTION.md#private-preflight-and-history-without-a-wallet'>{es?'Cómo comprobar la conexión':'How to check the connection'}</a></p>
          <p><UiText text="Tu acceso humano permite revisar pedidos y administrar el permiso de publicación."/></p><a className={styles.open} href={`${access.origin}${serviceSelectionHref('/history', serviceId)}#token=${encodeURIComponent(access.human)}`} referrerPolicy='no-referrer'><UiText text="Abrir mi espacio privado"/></a><p><UiText text="Tu enlace permite leer el espacio. El acceso se retira de la URL al entrar y permanece sólo en memoria."/></p></div>}
        <button type='button' className={styles.lock} onClick={lock}><UiText text="Bloquear y retirar este acceso"/></button>
      </>}
      <p role='status' aria-live='polite' className={styles.notice}>{busy ? t("Procesando el acceso…") : ''}{t(typeof notice === 'string' ? notice : notice.text, typeof notice === 'string' ? [] : notice.values)}</p>
    </section><footer><UiText text="Cada proveedor define el precio de su servicio en USDC oficial de Stellar Testnet. El agente comprador firma localmente. Bazaar no aloja agentes ni guarda claves de wallet."/></footer>
  </main>;
}
