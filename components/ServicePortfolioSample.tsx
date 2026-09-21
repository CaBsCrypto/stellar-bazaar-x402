"use client";
import { useState } from "react";
import type { getServicePortfolio } from "@/lib/service-portfolio";
import { DeliverableViewer } from "./DeliverableViewer";
export function ServicePortfolioSample({sample}: {sample: NonNullable<ReturnType<typeof getServicePortfolio>>["sample"]}) {
  const [selected,setSelected]=useState("risk");
  if(sample.kind === "script") return <div className="portfolio-script"><h3>{sample.saved.manifest.title}</h3><DeliverableViewer saved={sample.saved} publicExample access={async()=>{throw new Error("Public sample has no attachments");}} onDownload={()=>{}} /></div>;
  const result=sample.result;
  const indicators=[
    {id:"risk",label:"Riesgo de ruta",value:({low:"Bajo",moderate:"Moderado",elevated:"Elevado"})[result.routeRisk],detail:"Categoría calculada por la referencia determinista para este ejemplo. No evalúa el mercado actual."},
    {id:"impact",label:"Impacto de precio",value:`${result.priceImpactPct} %`,detail:"Porcentaje producido por la fórmula de demostración a partir del par, monto y lado. No es una cotización ejecutable."},
    {id:"liquidity",label:"Banda de liquidez",value:({deep:"Profunda",standard:"Estándar",thin:"Limitada"})[result.liquidityBand],detail:"La referencia asigna una categoría al par. No representa profundidad de mercado medida en tiempo real."},
  ];
  const active=indicators.find(item=>item.id===selected)!;
  return <div className="portfolio-risk"><div className="portfolio-sample-heading"><span className="kicker">CONSULTA DE EJEMPLO</span><h3>{result.pair}</h3><p>Monto nocional: {result.amount.toLocaleString("es")} · Compra</p></div><div className="portfolio-indicators">{indicators.map(item=><button key={item.id} aria-pressed={selected===item.id} onClick={()=>setSelected(item.id)}><span>{item.label}</span><strong>{item.value}</strong><small>Explorar indicador →</small></button>)}</div><section className="portfolio-explanation" aria-live="polite"><h4>{active.label}</h4><p>{active.detail}</p></section><details><summary>Ver datos de esta muestra</summary><pre>{JSON.stringify(result,null,2)}</pre></details></div>;
}
