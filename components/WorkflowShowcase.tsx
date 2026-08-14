"use client";

import Link from "next/link";
import {useRef, useState} from "react";

type Workflow = {
  id: string;
  number: string;
  eyebrow: string;
  titleEs: string;
  titleEn: string;
  summaryEs: string;
  summaryEn: string;
  model: "sync" | "async job" | "bundle";
  stages: Array<{es: string; en: string}>;
  deliverables: Array<{es: string; en: string}>;
  validation: string;
};

const workflows: Workflow[] = [
  {
    id: "brand-identity-studio",
    number: "01",
    eyebrow: "PAQUETE / BUNDLE",
    titleEs: "Estudio de identidad de marca",
    titleEn: "Brand Identity Studio",
    summaryEs: "Compone investigación, brief y dirección visual alrededor de un objetivo común.",
    summaryEn: "Composes research, a brief, and visual direction around one shared objective.",
    model: "bundle",
    stages: [
      {es: "Estrategia e investigación", en: "Strategy and research"},
      {es: "Brief bilingüe versionado", en: "Versioned bilingual brief"},
      {es: "Aprobación opcional del buyer", en: "Optional buyer approval"},
      {es: "Identidad visual, logo y portada", en: "Visual identity, logo, and cover"}
    ],
    deliverables: [
      {es: "Informe de fuentes y posicionamiento", en: "Sources and positioning report"},
      {es: "Brief y manifest de handoff", en: "Brief and handoff manifest"},
      {es: "Propuestas visuales referenciadas", en: "Referenced visual proposals"}
    ],
    validation: "Design backlog only / Solo diseño futuro"
  },
  {
    id: "website-intelligence",
    number: "02",
    eyebrow: "CAPACIDAD / CAPABILITY",
    titleEs: "Inteligencia de sitios web",
    titleEn: "Website Intelligence",
    summaryEs: "Preview de extracción estructurada y señales observables de un sitio permitido.",
    summaryEn: "Preview of structured extraction and observable signals from an allowed website.",
    model: "sync",
    stages: [
      {es: "Validar origen permitido", en: "Validate allowed origin"},
      {es: "Extraer campos declarados", en: "Extract declared fields"},
      {es: "Entregar evidencia estructurada", en: "Return structured evidence"}
    ],
    deliverables: [{es: "Snapshot estructurado con fuentes", en: "Structured snapshot with sources"}],
    validation: "Fixture · Endpoint not verified / Endpoint no verificado"
  },
  {
    id: "campaign-creator",
    number: "03",
    eyebrow: "CAPACIDAD / CAPABILITY",
    titleEs: "Creador de campañas",
    titleEn: "Campaign Creator",
    summaryEs: "Preview de un flujo que transforma un brief aprobado en piezas de campaña.",
    summaryEn: "Preview of a flow that turns an approved brief into campaign assets.",
    model: "async job",
    stages: [
      {es: "Inspeccionar brief", en: "Inspect brief"},
      {es: "Generar variantes", en: "Generate variants"},
      {es: "Entregar artifact manifest", en: "Return artifact manifest"}
    ],
    deliverables: [{es: "Copys y conceptos de campaña", en: "Campaign copy and concepts"}],
    validation: "Pilot fixture · Not indexed / Fixture piloto · No indexado"
  },
  {
    id: "video-repurpose",
    number: "04",
    eyebrow: "ASYNC JOB / TRABAJO ASÍNCRONO",
    titleEs: "Adaptación de video",
    titleEn: "Video Repurpose",
    summaryEs: "Preview async con jobId, estados y artifacts; no representa una ejecución pasada.",
    summaryEn: "Async preview with jobId, statuses, and artifacts; it is not a past execution.",
    model: "async job",
    stages: [
      {es: "Aceptar manifest de entrada", en: "Accept input manifest"},
      {es: "Reportar estado del job", en: "Report job status"},
      {es: "Publicar artifacts finales", en: "Publish final artifacts"}
    ],
    deliverables: [{es: "Clips, captions y manifest", en: "Clips, captions, and manifest"}],
    validation: "Placeholder · No runtime / Placeholder · Sin runtime"
  },
  {
    id: "research-scout",
    number: "05",
    eyebrow: "CAPACIDAD / CAPABILITY",
    titleEs: "Explorador de investigación",
    titleEn: "Research Scout",
    summaryEs: "Preview de búsqueda con provenance, criterios y límites visibles.",
    summaryEn: "Preview of research with visible provenance, criteria, and limits.",
    model: "sync",
    stages: [
      {es: "Interpretar objetivo declarado", en: "Interpret declared objective"},
      {es: "Reunir fuentes permitidas", en: "Collect allowed sources"},
      {es: "Normalizar hallazgos", en: "Normalize findings"}
    ],
    deliverables: [{es: "Resumen estructurado y citas", en: "Structured brief and citations"}],
    validation: "Fixture · Evaluation pending / Fixture · Evaluación pendiente"
  }
];

const timeline = [
  ["AHORA / NOW", "Vitrina transparente", "Transparent showcase", "Fixtures y estados visibles; ninguna tarjeta prueba uso, pago o reputación.", "Fixtures and visible states; no card proves use, payment, or reputation."],
  ["SIGUIENTE / NEXT", "Schemas de handoff", "Handoff schemas", "Versionar stages, artifacts, approval gates y errores deterministas.", "Version stages, artifacts, approval gates, and deterministic errors."],
  ["DESPUÉS / LATER", "Validación aislada", "Isolated validation", "Probar una composición local sin pago antes de considerar Testnet.", "Test one unpaid local composition before considering Testnet."]
];

