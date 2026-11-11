'use client';
import {UiText, useUiLanguage, UiServiceName, UiServiceDescription} from "@/components/UiLanguage";

import {useEffect, useRef, useState} from 'react';
import type {ServiceCard} from '@/lib/types';
import {deliveryStorage} from '@/lib/delivery-contract';
import {ButtonLink, SectionHeading} from './ui';
import styles from './MarketCatalog.module.css';

type Entry = {submissionId:string;card:ServiceCard;cardHash:string;status:'activated';statusAsOf:string;purchase?:{protocol?:string};liveAvailabilityVerified:false;purchaseAdmissionVerified:false;availability:{verified:false;reason:'LIVE_CHECK_REQUIRED'}};
export type PublishedCatalogueMetadata={version:'bazaar.public-catalogue-snapshot/v1';revision:string;asOf:string;publishedAt:string;liveAvailabilityVerified:false;purchaseAdmissionVerified:false};
export function parsePublishedCataloguePage(value:unknown,limit:number){
 const b=value as {services?:Entry[];nextCursor?:unknown;partialResults?:unknown;catalogueSnapshot?:PublishedCatalogueMetadata},s=b?.catalogueSnapshot;
 const iso=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
 if(!s||s.version!=='bazaar.public-catalogue-snapshot/v1'||!/^[a-f0-9]{64}$/.test(s.revision)||!iso(s.asOf)||!iso(s.publishedAt)||Date.parse(s.asOf)>Date.parse(s.publishedAt)||s.liveAvailabilityVerified!==false||s.purchaseAdmissionVerified!==false||!Array.isArray(b.services)||b.services.length>limit||typeof b.partialResults!=='boolean'||b.nextCursor!==null&&(typeof b.nextCursor!=='string'||b.nextCursor.length>512))throw Error('PUBLISHED_CATALOGUE_INVALID');
 for(const e of b.services)if(!e||!e.card||typeof e.card.id!=='string'||typeof e.card.name!=='string'||typeof e.card.description!=='string'||!Array.isArray(e.card.tags)||!Array.isArray(e.card.input)||!e.card.payment||typeof e.card.payment.amount!=='string'||typeof e.card.payment.asset!=='string'||typeof e.submissionId!=='string'||!/^[a-f0-9]{64}$/.test(e.cardHash)||e.status!=='activated'||e.statusAsOf!==s.asOf||e.liveAvailabilityVerified!==false||e.purchaseAdmissionVerified!==false||e.availability?.verified!==false||e.availability.reason!=='LIVE_CHECK_REQUIRED')throw Error('PUBLISHED_CATALOGUE_INVALID');
 return {services:b.services,nextCursor:b.nextCursor as string|null,partialResults:b.partialResults,catalogueSnapshot:s};
}
export function PublishedCatalogueNotice({snapshot}:{snapshot:PublishedCatalogueMetadata}){
 const {language}=useUiLanguage(),es=language==='es';
 return <p role='status' className='ui-notice' data-published-catalogue-notice>{es?'Catálogo publicado · revisión a fecha de ':'Published catalogue · review as of '}<time dateTime={snapshot.asOf}>{snapshot.asOf}</time>{es?'. La disponibilidad se comprueba al preparar el pedido. El precio, el acceso y la capacidad se vuelven a validar antes de comprar.':'. Availability checked when ordering. Price, account access and capacity are revalidated before purchase.'}</p>;
}
function deliveryLabel(card: ServiceCard): string {
  const mode = deliveryStorage(card.delivery).mode;
  if (mode === 'bazaar') return 'Archivos privados alojados en Bazaar';
  if (mode === 'external') return 'Archivos externos alojados por el proveedor';
  return 'Texto';
}
export function MarketCatalog({standalone = false}: {standalone?: boolean}) {
 const {t, language} = useUiLanguage();
  const [services, setServices] = useState<Entry[]>([]), [limit, setLimit] = useState(10), [page, setPage] = useState(0);
  const [next, setNext] = useState<string>(), [busy, setBusy] = useState(true), [error, setError] = useState('');
  const [snapshot,setSnapshot]=useState<PublishedCatalogueMetadata>(),[partial,setPartial]=useState(false);
  const [searchDraft, setSearchDraft] = useState(''), [searchQuery, setSearchQuery] = useState('');
  const generation = useRef(0), controller = useRef<AbortController | null>(null), cursors = useRef<(string | undefined)[]>([undefined]);
  async function load(target = page, size = limit, cursor = cursors.current[target], search = searchQuery) {
    const current = ++generation.current; controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setBusy(true); setError('');
    const timer = setTimeout(() => request.abort(), 15000);
    try {
      const query = new URLSearchParams({limit: String(size)}); if (cursor) query.set('cursor', cursor); if (search) query.set('q', search);
      const response = await fetch(`/api/market/catalog?${query}`, {headers:{'X-Bazaar-Catalogue-View':'published'},cache:'no-store',credentials:'omit',redirect:'error',signal:request.signal});
      const body = await response.json(); if (current !== generation.current) return;
      if(!response.ok)throw Error('PUBLISHED_CATALOGUE_UNAVAILABLE');
      const published=parsePublishedCataloguePage(body,size);
      setServices(published.services);setSnapshot(published.catalogueSnapshot);setNext(published.nextCursor??undefined);setPartial(published.partialResults);setLimit(size);setPage(target);
    } catch { if (current === generation.current) { setServices([]); setSnapshot(undefined); setNext(undefined); setPartial(false); setError('No pudimos comprobar esta página del catálogo. Vuelve a consultar antes de elegir un servicio.'); } }
    finally { clearTimeout(timer); if (current === generation.current) setBusy(false); }
  }
  function search(value: string) {
    const query = value.trim();
    setSearchDraft(query); setSearchQuery(query);setSnapshot(undefined); setServices([]); setNext(undefined); setPage(0); setPartial(false);
    cursors.current = [undefined]; void load(0, limit, undefined, query);
  }
  useEffect(() => { void load(0, 10, undefined); return () => { generation.current++; controller.current?.abort(); }; }, []);
  return <section className={`ui-catalog ${styles.catalog}`} aria-label={t("Catálogo público del mercado")} aria-busy={busy}>
    <SectionHeading headingLevel={standalone ? 1 : 2} eyebrow={t("CATÁLOGO PÚBLICO · STELLAR TESTNET")} title={t("Servicios para tu agente")}><p>{language==='es'?'Explora fichas de una revisión publicada. Tu agente vuelve a comprobar la ficha, el precio y la disponibilidad antes de preparar un pedido.':'Explore cards from a published review. Your agent rechecks the card, price and availability before preparing an order.'}</p></SectionHeading>
    <div className={styles.actions}><ButtonLink href='/hub'><UiText text="Conectar mi agente"/></ButtonLink><ButtonLink href='/publish' variant='secondary'><UiText text="Ofrecer un servicio"/></ButtonLink><button disabled={busy} onClick={() => {cursors.current=[undefined];void load(0,limit,undefined);}}><UiText text="Actualizar esta página"/></button></div>
    <form className={styles.search} role='search' onSubmit={event => { event.preventDefault(); search(searchDraft); }}>
      <label htmlFor='market-catalog-search'><UiText text="Buscar un servicio"/><input id='market-catalog-search' type='search' value={searchDraft} maxLength={200} placeholder={t("Nombre, descripción o etiqueta")} onChange={event => setSearchDraft(event.target.value)}/></label>
      <button type='submit' disabled={busy}><UiText text="Buscar"/></button><button type='button' disabled={!searchDraft && !searchQuery} onClick={() => search('')}><UiText text="Limpiar búsqueda"/></button>
    </form>
    {searchQuery && <p role='status'><UiText text="Resultados para «"/>{searchQuery}{language==='es'?'» en el catálogo publicado.':'» in the published catalogue.'}</p>}
    {!busy&&!error&&snapshot&&<PublishedCatalogueNotice snapshot={snapshot}/>}
    {busy && <p role='status'>{language==='es'?'Cargando el catálogo publicado…':'Loading the published catalogue…'}</p>}{error && <p role='alert'>{t(error)}</p>}
    {partial && <p role='status'><UiText text="Esta página alcanzó su límite de tamaño. Continúa con Siguiente para consultar el resto."/></p>}
    <div className={styles.grid}>{services.map(service => { return <article key={service.submissionId} className={styles.card}><p className={styles.status}>{language==='es'?'Ficha de revisión publicada':'Published reviewed card'}</p><h2><a href={`/resources/${encodeURIComponent(service.card.id)}`}><UiServiceName id={service.card.id} name={service.card.name}/></a></h2><p><UiServiceDescription id={service.card.id} description={service.card.description}/></p><p role='status'><strong>{language==='es'?'Disponibilidad por comprobar al preparar el pedido':'Availability checked when ordering'}</strong></p><p><UiText text="Entrega:"/>{" "}{t(deliveryLabel(service.card))}</p><p className={styles.price}>{service.card.payment.amount} {service.card.payment.asset} <span><UiText text="de Testnet"/></span></p><p>{service.card.tags.join(' · ')}</p><details><summary><UiText text="Ver ficha y condiciones"/></summary><p><UiText text="Referencia:"/>{" "}<code>{service.card.id}</code></p><p>Hash: <code>{service.cardHash}</code></p><p><UiText text="Red:"/>{" "}{service.card.payment.identity?.network}</p><p><UiText text="Emisor:"/>{" "}<code>{service.card.payment.identity?.issuer}</code></p><p><UiText text="Contrato SAC:"/>{" "}<code>{service.card.payment.identity?.sacContract}</code></p><p><UiText text="Protocolo:"/>{" "}{service.purchase?.protocol ?? service.card.payment.marketplace?.protocol}</p><p><UiText text="Entrada:"/>{" "}{service.card.input.map(field => `${field.name} (${field.type}${field.required ? t(", obligatorio") : ''})`).join(', ') || t("Sin parámetros")}</p><pre>{JSON.stringify(service.card, null, 2)}</pre></details><p><UiText text="El agente paga directamente al vendedor. La revisión manual y el pago verificado no certifican la calidad de la entrega."/></p><ButtonLink href={`/resources/${encodeURIComponent(service.card.id)}`} variant='secondary'><UiText text="Ver servicio"/></ButtonLink><ButtonLink href={`/hub?service=${encodeURIComponent(service.card.id)}`} variant='secondary'>{t("Conectar para comprobar la compra")}</ButtonLink></article>; })}</div>
    {!busy && !error && !services.length && <div className='ui-empty'><h2>{searchQuery ? t("No encontramos servicios para esta búsqueda") : (language==='es'?'No hay fichas publicadas en esta página':'No published cards on this page')}</h2><p>{searchQuery ? t("Prueba otro nombre o etiqueta, o limpia la búsqueda para consultar el catálogo completo.") : t("Las fichas aparecen después de verificar el control del endpoint y completar la revisión.")}</p></div>}
    <nav className={styles.pager} aria-label={t("Páginas del catálogo")}><label><UiText text="Servicios por página"/><select value={limit} disabled={busy} onChange={e => { cursors.current = [undefined]; void load(0, Number(e.target.value), undefined); }}><option value={10}>10</option><option value={20}>20</option></select></label><button disabled={busy || page === 0} onClick={() => void load(page - 1)}><UiText text="Anterior"/></button><span><UiText text="Página"/>{" "}{page + 1}</span><button disabled={busy || !next} onClick={() => { cursors.current[page + 1] = next; void load(page + 1); }}><UiText text="Siguiente"/></button></nav>
  </section>;
}
