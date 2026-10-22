'use client';
import {UiText, useUiLanguage, UiServiceName} from "@/components/UiLanguage";

import {useEffect, useRef, useState} from 'react';
import type {ServiceCard} from '../lib/types';
import type {MarketOrder} from '../lib/marketplace-store';
import {serializedPrivateRead} from '../lib/private-read-queue';
import {PrivateUiError, privateUiError, privateUiMessage} from '../lib/private-ui-error';
import {ServiceShare} from './ServiceShare';
import styles from './MarketplaceWorkspace.module.css';

type Service = {submissionId: string; card: ServiceCard; cardHash: string; status: string; control?: {expectedRecord: string; domain: string; verificationPath?: string}};
type Order = MarketOrder & {perspective?: 'purchase' | 'sale'};
type Permission = {permission: 'market:submit'; revision: number; generation: number; allowServiceSubmission: boolean};
type Intent = {version: 1; origin: string; generation: number; changeId: string; expectedRevision: number; allowServiceSubmission: boolean};
type Context = {generation: number; access: string; controller: AbortController};
const originalRecoveryId = '31c97193-be74-4b9d-b0a3-f3890b0a41e8';
const recoveryMessages: Record<string, string> = {
  X402_PAYMENT_OUTCOME_UNCERTAIN: 'El envío original sigue sin confirmación. Conserva su comprobante y consulta el estado del mismo pedido.',
  X402_PAYMENT_NOT_VERIFIED: 'La transacción no acredita el pago de este pedido.',
  X402_RECOVERY_TRANSACTION_CONFLICT: 'El pedido ya conserva una transacción diferente. Revisa el comprobante original.',
  X402_RECOVERY_SCOPE_MISMATCH: 'La transacción no corresponde a la recuperación de este pedido.',
  X402_RECOVERY_FEE_UNVERIFIED: 'No se pudo comprobar la tarifa del envío original.',
  X402_RECOVERY_UNAVAILABLE: 'La comprobación no está disponible. Conserva el comprobante original.',
  AUTHORIZATION_SNAPSHOT_CHANGED: 'El acceso cambió durante la comprobación. Abre de nuevo tu espacio privado.',
};
const statuses: Record<MarketOrder['phase'], string> = {
  'awaiting-payment': 'Pendiente de pago', 'payment-submitting': 'Comprobando pago',
  'payment-uncertain': 'Pago incierto · conciliar', paid: 'Pago verificado · pendiente de agente',
  executing: 'Agente trabajando', 'execution-uncertain': 'Pago verificado · ejecución incierta',
  delivered: 'Entrega disponible', 'delivery-failed': 'Pago verificado · entrega fallida',
};
function saveIntent(value: Intent) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type: 'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = 'bazaar-publication-permission.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function readIntent(raw: string, permission: Permission): Intent {
  const value = JSON.parse(raw);
  if (!value || Object.keys(value).sort().join(',') !== 'allowServiceSubmission,changeId,expectedRevision,generation,origin,version'
    || value.version !== 1 || value.origin !== location.origin || value.generation !== permission.generation
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.changeId)
    || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0 || typeof value.allowServiceSubmission !== 'boolean') throw Error('INVALID_PERMISSION_FILE');
  return value;
}
function Pager({name, limit, page, next, busy, onLimit, onPage}: {name: string; limit: number; page: number; next?: string; busy: boolean; onLimit: (n: number) => void; onPage: (direction: number) => void}) {
 const {t, language} = useUiLanguage();
  return <nav className={styles.pager} aria-label={t("Páginas de {0}", [t(name)])}><label><UiText text="Por página"/><select value={limit} disabled={busy} onChange={e => onLimit(Number(e.target.value))}><option value={10}>10</option><option value={20}>20</option></select></label><button disabled={busy || page === 0} onClick={() => onPage(-1)}><UiText text="Anterior"/></button><span><UiText text="Página"/>{" "}{page + 1}</span><button disabled={busy || !next} onClick={() => onPage(1)}><UiText text="Siguiente"/></button></nav>;
}

