"use client";
import { Button, SectionHeading } from "@/components/ui";
import {ServiceCard} from "@/components/ui/ServiceCard";
import { useEffect, useMemo, useState } from "react";
import { services } from "@/lib/catalog";
import { filterServices, rankServices } from "@/lib/discovery";
import type { PaymentScheme, ServiceKind } from "@/lib/types";

export function Catalog() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | ServiceKind>("all");
  const [scheme, setScheme] = useState<"all" | PaymentScheme>("all");
  const [maxPrice, setMaxPrice] = useState("");
  const [highlightedServiceId, setHighlightedServiceId] = useState<string | null>(null);
  const [agentToast, setAgentToast] = useState<string | null>(null);

  // Listen for WebMCP events dispatched by in-browser AI agents
  useEffect(() => {
    const handleWebMCPUIAction = (e: Event) => {
      const customEvent = e as CustomEvent<{
        action: string;
        query?: string;
        tag?: string;
        serviceId?: string;
        serviceName?: string;
      }>;
      const detail = customEvent.detail;
      if (!detail) return;

      if (detail.action === "filter_services" && detail.query !== undefined) {
        setQuery(detail.query);
        setAgentToast(`🤖 Agent searched: "${detail.query || detail.tag || "all"}"`);
        setTimeout(() => setAgentToast(null), 3500);
      } else if (detail.action === "highlight_service" && detail.serviceId) {
        setHighlightedServiceId(detail.serviceId);
        setAgentToast(`🤖 Agent inspected service: "${detail.serviceId}"`);
        setTimeout(() => {
          setHighlightedServiceId(null);
          setAgentToast(null);
        }, 4000);

        // Smooth scroll to card
        const el = document.getElementById(`service-card-${detail.serviceId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } else if (detail.action === "service_published") {
        setAgentToast(`✨ AI Agent published new service: "${detail.serviceName}"!`);
        setTimeout(() => setAgentToast(null), 4000);
      }
    };

    window.addEventListener("webmcp-ui-action", handleWebMCPUIAction);
    return () => {
      window.removeEventListener("webmcp-ui-action", handleWebMCPUIAction);
    };
  }, []);

  const results = useMemo(() => {
    const filtered = filterServices(services, {
      kind: kind === "all" ? undefined : kind,
      scheme: scheme === "all" ? undefined : scheme,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
    });
    return rankServices(filtered, query);
  }, [query, kind, scheme, maxPrice]);

  function resetFilters() { setQuery(""); setKind("all"); setScheme("all"); setMaxPrice(""); }
  return <section className="ui-catalog" aria-label="Servicios del mercado">
    {agentToast && <p className="ui-notice" role="status">{agentToast}</p>}
    <SectionHeading eyebrow="SERVICIOS LISTADOS · STELLAR TESTNET" title="Encuentra lo que tu agente necesita"><p role="status">{results.length} {results.length === 1 ? "resultado" : "resultados"}</p></SectionHeading>
    <div className="ui-chips" aria-label="Filtros rápidos">
      <button type="button" className="ui-chip" onClick={resetFilters} aria-pressed={!query && kind === "all" && scheme === "all" && !maxPrice}>Todos</button>
      <button type="button" className="ui-chip" onClick={() => {setQuery("video");setKind("all");}} aria-pressed={query === "video"}>Guiones de video</button>
      <button type="button" className="ui-chip" onClick={() => {setQuery("swap");setKind("all");}} aria-pressed={query === "swap"}>Sandbox de pagos</button>
    </div>
    <form className="ui-filter-grid" onSubmit={e => e.preventDefault()} {...({toolname:"bazaar_catalog_filter_form",tooldescription:"Filtrar y buscar servicios del catálogo de Stellar Bazaar"} as Record<string,unknown>)}>
      <label>Buscar servicio<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Guiones, video, swap…" {...({toolparamdescription:"Palabras clave de búsqueda"} as Record<string,unknown>)} /></label>
      <label>Tipo<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="all">Todos</option><option value="http">HTTP x402</option><option value="mcp">MCP</option></select></label>
      <label>Esquema<select value={scheme} onChange={e=>setScheme(e.target.value as typeof scheme)}><option value="all">Todos</option><option value="exact">exact</option><option value="upto">upto</option></select></label>
      <label>Precio máximo<input type="number" min="0" step="0.001" value={maxPrice} onChange={e=>setMaxPrice(e.target.value)} placeholder="USDC de Testnet" {...({toolparamdescription:"Precio máximo del servicio"} as Record<string,unknown>)} /></label>
    </form>
    <p className="ui-notice">El precio y las condiciones son declarados por el proveedor. Estar listado no acredita una compra ni garantiza disponibilidad. Tu agente debe comprobarlos antes de pagar.</p>
    <div className="ui-grid">{results.map(result => <ServiceCard key={result.service.id} {...result} showScore={Boolean(query)} highlighted={highlightedServiceId === result.service.id} onTag={setQuery} />)}</div>
    {!results.length && <div className="ui-empty"><h3>No encontramos servicios</h3><p>Prueba otras palabras o restablece los filtros.</p><Button variant="secondary" onClick={resetFilters}>Restablecer filtros</Button></div>}
  </section>;
}
