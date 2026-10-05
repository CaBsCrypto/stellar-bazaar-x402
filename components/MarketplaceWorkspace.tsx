'use client';
import {useEffect, useRef, useState} from 'react';
import type {ServiceCard} from '../lib/types';
import type {MarketOrder} from '../lib/marketplace-store';
import {isCanonicalUsdcTestnet, USDT0_MAINNET_DESCRIPTOR, type StellarCreditIdentity} from '../lib/payment-assets';
import styles from './MarketplaceWorkspace.module.css';
import {serializedPrivateRead} from '../lib/private-read-queue';

type Service = {submissionId: string; card: ServiceCard; cardHash: string; status: string; control?: {expectedRecord: string; domain: string; verificationPath?: string}};
type Order = MarketOrder & {perspective?: 'purchase' | 'sale'};
type ActionContext = {generation: number; access: string; controller: AbortController};
const statuses: Record<MarketOrder['phase'], string> = {
  'awaiting-payment': 'Pendiente de pago', 'payment-submitting': 'Enviando pago',
  'payment-uncertain': 'Pago incierto · conciliar', paid: 'Pago verificado · pendiente de agente',
  executing: 'Agente trabajando', 'execution-uncertain': 'Pago verificado · ejecución incierta',
  delivered: 'Entrega disponible', 'delivery-failed': 'Pago verificado · entrega fallida',
};
const testnetPassphrase = 'Test SDF Network ; September 2015';
const canBuy = (card: ServiceCard) => !card.payment.marketplace && card.payment.asset === 'USDC' && isCanonicalUsdcTestnet(card.payment.identity);
function saveIntent(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type: 'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
function AssetIdentity({identity}: {identity?: StellarCreditIdentity}) {
  return identity ? <details><summary>Identidad del activo</summary><dl><dt>Red</dt><dd>{identity.network}</dd><dt>Emisor</dt><dd><code>{identity.issuer}</code></dd><dt>Contrato SAC</dt><dd><code>{identity.sacContract}</code></dd></dl></details> : null;
}

export default function MarketplaceWorkspace({access, onLock}: {access: string; onLock: () => void}) {
  const [services, setServices] = useState<Service[]>([]), [mine, setMine] = useState<Service[]>([]), [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [payer, setPayer] = useState(''), [input, setInput] = useState('{}');
  const [card, setCard] = useState(''), [submissionId, setSubmissionId] = useState(''), [operationId, setOperationId] = useState('');
  const [selected, setSelected] = useState<Service | null>(null), [uncertain, setUncertain] = useState(false), [paused, setPaused] = useState(true);
  const [savedOrder, setSavedOrder] = useState(''), [savedCard, setSavedCard] = useState('');
  const generation = useRef(0), controller = useRef<AbortController | null>(null), alive = useRef(true);
  const current = (ctx: Pick<ActionContext, 'generation'>) => alive.current && generation.current === ctx.generation;
  function clearPrivate() {
    setServices([]); setMine([]); setOrders([]); setCard(''); setPayer(''); setInput('{}'); setSelected(null);
    setSubmissionId(''); setOperationId(''); setSavedOrder(''); setSavedCard(''); setError(''); setUncertain(false); setPaused(true);
  }
  async function api(ctx: ActionContext, path: string, body?: unknown) {
    if (!current(ctx)) throw new DOMException('Disconnected', 'AbortError');
    const signal = AbortSignal.any([ctx.controller.signal, AbortSignal.timeout(15000)]);
    const request = () => fetch(path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', redirect: 'error',
      headers: {Authorization: `Bearer ${ctx.access}`, ...(body === undefined ? {} : {'Content-Type': 'application/json'})},
      ...(body === undefined ? {} : {body: JSON.stringify(body)}), cache: 'no-store',
      signal,
    });
    const response = body === undefined ? await serializedPrivateRead(ctx.access, signal, request) : await request();
    const value = await response.json();
    if (!current(ctx)) throw new DOMException('Disconnected', 'AbortError');
    if (!response.ok) throw Error(value.error?.code ?? 'REQUEST_FAILED');
    return value;
  }
  async function run(action: (ctx: ActionContext) => Promise<void>, write = false) {
    if (!alive.current) return;
    controller.current?.abort(); controller.current = new AbortController();
    const ctx = {generation: ++generation.current, access, controller: controller.current};
    setBusy(true); setError('');
    try { await action(ctx); }
    catch (e) {
      if (current(ctx)) {
        setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
        if (write && !(e instanceof Error && /^(WALLET_|SELECT_STELLAR_TESTNET|JSON_)/.test(e.message))) setUncertain(true);
      }
    } finally { if (current(ctx)) setBusy(false); }
  }
  async function refresh(ctx: ActionContext) {
    // Both reads debit the same owner's quota. Sequential calls avoid a quota CAS conflict.
    const catalog = await api(ctx, '/api/market/services');
    const history = await api(ctx, '/api/market/orders');
    if (current(ctx)) { setServices(catalog.services); setMine(catalog.mine); setOrders(history.orders); setPaused(catalog.paused); }
    return catalog.services as Service[];
  }
  useEffect(() => {
    alive.current = true; clearPrivate();
    void run(async ctx => {
      const catalog = await refresh(ctx);
      const id = new URLSearchParams(window.location.search).get('service');
      const requested = catalog.find(service => service.card.id === id && canBuy(service.card));
      if (current(ctx) && requested) { setSelected(requested); setOperationId(crypto.randomUUID()); }
    });
    return () => { alive.current = false; generation.current++; controller.current?.abort(); };
  }, [access]);
  function lock() {
    alive.current = false; generation.current++; controller.current?.abort(); clearPrivate(); setBusy(false); onLock();
  }
  async function wallet(ctx: ActionContext) {
    const freighter = await import('@stellar/freighter-api'); if (!current(ctx)) return;
    const connection = await freighter.requestAccess(); if (!current(ctx)) return;
    if (connection.error) throw Error('WALLET_CONNECTION_REJECTED');
    const network = await freighter.getNetworkDetails(); if (!current(ctx)) return;
    if (network.error || network.networkPassphrase !== testnetPassphrase) throw Error('SELECT_STELLAR_TESTNET');
    setPayer(connection.address);
  }
  async function pay(ctx: ActionContext, order: Order) {
    const {payment} = await api(ctx, `/api/market/orders/${order.operationId}`, {action: 'prepare'});
    const freighter = await import('@stellar/freighter-api'); if (!current(ctx)) return;
    const network = await freighter.getNetworkDetails(); if (!current(ctx)) return;
    if (network.error || network.networkPassphrase !== testnetPassphrase) throw Error('SELECT_STELLAR_TESTNET');
    const signed = await freighter.signTransaction(payment.unsignedXdr, {networkPassphrase: testnetPassphrase, address: order.payer});
    if (!current(ctx)) return;
    if (signed.error || !signed.signedTxXdr || signed.signerAddress !== order.payer) throw Error('WALLET_SIGNING_REJECTED');
    await api(ctx, `/api/market/orders/${order.operationId}`, {action: 'pay', signedXdr: signed.signedTxXdr});
    await refresh(ctx);
  }
  function recoverFile(file: File | undefined, limit: number, restore: (value: Record<string, unknown>) => void, code: string) {
    const ctx = {generation: generation.current};
    if (!current(ctx)) return;
    if (!file || file.size > limit) { setError('ARCHIVO_INVALIDO'); return; }
    void file.text().then(raw => {
      if (!current(ctx)) return;
      try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
        restore(value as Record<string, unknown>); setUncertain(false);
      }
      catch { if (current(ctx)) setError(code); }
    }).catch(() => { if (current(ctx)) setError('ARCHIVO_INVALIDO'); });
  }

  return <section className={styles.panel} aria-labelledby='market-workspace-title'>
    <div className={styles.header}><div><p>Marketplace · sólo Stellar testnet</p><h2 id='market-workspace-title'>Compras, ventas y mis servicios</h2></div><button onClick={lock}>Bloquear espacio</button></div>
    <p>Tu agente corre en tu infraestructura. Los pagos van a la wallet del vendedor. Las entregas son texto declarado por su agente; verificar el pago no certifica su calidad.</p>
    <p>Pagos del piloto: USDC de Circle en testnet. {USDT0_MAINNET_DESCRIPTOR.identity.code} está preparado para mainnet y sus pagos permanecen desactivados.</p>
    <button disabled={busy} onClick={() => void run(async ctx => { await refresh(ctx); })}>Actualizar marketplace</button>
    {busy && <p role='status'>Procesando…</p>}{error && <p role='alert'>{error}. Conserva el identificador y actualiza para comprobar el estado; no repitas pagos.</p>}
    {uncertain && <p role='status'>Una acción requiere comprobación. Las nuevas escrituras están pausadas en esta vista. Conserva tu archivo de intención y recupera el estado antes de continuar.</p>}
    <h3>Servicios disponibles</h3>{paused && <p role='status'>Nuevas publicaciones y compras pausadas. Tu historial sigue disponible.</p>}
    <label>Recuperar intención de compra<input type='file' accept='application/json' disabled={busy} onChange={e => {
      recoverFile(e.target.files?.[0], 16384, value => {
        const service = services.find(v => v.card.id === value.serviceId && v.cardHash === value.cardHash);
        if (!service || !canBuy(service.card) || typeof value.operationId !== 'string' || typeof value.payer !== 'string' || !value.input) throw Error();
        const text = JSON.stringify(value.input); setSelected(service); setOperationId(value.operationId); setPayer(value.payer); setInput(text); setSavedOrder(`${value.operationId}|${value.payer}|${text}`);
      }, 'ARCHIVO_INVALIDO_O_SERVICIO_NO_DISPONIBLE'); e.target.value = '';
    }}/></label>
    {!services.length && <p>No hay servicios testnet aprobados disponibles.</p>}
    <div className={styles.grid}>{services.map(service => <article key={service.submissionId}><h4>{service.card.name}</h4><p>{service.card.description}</p><p>{service.card.payment.amount} {service.card.payment.asset} · testnet</p><AssetIdentity identity={service.card.payment.identity}/>{service.card.payment.marketplace ? <p>Disponible para tu agente por x402. El comprobante y la entrega aparecerán en tu historial privado.</p> : <button disabled={busy || uncertain || paused || !canBuy(service.card)} onClick={() => { setSelected(service); setOperationId(crypto.randomUUID()); setInput('{}'); setSavedOrder(''); }}>Preparar compra</button>}</article>)}</div>
    {selected && <form onSubmit={e => { e.preventDefault(); void run(async ctx => {
      await api(ctx, '/api/market/orders', {operationId, serviceId: selected.card.id, cardHash: selected.cardHash, payer, input: JSON.parse(input)}); setSelected(null); await refresh(ctx);
    }, true); }}>
      <h3>Comprar {selected.card.name}</h3><p>{selected.card.payment.amount} {selected.card.payment.asset} testnet. Destinatario: <code>{selected.card.payment.destination}</code></p><AssetIdentity identity={selected.card.payment.identity}/>
      <button type='button' disabled={busy} onClick={() => void run(wallet)}>Conectar Freighter en testnet</button>
      <label>Cuenta pública del comprador<input value={payer} onChange={e => setPayer(e.target.value)} autoComplete='off' required/></label>
      <label>Parámetros JSON<textarea value={input} onChange={e => setInput(e.target.value)} required/></label><p>Campos: {selected.card.input.map(v => `${v.name} (${v.type}${v.required ? ', obligatorio' : ''})`).join(', ')}</p>
      <p>Referencia: <code>{operationId}</code></p><button type='button' disabled={busy} onClick={() => { try { saveIntent('bazaar-order-intent.json', {operationId, serviceId: selected.card.id, cardHash: selected.cardHash, payer, input: JSON.parse(input)}); setSavedOrder(`${operationId}|${payer}|${input}`); } catch { setError('JSON_INVALIDO'); } }}>Guardar intención de compra</button>
      <button disabled={busy || uncertain || paused || !payer || savedOrder !== `${operationId}|${payer}|${input}`}>Crear pedido sin pagar todavía</button>
    </form>}
    <h3>Historial privado de compras y ventas</h3>
    {!orders.length && <p>Aún no tienes pedidos.</p>}
    {orders.map(order => <article key={order.operationId}><h4>{order.perspective === 'sale' ? 'Venta' : 'Compra'} · {order.card.name}</h4><p>{statuses[order.phase]}</p><p>{order.amount} {order.card.payment.asset} testnet · <time>{order.updatedAt}</time></p><p>Referencia: <code>{order.operationId}</code></p><p>Comprador: <code>{order.payer}</code> · Destinatario: <code>{order.destination}</code></p><AssetIdentity identity={order.settlement ?? order.card.payment.identity}/>
      {order.transactionHash && <p><a href={`https://stellar.expert/explorer/testnet/tx/${order.transactionHash}`} target='_blank' rel='noreferrer'>Transacción testnet</a> · {order.paymentVerifiedAt ? 'Verificada por Bazaar' : 'Sin confirmación'}</p>}
      {order.delivery && <><p>Entrega reportada por vendedor · <code>{order.delivery.reference}</code></p><pre>{order.delivery.text}</pre></>}
      {order.failure && <p>Fallo de entrega: {order.failure}</p>}
      {order.phase === 'execution-uncertain' && <p>Se conserva el pago y el intento del agente. Soporte debe comprobar la evidencia antes de resolver la entrega; no se ejecutará de nuevo automáticamente.</p>}
      {order.perspective === 'purchase' && order.phase === 'awaiting-payment' && canBuy(order.card) && <button disabled={busy || uncertain || paused} onClick={() => void run(ctx => pay(ctx, order), true)}>Firmar y pagar {order.amount} {order.card.payment.asset} testnet con Freighter</button>}
      {order.perspective === 'purchase' && ['payment-submitting', 'payment-uncertain'].includes(order.phase) && <button disabled={busy} onClick={() => void run(async ctx => { await api(ctx, `/api/market/orders/${order.operationId}`, {action: 'reconcile'}); await refresh(ctx); })}>Conciliar sin volver a pagar</button>}
    </article>)}
    <h3>Mis servicios</h3><p>Envía una Service Card HTTPS con precio USDC de Circle testnet, su emisor y contrato SAC, entrega text/plain e idempotencia. Requiere prueba de control HTTP y revisión manual antes de publicarse.</p>
    <form onSubmit={e => { e.preventDefault(); void run(async ctx => { const parsed = JSON.parse(card); await api(ctx, '/api/market/services', {submissionId, card: parsed, controlProof: {method: 'http-well-known', domain: new URL(parsed.url).hostname}}); await refresh(ctx); }, true); }}>
      <label>Ficha JSON<textarea value={card} onChange={e => setCard(e.target.value)} required/></label>
      <button type='button' disabled={busy || uncertain || paused} onClick={() => { try { const id = submissionId || crypto.randomUUID(); saveIntent('bazaar-service-intent.json', {submissionId: id, card: JSON.parse(card)}); setSubmissionId(id); setSavedCard(card); } catch { setError('JSON_INVALIDO'); } }}>Guardar intención de publicación</button>
      <label>Recuperar intención guardada<input type='file' accept='application/json' disabled={busy} onChange={e => { recoverFile(e.target.files?.[0], 32768, value => { if (typeof value.submissionId !== 'string' || !value.card) throw Error(); const text = JSON.stringify(value.card, null, 2); setSubmissionId(value.submissionId); setCard(text); setSavedCard(text); }, 'ARCHIVO_INVALIDO'); e.target.value = ''; }}/></label>
      <p>Referencia: <code>{submissionId || 'Guarda la intención primero'}</code></p><button disabled={!submissionId || busy || uncertain || paused || savedCard !== card}>Enviar a revisión</button>
    </form>
    {mine.map(service => <article key={service.submissionId}><h4>{service.card.name}</h4><p>Estado: {service.status}</p><code>{service.submissionId}</code>{service.control && <details><summary>Prueba de control del endpoint</summary><p>Publica este contenido exacto en {service.control.domain}{service.control.verificationPath}:</p><pre>{service.control.expectedRecord}</pre></details>}<button disabled={busy || uncertain || service.status === 'withdrawn'} onClick={() => void run(async ctx => { await api(ctx, `/api/market/services/${service.submissionId}`, {action: 'withdraw'}); await refresh(ctx); }, true)}>Retirar de nuevas compras</button></article>)}
  </section>;
}
