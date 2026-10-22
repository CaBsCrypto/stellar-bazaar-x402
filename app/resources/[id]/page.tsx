import { paymentLabel } from "@/lib/payment-options";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Footer } from "@/components/Footer";
import { LandingConnect } from "@/components/LandingConnect";
import { ServicePortfolioSample } from "@/components/ServicePortfolioSample";
import { ServicePortfolioTools } from "@/components/ServicePortfolioTools";
import { ServiceShare } from "@/components/ServiceShare";
import { ServicePurchaseEntry } from "@/components/ServicePurchaseEntry";
import { Pill } from "@/components/ui";
import { readDynamicServiceCards } from "@/lib/dynamic-registry";
import { toPaidService } from "@/lib/service-card";
import { parseServiceCardShape } from "@/lib/service-card-schema";
import { getService, services } from "@/lib/catalog";
import { getServicePortfolio } from "@/lib/service-portfolio";
import { measuredRead } from "@/lib/acceptance-meter";
import { isCanonicalUsdcTestnet } from "@/lib/payment-assets";
import type { ServiceCard } from "@/lib/types";
import {assertMarketEnabled,marketServiceSnapshot} from '@/lib/marketplace';
import {deliveryStorage} from '@/lib/delivery-contract';
import {demoConfiguration} from '@/lib/demo-configuration';
import {isOnDemandTextService} from '@/lib/market-text-seller-runtime';
import "../../history/deliveries.css";
import "../portfolio.css";
export const dynamic = "force-dynamic";
export function generateStaticParams() { return services.map(({id})=>({id})); }
export default async function ResourcePage({params}: {params: Promise<{id:string}>}) {
 const {id}=await params; const marketEnabled=process.env.BAZAAR_ENABLE_MARKETPLACE==='true'; let service=marketEnabled?undefined:getService(id); let partialRegistry=false; let marketCard: ServiceCard | undefined; let marketAvailable=false; let availabilityLabel='Disponibilidad sin comprobar'; let cardHash:string|undefined; let leaseExpiresAt:string|undefined;let onDemand=false;
 if(marketEnabled){
  assertMarketEnabled();
  const snapshot=await measuredRead(marketServiceSnapshot),record=snapshot.records.find(r=>r.active&&!r.service.withdrawn&&r.service.card.id===id);
  if(!record)notFound();marketCard=record.service.card;cardHash=record.service.cardHash;
  const storage=deliveryStorage(marketCard.delivery),output=storage.mode==='text'?'Texto en tu historial privado':storage.mode==='external'?'Enlaces externos declarados por el proveedor':'Archivos privados en Bazaar';
  service={...toPaidService(marketCard),latency:'No declarada',output:[output,`Tipo de contenido: ${marketCard.delivery?.result.contentType ?? 'No declarado'}`]};
  const purchases=process.env.VERCEL==='1'?demoConfiguration().features.purchases.enabled:process.env.BAZAAR_ENABLE_MARKET_PURCHASES==='true'&&process.env.BAZAAR_X402_MARKETPLACE_ENABLED==='true';
  const leaseLive=!!record.availability?.leaseExpiresAt&&Date.parse(record.availability.leaseExpiresAt)>Date.now();
  leaseExpiresAt=record.availability?.leaseExpiresAt;
  try{onDemand=isOnDemandTextService(record.service);}catch{}
  marketAvailable=purchases&&!snapshot.paused&&(onDemand||!!record.availability?.ready&&leaseLive);
  availabilityLabel=!purchases||snapshot.paused?'Compras pausadas':record.availability?.reason==='SELLER_CAPACITY_EXHAUSTED'?'Vendedor sin capacidad disponible':marketAvailable?'Vendedor disponible':'Vendedor no disponible: falta una confirmación vigente de capacidad';
 } else if (!service) {
  const registry=await measuredRead(() => readDynamicServiceCards());
  const found=registry.entries.find(entry=>entry.id===id);
  if (!registry.available && !found) return <main><Navbar/><section className="shell portfolio-page" role="status"><h1>No se pudo consultar el registro</h1><p>No podemos confirmar los datos de este servicio en este momento. Vuelve a cargar la página para reintentar o regresa al catálogo.</p><a href="/catalogo">Volver al catálogo</a></section><Footer/></main>;
  partialRegistry=!registry.available;
  if (found) { const parsed=parseServiceCardShape(found.card); if (!parsed.ok) throw new Error("DISCOVERY_INVALID_RESPONSE"); marketCard=parsed.card; service={...toPaidService(parsed.card), latency:"No declarada", output:parsed.card.delivery?.result.contentType === 'text/plain' ? ["Entrega de texto reportada por el agente vendedor"] : ["Formato no declarado en la ficha"]}; }
 }
 if(!service) notFound();
 const portfolio=getServicePortfolio(id);
 const privatePurchase = process.env.BAZAAR_ENABLE_MARKETPLACE === 'true' && marketCard?.payment.asset === 'USDC' && isCanonicalUsdcTestnet(marketCard.payment.identity);
  return <main><Navbar/><div className="shell portfolio-page"><Breadcrumbs items={[{label:"Catálogo",href:"/catalogo"},{label:service.name}]} backHref="/catalogo" backLabel="← Volver al Catálogo"/>
  {partialRegistry && <p className="ui-notice" role="status">Registro parcial: esta ficha está disponible, pero no se pudo comprobar todo el catálogo.</p>}
 <header className="portfolio-header"><Pill tone="info">{id === "swap-risk-quote" ? "Sandbox · datos de ejemplo" : "Listado en Testnet"}</Pill><p className="kicker">{service.provider}</p><h1>{service.name}</h1><p className="portfolio-lead">{portfolio?.intro ?? service.description}</p></header>
 <div className="portfolio-layout"><section className="portfolio-showcase" aria-label="Muestra del servicio"><div className="portfolio-showcase-intro">{portfolio && <span className="ui-pill ui-pill--warning">Ejemplo ilustrativo de Bazaar</span>}</div>{portfolio ? <ServicePortfolioSample sample={portfolio.sample}/> : <p className="ui-empty">Muestra aún no disponible. Consulta los formatos declarados antes de conectar tu agente.</p>}</section>
 <aside className="portfolio-summary ui-card"><span className="kicker">QUÉ PUEDES RECIBIR</span><h2>{id === "swap-risk-quote" ? "Indicadores para una prueba" : id === "ai-video-scriptwriter" ? "Un guion para tu próxima idea" : "Formatos declarados"}</h2><ul>{(portfolio?.receives ?? service.output).map(item=><li key={item}>{item}</li>)}</ul><p className="portfolio-limit">{portfolio?.limitation ?? "La disponibilidad y el formato deben comprobarse con el proveedor."}</p><div className="portfolio-price"><span>Precio declarado</span><strong>{paymentLabel(service)}</strong><small>Stellar Testnet · por solicitud</small>{service.paymentOptions && <small>{id === "swap-risk-quote" ? "Precios independientes · piloto local USDC/XLM validado en Testnet" : "Precios independientes declarados por el proveedor"}</small>}</div>{privatePurchase ? <ServicePurchaseEntry serviceId={id} available={marketAvailable} leaseExpiresAt={leaseExpiresAt} unavailableReason={availabilityLabel} onDemand={onDemand}/> : <><LandingConnect/><p className="portfolio-fine">Abre la conexión general. No selecciona ni compra este servicio. Tu agente debe comprobar las condiciones actuales.</p></>}{marketEnabled && <ServiceShare serviceId={id} serviceName={service.name}/>}</aside></div>
 {portfolio && <section className="portfolio-how"><span className="kicker">ASÍ SERÍA EL RECORRIDO</span><h2>De tu solicitud a la entrega</h2><p className="ui-muted">Explicación del flujo, no actividad en curso.</p><ol>{portfolio.steps.map((step,index)=><li key={step}><span className="portfolio-step-number">0{index+1}</span><h3>{["Tu solicitud","Trabajo del servicio","Entrega"][index]}</h3><p>{step}</p></li>)}</ol></section>}
 <details className="portfolio-technical"><summary>Detalles técnicos e integración</summary><dl><div><dt>Red declarada</dt><dd>{service.network}</dd></div><div><dt>Esquema</dt><dd>{service.payment.scheme}</dd></div><div><dt>Latencia declarada · no garantizada</dt><dd>{service.latency}</dd></div></dl>{cardHash && <><h3>Versión revisada · hash de la ficha</h3><pre>{cardHash}</pre></>}{marketCard?.payment.identity && <><h3>Emisor del activo {marketCard.payment.asset}</h3><pre>{marketCard.payment.identity.issuer}</pre><h3>Contrato SAC</h3><pre>{marketCard.payment.identity.sacContract}</pre></>}<h3>Destinatario declarado</h3><pre>{service.payment.destination}</pre><h3>Ruta declarada</h3><pre>{service.routeTemplate}</pre><div className="portfolio-io"><section><h3>Entradas</h3><ul>{service.input.map(field=><li key={field}><code>{field}</code></li>)}</ul></section><section><h3>Salidas declaradas</h3><ul>{service.output.map(field=><li key={field}><code>{field}</code></li>)}</ul></section></div><p>Condiciones declaradas por el proveedor. Estar listado no acredita una compra ni garantiza disponibilidad.</p></details>
 {id === "swap-risk-quote" && <ServicePortfolioTools service={service}/>}
 </div><Footer/></main>;
}
