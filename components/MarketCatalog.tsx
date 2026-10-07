'use client';
import {useEffect, useRef, useState} from 'react';
import type {ServiceCard} from '@/lib/types';
import {ButtonLink, SectionHeading} from './ui';
import styles from './MarketCatalog.module.css';

type Entry = {submissionId: string; card: ServiceCard; cardHash: string; status: 'activated'; purchase?: {protocol?: string; resource?: string}};
export function MarketCatalog({standalone = false}: {standalone?: boolean}) {
  const [services, setServices] = useState<Entry[]>([]), [limit, setLimit] = useState(10), [page, setPage] = useState(0);
  const [next, setNext] = useState<string>(), [busy, setBusy] = useState(true), [error, setError] = useState('');
  const [paused, setPaused] = useState(false), [partial, setPartial] = useState(false);
  const generation = useRef(0), controller = useRef<AbortController | null>(null), cursors = useRef<(string | undefined)[]>([undefined]);
  async function load(target = page, size = limit, cursor = cursors.current[target]) {
    const current = ++generation.current; controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setBusy(true); setError('');
    const timer = setTimeout(() => request.abort(), 15000);
    try {
      const query = new URLSearchParams({limit: String(size)}); if (cursor) query.set('cursor', cursor);
      const response = await fetch(`/api/market/catalog?${query}`, {cache: 'no-store', credentials: 'omit', redirect: 'error', signal: request.signal});
      const body = await response.json(); if (current !== generation.current) return;
      if (!response.ok || !Array.isArray(body.services)) throw Error('CATALOG_UNAVAILABLE');
      setServices(body.services); setNext(body.nextCursor); setPaused(body.paused === true); setPartial(body.partialResults === true); setLimit(size); setPage(target);
    } catch { if (current === generation.current) { setServices([]); setNext(undefined); setPartial(false); setError('No pudimos comprobar esta página del catálogo. Vuelve a consultar antes de elegir un servicio.'); } }
    finally { clearTimeout(timer); if (current === generation.current) setBusy(false); }
  }
  useEffect(() => { void load(0, 10, undefined); return () => { generation.current++; controller.current?.abort(); }; }, []);
  return <section className={`ui-catalog ${styles.catalog}`} aria-label='Catálogo público del mercado' aria-busy={busy}>
    <SectionHeading headingLevel={standalone ? 1 : 2} eyebrow='CATÁLOGO PÚBLICO · STELLAR TESTNET' title='Servicios para tu agente'><p>Servicios activados para entregas de texto. Tu agente consulta la ficha y compra mediante x402.</p></SectionHeading>
    <div className={styles.actions}><ButtonLink href='/hub'>Conectar mi agente</ButtonLink><ButtonLink href='/publish' variant='secondary'>Ofrecer un servicio</ButtonLink><button disabled={busy} onClick={() => void load()}>Actualizar esta página</button></div>
    {paused && <p role='status' className='ui-notice'>Nuevas publicaciones y compras pausadas. Puedes consultar servicios y recuperar tu historial.</p>}
    {busy && <p role='status'>Consultando los servicios activos…</p>}{error && <p role='alert'>{error}</p>}
    {partial && <p role='status'>Esta página alcanzó su límite de tamaño. Continúa con Siguiente para consultar el resto.</p>}
    <div className={styles.grid}>{services.map(service => <article key={service.submissionId} className={styles.card}><p className={styles.status}>Activo · entrega de texto</p><h2>{service.card.name}</h2><p>{service.card.description}</p><p className={styles.price}>{service.card.payment.amount} {service.card.payment.asset} <span>de testnet</span></p><p>{service.card.tags.join(' · ')}</p><details><summary>Ver ficha y condiciones</summary><p>Referencia: <code>{service.card.id}</code></p><p>Hash: <code>{service.cardHash}</code></p><p>Red: {service.card.payment.identity?.network}</p><p>Emisor: <code>{service.card.payment.identity?.issuer}</code></p><p>Contrato SAC: <code>{service.card.payment.identity?.sacContract}</code></p><p>Protocolo: {service.purchase?.protocol ?? service.card.payment.marketplace?.protocol}</p><p>Entrada: {service.card.input.map(field => `${field.name} (${field.type}${field.required ? ', obligatorio' : ''})`).join(', ') || 'Sin parámetros'}</p><pre>{JSON.stringify(service.card, null, 2)}</pre></details><p>El agente paga directamente al vendedor. La activación y el pago verificado no certifican la calidad de la entrega.</p><ButtonLink href='/hub' variant='secondary'>Comprar con mi agente</ButtonLink></article>)}</div>
    {!busy && !error && !services.length && <div className='ui-empty'><h2>Aún no hay servicios activos en esta página</h2><p>Las fichas aparecen después de verificar el control del endpoint y completar la revisión.</p></div>}
    <nav className={styles.pager} aria-label='Páginas del catálogo'><label>Servicios por página<select value={limit} disabled={busy} onChange={e => { cursors.current = [undefined]; void load(0, Number(e.target.value), undefined); }}><option value={10}>10</option><option value={20}>20</option></select></label><button disabled={busy || page === 0} onClick={() => void load(page - 1)}>Anterior</button><span>Página {page + 1}</span><button disabled={busy || !next} onClick={() => { cursors.current[page + 1] = next; void load(page + 1); }}>Siguiente</button></nav>
  </section>;
}