export function WorkflowShowcase(){
  const dialogRef=useRef<HTMLDialogElement>(null);
  const openerRef=useRef<HTMLButtonElement|null>(null);
  const [selected,setSelected]=useState<Workflow>(workflows[0]);

  function openWorkflow(workflow:Workflow,opener:HTMLButtonElement){
    setSelected(workflow);
    openerRef.current=opener;
    dialogRef.current?.showModal();
  }

  function closeWorkflow(){dialogRef.current?.close();requestAnimationFrame(()=>openerRef.current?.focus())}

  return <>
    <section className="workflow-showcase shell" id="workflows" aria-labelledby="workflow-showcase-title">
      <div className="workflow-showcase-head">
        <div>
          <span className="kicker">VITRINA DE POSIBILIDADES · TRANSPARENT DEMOS</span>
          <h2 id="workflow-showcase-title">Explora workflows.<br/><em>Explore workflows.</em></h2>
        </div>
        <p>Ejemplos estáticos para entender qué podrían coordinar service cards verificadas. No son ejecuciones, compras ni historial de producto.<br/><span>Static examples of what verified service cards could coordinate. They are not executions, purchases, or product history.</span></p>
      </div>
      <div className="workflow-grid">
        {workflows.map(workflow=><button className="workflow-card" type="button" key={workflow.id} onClick={event=>openWorkflow(workflow,event.currentTarget)} aria-haspopup="dialog">
          <div className="workflow-card-top"><span>{workflow.number}</span><small>DEMO · PILOT · NOT INDEXED</small></div>
          <span className="workflow-eyebrow">{workflow.eyebrow}</span>
          <h3>{workflow.titleEs}</h3>
          <h4>{workflow.titleEn}</h4>
          <p>{workflow.summaryEs}<br/><span>{workflow.summaryEn}</span></p>
          <div className="workflow-card-foot"><code>{workflow.model}</code><strong>Ver etapas / View stages →</strong></div>
        </button>)}
      </div>
      <div className="showcase-disclaimer" role="note"><strong>Estado / Status:</strong> placeholder local y roadmap. Bazaar no ejecuta este paquete, no contrata agentes y no custodia pagos. / Local placeholder and roadmap. Bazaar does not execute this bundle, hire agents, or custody payments.</div>
    </section>

    <section className="exploration-timeline" aria-labelledby="exploration-title">
      <div className="shell">
        <div className="timeline-head"><span className="kicker">ROADMAP · NO ACTIVITY CLAIMS</span><h2 id="exploration-title">Lo que estamos explorando.<br/><em>What we are exploring.</em></h2></div>
        <ol>{timeline.map(([label,titleEs,titleEn,copyEs,copyEn])=><li key={label}>
          <span>{label}</span><div><h3>{titleEs}</h3><h4>{titleEn}</h4><p>{copyEs}<br/><small>{copyEn}</small></p></div>
        </li>)}</ol>
        <div className="timeline-actions"><a className="ghost" href="#catalogo">Explorar catálogo / Browse catalogue</a><Link className="primary" href="/publish">Publica tu servicio / Publish a service</Link></div>
      </div>
    </section>

    <dialog ref={dialogRef} className="workflow-dialog" aria-labelledby="workflow-dialog-title" onClick={event=>{if(event.target===event.currentTarget)closeWorkflow()}} onCancel={event=>{event.preventDefault();closeWorkflow()}} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();closeWorkflow()}}}>
      <div className="workflow-dialog-panel">
        <div className="workflow-dialog-top"><span>DEMO · PLACEHOLDER · PILOT · NOT INDEXED</span><button type="button" onClick={closeWorkflow} aria-label="Cerrar detalle / Close details">×</button></div>
        <span className="workflow-eyebrow">{selected.eyebrow}</span>
        <h2 id="workflow-dialog-title">{selected.titleEs}</h2>
        <h3>{selected.titleEn}</h3>
        <p>{selected.summaryEs}<br/><span>{selected.summaryEn}</span></p>
        <div className="workflow-dialog-grid">
          <section><h4>Etapas / Stages</h4><ol>{selected.stages.map((stage,index)=><li key={stage.es}><b>{String(index+1).padStart(2,"0")}</b><span>{stage.es}<small>{stage.en}</small></span></li>)}</ol></section>
          <section><h4>Entregables / Deliverables</h4><ul>{selected.deliverables.map(item=><li key={item.es}>{item.es}<small>{item.en}</small></li>)}</ul><h4>Validación / Validation</h4><div className="validation-state">{selected.validation}</div><p className="dialog-policy">Precio agregado: no cotizado. Pago: no activo.<br/><span>Aggregate price: not quoted. Payment: not active.</span></p></section>
        </div>
        <div className="workflow-dialog-actions"><button type="button" className="ghost" onClick={closeWorkflow}>Cerrar / Close</button><Link className="primary" href="/publish">Abrir Publisher Kit</Link></div>
      </div>
    </dialog>
  </>;
}
