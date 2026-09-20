"use client";

import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
}

export function Breadcrumbs({
  items,
  backHref = "/catalogo",
  backLabel = "← Volver al Catálogo",
  actions,
}: BreadcrumbsProps) {
  return (
    <nav
      aria-label="Navegación secundaria"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "12px",
        padding: "12px 0",
        marginBottom: "1.5rem",
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        {backHref && (
          <Link
            href={backHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "8px",
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#cbd5e1",
              fontSize: "0.82rem",
              fontWeight: 600,
              textDecoration: "none",
              transition: "all 0.15s ease",
            }}
          >
            {backLabel}
          </Link>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", color: "#94a3b8" }}>
          <Link href="/" style={{ color: "#94a3b8", textDecoration: "none" }}>
            Inicio
          </Link>
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <span key={index} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: "#64748b" }}>/</span>
                {item.href && !isLast ? (
                  <Link href={item.href} style={{ color: "#94a3b8", textDecoration: "none" }}>
                    {item.label}
                  </Link>
                ) : (
                  <span style={{ color: isLast ? "#c4b5fd" : "#94a3b8", fontWeight: isLast ? 600 : 400 }}>
                    {item.label}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>

      {actions && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {actions}
        </div>
      )}
    </nav>
  );
}