type PrivateFile=NonNullable<MarketOrder['fileDelivery']>['files'][number]&{expiresAt?:string;integrity?:string};
function MarketplaceFiles({order,access}:{order:Order;access:string}){
 const {t, language} = useUiLanguage();
 const [files,setFiles]=useState<PrivateFile[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),controller=useRef<AbortController|null>(null);
 useEffect(()=>{generation.current++;setFiles([]);setError('');return()=>{generation.current++;controller.current?.abort();};},[access,order.operationId]);
 useEffect(()=>{if(!files.length)return;const end=Math.min(...files.map(f=>Date.parse(f.expiresAt??order.fileDelivery!.expiresAt)));const timer=setTimeout(()=>setFiles([]),Math.max(0,end-Date.now()));return()=>clearTimeout(timer);},[files,order.fileDelivery]);
 const delivery=order.fileDelivery;if(!delivery)return null;
 const expired=Date.parse(delivery.expiresAt)<=Date.now();
 const visibleFiles:PrivateFile[]=files.length?files:delivery.files.map(({url: _url,...file})=>file);
 async function load(){
  controller.current?.abort();controller.current=new AbortController();const current=++generation.current,signal=controller.current.signal;setBusy(true);setError('');
  try{const response=await serializedPrivateRead(access,signal,()=>fetch(`/api/market/orders/${order.operationId}/deliveries`,{headers:{Authorization:'Bearer '+access},cache:'no-store',redirect:'error',signal}));const body=await response.json();if(current!==generation.current)return;if(!response.ok)throw Error(body.error?.code??'FILE_ACCESS_UNAVAILABLE');setFiles(body.delivery.files);}
  catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'FILE_ACCESS_UNAVAILABLE');}
  finally{if(current===generation.current)setBusy(false);}
 }
 return <section aria-label={t("Archivos de la entrega")}><h5><UiText text="Archivos ·"/>{" "}{delivery.mode==='bazaar'?t("Conservados por Bazaar"):t("Alojados por el proveedor")}</h5><p><UiText text="Disponibles hasta"/>{" "}<time>{delivery.expiresAt}</time>. {delivery.mode==='external'?t("Disponibilidad e integridad declaradas por el proveedor."):t("La integridad de bytes se verifica por separado del pago.")}</p>
  {expired?<p><UiText text="El plazo del contenido terminó. Conserva el comprobante de la compra."/></p>:order.perspective==='purchase'?<button disabled={busy} onClick={()=>void load()}>{busy?t("Preparando acceso…"):t("Abrir archivos privados")}</button>:<p><UiText text="El acceso a los archivos de Bazaar pertenece al comprador."/></p>}
  {error&&<p role='alert'>{t(error)}<UiText text=". Recupera esta misma entrega; no repitas el pago."/></p>}
  {visibleFiles.map(file=><div key={file.id}><p>{file.name} · {file.size} bytes · {file.status==='available'?t("Disponible"):t("Pendiente de subida")}</p><p>SHA-256: <code>{file.sha256}</code></p>{file.url&&<><a href={file.url} target='_blank' rel='noreferrer'><UiText text="Descargar o abrir archivo"/></a>{['video/mp4','video/webm'].includes(file.mediaType)&&<video controls preload='metadata' src={file.url} style={{maxWidth:'100%'}}><UiText text="Tu navegador no reproduce este video."/></video>}{['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(file.mediaType)&&<img src={file.url} alt={file.name} referrerPolicy='no-referrer' style={{maxWidth:'100%'}}/>}</>}</div>)}
 </section>;
}

export default function MarketplaceWorkspace({access, onLock, view='all'}: {access: string; onLock: () => void; view?: 'history' | 'all'}) {
 const {t, language} = useUiLanguage();
  const [mine, setMine] = useState<Service[]>([]), [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [paused, setPaused] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number>();
  const [servicesVisible, setServicesVisible] = useState(view === 'all');
  const [orderLimit, setOrderLimit] = useState(10), [mineLimit, setMineLimit] = useState(10);
  const [orderPage, setOrderPage] = useState(0), [minePage, setMinePage] = useState(0);
  const [orderNext, setOrderNext] = useState<string>(), [mineNext, setMineNext] = useState<string>();
  const [permission, setPermission] = useState<Permission>(), [permissionReadOnly, setPermissionReadOnly] = useState(false);
  const [intent, setIntent] = useState<Intent>(), [intentSaved, setIntentSaved] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [uncertain, setUncertain] = useState(false), [notice, setNotice] = useState('');
  const [recoveryHash, setRecoveryHash] = useState(''), [recoveryAttempted, setRecoveryAttempted] = useState(false);
  const recoveryStarted = useRef(false);
  const orderCursors = useRef<(string | undefined)[]>([undefined]), mineCursors = useRef<(string | undefined)[]>([undefined]);
  const generation = useRef(0), controller = useRef<AbortController | null>(null), alive = useRef(true);
  const current = (ctx: Pick<Context, 'generation'>) => alive.current && generation.current === ctx.generation;
  function clearPrivate() {
    setMine([]); setOrders([]); setPermission(undefined); setPermissionReadOnly(false); setIntent(undefined); setIntentSaved(false); setConfirmed(false);
    setError(''); setUncertain(false); setNotice(''); setPaused(false); setOrderPage(0); setMinePage(0); setOrderNext(undefined); setMineNext(undefined);
    setRecoveryHash(''); setRecoveryAttempted(false); recoveryStarted.current = false;
    setRetryAfter(undefined);
    orderCursors.current = [undefined]; mineCursors.current = [undefined];
  }
  async function api(ctx: Context, path: string, body?: unknown) {
    if (!current(ctx)) throw new DOMException('Disconnected', 'AbortError');
    const signal = AbortSignal.any([ctx.controller.signal, AbortSignal.timeout(15000)]);
    const request = () => fetch(path, {method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', redirect: 'error', headers: {Authorization: `Bearer ${ctx.access}`, ...(body === undefined ? {} : {'Content-Type': 'application/json'})}, ...(body === undefined ? {} : {body: JSON.stringify(body)}), cache: 'no-store', signal});
    const response = body === undefined ? await serializedPrivateRead(ctx.access, signal, request) : await request();
    const value = await response.json();
    if (!current(ctx)) throw new DOMException('Disconnected', 'AbortError');
    if (!response.ok) {
      const failure = privateUiError(response, value);
      if (response.status === 401 || response.status === 403 && path.startsWith('/api/market/orders?')) lock();
      throw failure;
    }
    return value;
  }
  async function run(action: (ctx: Context) => Promise<void>, write = false, initial = false) {
    if (!alive.current || (busy && !initial) || (retryAfter !== undefined && !initial)) return;
    controller.current?.abort(); controller.current = new AbortController();
    const ctx = {generation: ++generation.current, access, controller: controller.current};
    setBusy(true); setError(''); setNotice('');
    try { await action(ctx); }
    catch (e) { if (current(ctx)) {
      setError(privateUiMessage(e, [...Object.values(recoveryMessages), 'La respuesta requiere comprobación. Conserva el comprobante y actualiza el historial del mismo pedido.', 'La respuesta requiere comprobación. Conserva el comprobante original.']));
      if (e instanceof PrivateUiError) setRetryAfter(e.retryAfterSeconds);
      if (write) setUncertain(true);
    } }
    finally { if (current(ctx)) setBusy(false); }
  }
  async function loadOrders(ctx: Context, page = orderPage, limit = orderLimit, cursor = orderCursors.current[page]) {
    const query = new URLSearchParams({limit: String(limit)}); if (cursor) query.set('cursor', cursor);
    const body = await api(ctx, `/api/market/orders?${query}`);
    if (current(ctx)) { setOrders(body.orders); setOrderNext(body.nextCursor); setOrderPage(page); setOrderLimit(limit); }
  }
  function recoverOriginal(order: Order) {
    const transactionHash = recoveryHash.trim();
    if (busy || retryAfter !== undefined || recoveryStarted.current || order.operationId !== originalRecoveryId || order.perspective !== 'purchase' || order.paymentProtocol !== 'x402-stellar-exact-v2' || order.transactionHash || order.phase !== 'payment-uncertain') return;
    if (!/^[a-f0-9]{64}$/.test(transactionHash)) { setError('Introduce los 64 caracteres del hash del comprobante original de Stellar Testnet.'); return; }
    // Consume this explicit UI attempt synchronously, including a lost response.
    // Refresh and session restoration read history; neither retries this POST.
    recoveryStarted.current = true; setRecoveryAttempted(true);
    void run(async ctx => {
      try { await api(ctx, `/api/market/orders/${originalRecoveryId}`, {action: 'reconcile', transactionHash}); }
      catch (e) { throw Error(e instanceof Error ? recoveryMessages[e.message] ?? 'La respuesta requiere comprobación. Conserva el comprobante y actualiza el historial del mismo pedido.' : 'La respuesta requiere comprobación. Conserva el comprobante original.'); }
      if (current(ctx)) setRecoveryHash('');
      await loadOrders(ctx);
    });
  }
  async function loadMine(ctx: Context, page = minePage, limit = mineLimit, cursor = mineCursors.current[page]) {
    const query = new URLSearchParams({limit: String(limit)}); if (cursor) query.set('mineCursor', cursor);
    const body = await api(ctx, `/api/market/services?${query}`);
    if (current(ctx)) { setMine(body.mine); setMineNext(body.mineNextCursor); setMinePage(page); setMineLimit(limit); setPaused(body.paused); }
  }
  async function loadPermission(ctx: Context) {
    try { const body = await api(ctx, '/api/market/agent-permissions'); if (current(ctx)) { setPermission(body.permission); setPermissionReadOnly(false); } }
    catch (e) { if (current(ctx) && e instanceof PrivateUiError && e.code === 'FORBIDDEN') { setPermissionReadOnly(true); return; } throw e; }
  }
  useEffect(() => {
    if (retryAfter === undefined) return;
    const timer = setTimeout(() => setRetryAfter(undefined), retryAfter * 1000);
    return () => clearTimeout(timer);
  }, [retryAfter]);
  useEffect(() => {
    alive.current = true; clearPrivate(); setServicesVisible(view === 'all');
    void run(async ctx => { await loadOrders(ctx, 0, 10, undefined); if (view === 'all') { await loadMine(ctx, 0, 10, undefined); await loadPermission(ctx); } }, false, true);
    return () => { alive.current = false; generation.current++; controller.current?.abort(); };
  }, [access, view]);
  function lock() { alive.current = false; generation.current++; controller.current?.abort(); clearPrivate(); setBusy(false); onLock(); }
  function preparePermission(allowServiceSubmission: boolean) {
    if (!permission || busy || retryAfter !== undefined || uncertain) return;
    setIntent({version: 1, origin: location.origin, generation: permission.generation, changeId: crypto.randomUUID(), expectedRevision: permission.revision, allowServiceSubmission}); setIntentSaved(false); setConfirmed(false); setNotice('Guarda y confirma esta intención antes de cambiar el permiso.');
  }
  async function submitPermission(ctx: Context) {
    if (!intent || !intentSaved || !confirmed) return;
    const body = await api(ctx, '/api/market/agent-permissions', {changeId: intent.changeId, expectedRevision: intent.expectedRevision, allowServiceSubmission: intent.allowServiceSubmission});
    if (current(ctx)) { setPermission(body.permission); setIntent(undefined); setIntentSaved(false); setConfirmed(false); setUncertain(false); setNotice('Permiso confirmado. La rotación o revocación del acceso lo invalida.'); }
  }
  async function restorePermission(file?: File) {
    if (!file || !permission || busy || retryAfter !== undefined) return;
    const ctx = {generation: ++generation.current}; controller.current?.abort();
    try { if (file.size > 1024) throw Error(); const raw = await file.text(); if (!current(ctx)) return; setIntent(readIntent(raw, permission)); setIntentSaved(true); setConfirmed(false); setUncertain(true); setNotice('Intención restaurada. Confirma para recuperar exactamente este cambio.'); }
    catch { if (current(ctx)) setError('El archivo de permiso no corresponde a este origen y generación.'); }
  }
  const blocked = busy || retryAfter !== undefined;
  return <section className={styles.panel} aria-labelledby='market-workspace-title'>
    <div className={styles.header}><div><p><UiText text="Stellar testnet · espacio privado"/></p><h2 id='market-workspace-title'><UiText text="Compras, ventas y mis servicios"/></h2></div><button onClick={lock}><UiText text="Bloquear espacio"/></button></div>
    <p><UiText text="Tu agente descubre, compra y ejecuta desde tu infraestructura. Cada ficha declara su precio en USDC oficial de Stellar Testnet; el pedido conserva esas condiciones. El historial privado dura siete días."/></p>
    <p><a href='/catalogo'><UiText text="Ver catálogo público"/></a> · <a href='/hub'><UiText text="Conectar mi agente por MCP"/></a></p>
    <button disabled={blocked} onClick={() => void run(ctx => loadOrders(ctx))}><UiText text="Actualizar esta página de pedidos"/></button>
    <button disabled={blocked} onClick={() => { setServicesVisible(true); void run(async ctx => { await loadMine(ctx); await loadPermission(ctx); }); }}><UiText text="Mis servicios y permiso de publicación"/></button>
    {busy && <p role='status'><UiText text="Consultando tu espacio…"/></p>}{error && <p role='alert'>{t(error)}{' '}<UiText text="Si un pago es incierto, no lo repitas."/></p>}
    {notice && <p role='status'>{t(notice)}</p>}
    {retryAfter !== undefined && <p role='status'><UiText text="El servidor pide esperar {0} segundos. La consulta no se repetirá automáticamente." values={[retryAfter]}/></p>}
    <h3><UiText text="Historial privado de compras y ventas"/></h3>
    {!busy && !orders.length && !error && <p><UiText text="Aún no tienes pedidos en esta página."/></p>}
    {orders.map(order => <article key={order.operationId}><h4>{order.perspective === 'sale' ? t("Venta") : t("Compra")} · <UiServiceName id={order.card.id} name={order.card.name}/></h4><p>{t(statuses[order.phase])}</p><p>{order.amount} {order.card.payment.asset} · <time>{order.updatedAt}</time></p><p><UiText text="Referencia:"/>{" "}<code>{order.operationId}</code></p><details><summary><UiText text="Condiciones del pedido"/></summary><p><UiText text="Comprador:"/>{" "}<code>{order.payer}</code></p><p><UiText text="Destinatario:"/>{" "}<code>{order.destination}</code></p><p><UiText text="Protocolo:"/>{" "}{order.paymentProtocol ?? t("registro histórico")}</p><p><UiText text="Hash de la ficha:"/>{" "}<code>{order.cardHash}</code></p></details>
      {order.transactionHash && <p><a href={`https://stellar.expert/explorer/testnet/tx/${order.transactionHash}`} target='_blank' rel='noreferrer'><UiText text="Transacción testnet"/></a> · {order.paymentVerifiedAt ? t("Verificada por Bazaar") : t("Sin confirmación")}</p>}
      {order.delivery && <><p><UiText text="Entrega reportada por vendedor ·"/>{" "}<code>{order.delivery.reference}</code></p><pre>{order.delivery.text}</pre><p><UiText text="El pago verificado no certifica la calidad de la entrega."/></p></>}
      {order.fileDelivery&&<MarketplaceFiles key={`${access}-${order.operationId}`} order={order} access={access}/>}
      {order.failure && <p><UiText text="Fallo de entrega:"/>{" "}{order.failure}</p>}
      {order.phase === 'awaiting-payment' && <p><UiText text="Tu agente debe recuperar este mismo pedido y su archivo de intención antes de continuar."/></p>}
      {order.phase === 'execution-uncertain' && <p><UiText text="Se conserva el pago y el intento de ejecución. Revisa la evidencia con el vendedor antes de resolver; no se ejecuta de nuevo automáticamente."/></p>}
      {order.perspective === 'purchase' && ['payment-submitting', 'payment-uncertain'].includes(order.phase) && (order.operationId === originalRecoveryId && order.paymentProtocol === 'x402-stellar-exact-v2' && !order.transactionHash ? order.phase === 'payment-uncertain' ? <section aria-label={t("Comprobar el pago original")}>
        <p><UiText text="Recupera el hash del comprobante del envío original. Bazaar comprobará en Stellar Testnet que acredita este mismo pedido."/></p>
        <label htmlFor='original-payment-transaction'><UiText text="Hash de la transacción original"/><input id='original-payment-transaction' type='text' value={recoveryHash} maxLength={64} autoComplete='off' autoCapitalize='none' spellCheck={false} disabled={blocked || recoveryAttempted} aria-describedby='original-payment-help' onChange={e => setRecoveryHash(e.target.value)}/></label>
        <p id='original-payment-help'><UiText text="Si aún no tienes el hash, conserva el pedido y su comprobante. La comprobación no crea una firma ni otro pago."/></p>
        <button disabled={blocked || recoveryAttempted || !/^[a-f0-9]{64}$/.test(recoveryHash.trim())} onClick={() => recoverOriginal(order)}><UiText text="Comprobar el pago original"/></button>
        {recoveryAttempted && <p role='status'><UiText text="Actualiza el historial para consultar el resultado de esta comprobación. Conserva el mismo pedido y el comprobante original."/></p>}
      </section> : <p><UiText text="La comprobación del envío original está en curso. Actualiza el historial para consultar este mismo pedido."/></p> : <button disabled={blocked} onClick={() => void run(async ctx => { await api(ctx, `/api/market/orders/${order.operationId}`, {action: 'reconcile'}); await loadOrders(ctx); })}><UiText text="Conciliar sin volver a pagar"/></button>)}
    </article>)}
    <Pager name={t("pedidos")} limit={orderLimit} page={orderPage} next={orderNext} busy={blocked} onLimit={n => { orderCursors.current = [undefined]; void run(ctx => loadOrders(ctx, 0, n, undefined)); }} onPage={direction => { const page = orderPage + direction; if (direction > 0) orderCursors.current[page] = orderNext; void run(ctx => loadOrders(ctx, page)); }}/>
    {servicesVisible && <><h3><UiText text="Permiso de publicación del agente"/></h3><p><UiText text="El acceso humano puede autorizar a su agente actual a enviar fichas a revisión. Una autorización no activa servicios: siguen requiriendo control del endpoint y revisión manual."/></p>
      {permissionReadOnly && <p role='status'><UiText text="Este acceso puede consultar el espacio. Abre el acceso humano de tu archivo de recuperación para administrar el permiso."/></p>}
      {permission && <><p><UiText text="Envío de servicios:"/>{" "}<strong>{permission.allowServiceSubmission ? t("Autorizado") : t("Sin autorización")}</strong> {" "}<UiText text="· generación"/>{" "}{permission.generation}<UiText text=", revisión"/>{" "}{permission.revision}.</p>
        <button disabled={blocked || uncertain || !!intent || permission.allowServiceSubmission} onClick={() => preparePermission(true)}><UiText text="Preparar autorización"/></button><button disabled={blocked || uncertain || !!intent || !permission.allowServiceSubmission} onClick={() => preparePermission(false)}><UiText text="Preparar revocación"/></button>
        <label><UiText text="Recuperar un cambio guardado"/><input type='file' accept='application/json,.json' disabled={blocked} onChange={e => { void restorePermission(e.target.files?.[0]); e.target.value = ''; }}/></label>
        {intent && <div className={styles.intent}><p><UiText text="Cambio:"/>{" "}<strong>{intent.allowServiceSubmission ? t("Autorizar envío a revisión") : t("Revocar envío a revisión")}</strong></p><p><UiText text="Referencia:"/>{" "}<code>{intent.changeId}</code></p><button disabled={blocked} onClick={() => { saveIntent(intent); setIntentSaved(true); }}><UiText text="Guardar intención del permiso"/></button><label className={styles.check}><input type='checkbox' checked={confirmed} disabled={blocked || !intentSaved} onChange={e => setConfirmed(e.target.checked)}/><UiText text="He guardado el archivo y confirmo este cambio."/></label><button disabled={blocked || !intentSaved || !confirmed} onClick={() => void run(submitPermission, true)}>{uncertain ? t("Recuperar el mismo cambio") : t("Confirmar permiso")}</button>{uncertain && <p role='status'><UiText text="El resultado requiere comprobación. Recupera con el mismo identificador, revisión y decisión; no crees otro cambio automáticamente."/></p>}<button disabled={blocked} onClick={() => void run(async ctx => { await loadPermission(ctx); if (current(ctx)) { setIntent(undefined); setConfirmed(false); setIntentSaved(false); setUncertain(false); setNotice("Estado consultado. Puedes preparar un cambio nuevo si lo necesitas."); } })}><UiText text="Consultar estado y descartar esta intención"/></button></div>}
      </>}
      <h3><UiText text="Mis servicios"/></h3>{paused && <p role='status'><UiText text="Nuevas publicaciones y compras pausadas. La lectura y recuperación del historial siguen disponibles."/></p>}<p><UiText text="Tu agente envía la ficha por MCP con"/>{" "}<code>submit_market_service</code> {" "}<UiText text="y guarda antes su intención. Puedes consultar aquí el estado y la prueba de control."/></p>
      {!busy && !mine.length && <p><UiText text="No hay servicios propios en esta página."/></p>}
      {mine.map(service => <article key={service.submissionId}><h4><UiServiceName id={service.card.id} name={service.card.name}/></h4><p><UiText text="Estado:"/>{" "}{service.status}</p><p><UiText text="Referencia:"/>{" "}<code>{service.submissionId}</code></p>{service.status === 'activated' && <ServiceShare serviceId={service.card.id} serviceName={service.card.name}/>} {service.control && <details><summary><UiText text="Prueba de control del endpoint"/></summary><p><UiText text="Publica este contenido exacto en"/>{" "}{service.control.domain}{service.control.verificationPath}:</p><pre>{service.control.expectedRecord}</pre></details>}{permission && <button disabled={blocked || service.status === 'withdrawn'} onClick={() => void run(async ctx => { await api(ctx, `/api/market/services/${service.submissionId}`, {action: 'withdraw'}); await loadMine(ctx); })}><UiText text="Retirar de nuevas compras"/></button>}</article>)}
      <Pager name={t("mis servicios")} limit={mineLimit} page={minePage} next={mineNext} busy={blocked} onLimit={n => { mineCursors.current = [undefined]; void run(ctx => loadMine(ctx, 0, n, undefined)); }} onPage={direction => { const page = minePage + direction; if (direction > 0) mineCursors.current[page] = mineNext; void run(ctx => loadMine(ctx, page)); }}/>
    </>}
  </section>;
}
