"use client";
import Link from "next/link";
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

  return (
    <section className="catalog" id="catalogo">
      {/* Live AI Agent Toast Indicator */}
      {agentToast && (
        <div
          style={{
            position: "sticky",
            top: "16px",
            zIndex: 900,
            backgroundColor: "#030712",
            border: "1px solid #38bdf8",
            boxShadow: "0 0 20px rgba(56, 189, 248, 0.3)",
            color: "#38bdf8",
            padding: "8px 16px",
            borderRadius: "20px",
            fontSize: "12px",
            fontWeight: "bold",
            fontFamily: "monospace",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "16px",
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "#38bdf8",
              boxShadow: "0 0 8px #38bdf8",
            }}
          />
          {agentToast}
        </div>
      )}

      <div className="section-heading">
        <div>
          <span className="kicker">DISCOVERY DETERMINISTA · SERVICIOS VALIDADOS EN STELLAR TESTNET</span>
          <h2>Busca por intención y verifica por qué.</h2>
        </div>
        <p>{results.length} resultados · lexical-v1</p>
      </div>

      {/* Quick Filter Chips for 1-tap mobile navigation */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          overflowX: "auto",
          paddingBottom: "8px",
          marginBottom: "12px",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setKind("all");
            setScheme("all");
            setMaxPrice("");
          }}
          style={{
            padding: "6px 14px",
            borderRadius: "20px",
            fontSize: "0.82rem",
            fontWeight: 600,
            whiteSpace: "nowrap",
            cursor: "pointer",
            border: !query && kind === "all" ? "1px solid #7057e8" : "1px solid rgba(255,255,255,0.1)",
            background: !query && kind === "all" ? "rgba(112, 87, 232, 0.25)" : "rgba(255,255,255,0.04)",
            color: !query && kind === "all" ? "#c4b5fd" : "#94a3b8",
            transition: "all 0.15s ease",
          }}
        >
          ✨ Todos
        </button>
        <button
          type="button"
          onClick={() => {
            setQuery("video");
            setKind("all");
          }}
          style={{
            padding: "6px 14px",
            borderRadius: "20px",
            fontSize: "0.82rem",
            fontWeight: 600,
            whiteSpace: "nowrap",
            cursor: "pointer",
            border: query === "video" ? "1px solid #7057e8" : "1px solid rgba(255,255,255,0.1)",
            background: query === "video" ? "rgba(112, 87, 232, 0.25)" : "rgba(255,255,255,0.04)",
            color: query === "video" ? "#c4b5fd" : "#94a3b8",
            transition: "all 0.15s ease",
          }}
        >
          🎬 AI Video Script
        </button>
        <button
          type="button"
          onClick={() => {
            setQuery("swap");
            setKind("all");
          }}
          style={{
            padding: "6px 14px",
            borderRadius: "20px",
            fontSize: "0.82rem",
            fontWeight: 600,
            whiteSpace: "nowrap",
            cursor: "pointer",
            border: query === "swap" ? "1px solid #7057e8" : "1px solid rgba(255,255,255,0.1)",
            background: query === "swap" ? "rgba(112, 87, 232, 0.25)" : "rgba(255,255,255,0.04)",
            color: query === "swap" ? "#c4b5fd" : "#94a3b8",
            transition: "all 0.15s ease",
          }}
        >
          🧪 Sandbox Quote (0.001 USDC)
        </button>
        <button
          type="button"
          onClick={() => {
            setKind(kind === "http" ? "all" : "http");
          }}
          style={{
            padding: "6px 14px",
            borderRadius: "20px",
            fontSize: "0.82rem",
            fontWeight: 600,
            whiteSpace: "nowrap",
            cursor: "pointer",
            border: kind === "http" ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.1)",
            background: kind === "http" ? "rgba(56, 189, 248, 0.2)" : "rgba(255,255,255,0.04)",
            color: kind === "http" ? "#38bdf8" : "#94a3b8",
            transition: "all 0.15s ease",
          }}
        >
          ⚡ HTTP x402
        </button>
        <button
          type="button"
          onClick={() => {
            setKind(kind === "mcp" ? "all" : "mcp");
          }}
          style={{
            padding: "6px 14px",
            borderRadius: "20px",
            fontSize: "0.82rem",
            fontWeight: 600,
            whiteSpace: "nowrap",
            cursor: "pointer",
            border: kind === "mcp" ? "1px solid #a855f7" : "1px solid rgba(255,255,255,0.1)",
            background: kind === "mcp" ? "rgba(168, 85, 247, 0.2)" : "rgba(255,255,255,0.04)",
            color: kind === "mcp" ? "#c084fc" : "#94a3b8",
            transition: "all 0.15s ease",
          }}
        >
          🤖 MCP Native
        </button>
      </div>

      {/* Declarative W3C WebMCP Form Annotations */}
      <form
        className="search-row"
        onSubmit={(e) => e.preventDefault()}
        {...({
          toolname: "bazaar_catalog_filter_form",
          tooldescription: "Filtrar y buscar servicios del catálogo de Stellar Bazaar",
        } as Record<string, unknown>)}
      >
        <label className="search-box">
          <span>⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por intención, prompt o tecnología…"
            {...({ toolparamdescription: "Palabras clave de búsqueda" } as Record<string, unknown>)}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                padding: "0 8px",
                fontSize: "1rem",
              }}
            >
              ✕
            </button>
          )}
        </label>
        <select className="filter-select" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="all">Tipo: Todos</option>
          <option value="http">HTTP x402</option>
          <option value="mcp">MCP Protocol</option>
        </select>
        <select className="filter-select" value={scheme} onChange={(e) => setScheme(e.target.value as typeof scheme)}>
          <option value="all">Esquema: Todos</option>
          <option value="exact">exact</option>
          <option value="upto">upto</option>
        </select>
        <input
          className="filter-select max"
          type="number"
          min="0"
          step="0.001"
          placeholder="Precio máx."
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          {...({ toolparamdescription: "Precio máximo del servicio" } as Record<string, unknown>)}
        />
      </form>

      <div className="ranking-note">
        <strong>Discovery determinista:</strong> ranking explicable por tokens y tags. Ejecución nativa x402 con liquidación instantánea en Stellar Testnet.
      </div>

      <div className="card-grid">
        {results.map(({ service, score, reasons }) => {
          const isHighlighted = highlightedServiceId === service.id;
          return (
            <Link
              id={`service-card-${service.id}`}
              className={`service-card ${service.accent}`}
              href={`/resources/${service.id}`}
              key={service.id}
              style={
                isHighlighted
                  ? {
                      outline: "2px solid #38bdf8",
                      boxShadow: "0 0 24px rgba(56, 189, 248, 0.45)",
                      transform: "scale(1.02)",
                      transition: "all 0.3s ease",
                    }
                  : { transition: "all 0.3s ease" }
              }
            >
              <div className="card-top">
                <span className="service-icon">{service.kind === "mcp" ? "M" : "↗"}</span>
                <span className="type-pill">{service.kind.toUpperCase()}</span>
              </div>
              <p className="eyebrow">{service.eyebrow}</p>
              <h3>{service.name}</h3>
              <p>{service.description}</p>
              {query && (
                <div className="score-box">
                  <strong>Score {score}</strong>
                  <span>{reasons.slice(0, 2).join(" · ")}</span>
                </div>
              )}
              <div className="tag-row">
                {service.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setQuery(tag);
                    }}
                    style={{ cursor: "pointer" }}
                    title={`Filtrar por ${tag}`}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
              <div className="price-row">
                <strong>
                  {service.payment.amount} {service.payment.asset}
                </strong>
                <span>
                  {service.payment.scheme === "exact"
                    ? "x402 exact · liquidación Testnet en vivo"
                    : `${service.payment.scheme} · liquidación Testnet`}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      {!results.length && <div className="empty">Sin coincidencias verificables. Ajusta intención o filtros.</div>}
    </section>
  );
}
