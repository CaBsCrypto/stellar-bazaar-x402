"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { services } from "@/lib/catalog";
import type { ServiceKind } from "@/lib/types";

type KindFilter = "all" | ServiceKind;

export function Catalog() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return services.filter((service) => {
      const matchesKind = kind === "all" || service.kind === kind;
      const haystack = [service.name, service.description, service.provider, ...service.tags].join(" ").toLowerCase();
      return matchesKind && (!needle || haystack.includes(needle));
    });
  }, [query, kind]);

  return (
    <section className="catalog" id="catalogo">
      <div className="section-heading">
        <div>
          <span className="kicker">CATÁLOGO MVP · 1 ENDPOINT LOCAL + 3 FIXTURES</span>
          <h2>Busca por intención, no por URL.</h2>
        </div>
        <p>{results.length} recursos visibles · ranking local no evaluado aún</p>
      </div>
      <div className="search-row">
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej. riesgo de un swap, actividad de ledger…" />
        </label>
        <div className="segmented" aria-label="Filtrar por tipo">
          {(["all", "http", "mcp"] as KindFilter[]).map((value) => (
            <button key={value} className={kind === value ? "active" : ""} onClick={() => setKind(value)}>
              {value === "all" ? "Todos" : value.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="card-grid">
        {results.map((service) => (
          <Link className={`service-card ${service.accent}`} href={`/resources/${service.id}`} key={service.id}>
            <div className="card-top">
              <span className="service-icon">{service.kind === "mcp" ? "M" : "↗"}</span>
              <span className="type-pill">{service.kind.toUpperCase()}</span>
            </div>
            <p className="eyebrow">{service.eyebrow}</p>
            <h3>{service.name}</h3>
            <p>{service.description}</p>
            <div className="tag-row">{service.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
            <div className="price-row">
              <strong>{service.payment.amount} {service.payment.asset}</strong>
              <span>{service.id === "swap-risk-quote" ? "precio futuro · llamada local gratis" : `${service.payment.scheme} · fixture`}</span>
            </div>
          </Link>
        ))}
      </div>
      {results.length === 0 && <div className="empty">No hay fixtures para esa búsqueda. Prueba “risk”, “ledger” o “MCP”.</div>}
    </section>
  );
}
