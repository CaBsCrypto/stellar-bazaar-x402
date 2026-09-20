"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const mainNavLinks = [
    { href: "/catalogo", label: "Catálogo", badge: null },
    { href: "/agent-chat", label: "Agent Chat", badge: "Live" },
    { href: "/webmcp-playground", label: "WebMCP", badge: null },
    { href: "/buyer-execution", label: "Workspace", badge: null },
    { href: "/publish", label: "Publicar API", badge: null },
    { href: "/history", label: "Historial", badge: "R2" },
    { href: "/docs", label: "Docs", badge: null },
  ];

  const drawerSections = [
    {
      title: "Explorar & Catálogo",
      links: [
        { href: "/catalogo", label: "Catálogo de Servicios", icon: "📂" },
        { href: "/#conectar-agente", label: "Hub de Conexión de Agentes", icon: "⚡" },
      ],
    },
    {
      title: "Agentes & Laboratorio",
      links: [
        { href: "/agent-chat", label: "Agent Chat Live", icon: "💬", badge: "Interactivo" },
        { href: "/webmcp-playground", label: "WebMCP Playground", icon: "🤖" },
        { href: "/buyer-execution", label: "Buyer Workspace", icon: "💻" },
      ],
    },
    {
      title: "Desarrolladores & Protocolo",
      links: [
        { href: "/publish", label: "Publicar & Validar API", icon: "🚀" },
        { href: "/fee-split", label: "Fee Split Autónomo (99/1)", icon: "💰" },
        { href: "/docs", label: "Documentación & SDKs", icon: "📚" },
        { href: "/llms.txt", label: "Especificación llms.txt", icon: "📄", external: true },
      ],
    },
    {
      title: "Tu Espacio Privado",
      links: [
        { href: "/history", label: "Mi Historial Privado (R2)", icon: "🔒" },
        { href: "/history/review", label: "Demo de Entregables", icon: "👁️" },
      ],
    },
  ];

  return (
    <>
      <nav className="nav shell" aria-label="Navegación principal">
        <Link href="/" className="brand">
          <span>✦</span> Stellar Bazaar <sup>x402</sup>
        </Link>

        {/* Desktop Links */}
        <div className="nav-links desktop-only">
          {mainNavLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname === link.href ? "active" : ""}
            >
              {link.label}
              {link.badge && (
                <span
                  style={{
                    marginLeft: "4px",
                    fontSize: "0.68rem",
                    padding: "1px 5px",
                    borderRadius: "4px",
                    background: link.badge === "Live" ? "rgba(16, 185, 129, 0.2)" : "rgba(112, 87, 232, 0.25)",
                    color: link.badge === "Live" ? "#6ee7b7" : "#c4b5fd",
                    border: link.badge === "Live" ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(112, 87, 232, 0.4)",
                  }}
                >
                  {link.badge}
                </span>
              )}
            </Link>
          ))}
          <a
            href="https://github.com/CaBsCrypto/stellar-bazaar-x402"
            target="_blank"
            rel="noreferrer"
            className="external-link"
          >
            GitHub ↗
          </a>
        </div>

        <div className="nav-right">
          <span className="network-pill">
            <i /> <span className="pill-text">Testnet en vivo</span>
          </span>

          {/* Mobile Hamburger Toggle Button */}
          <button
            type="button"
            className={`mobile-menu-toggle ${mobileMenuOpen ? "open" : ""}`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú de navegación"}
            aria-expanded={mobileMenuOpen}
          >
            <span className="hamburger-line line-1" />
            <span className="hamburger-line line-2" />
            <span className="hamburger-line line-3" />
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="mobile-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
            style={{ overflowY: "auto", maxHeight: "100vh" }}
          >
            <div className="mobile-drawer-header">
              <Link href="/" className="brand" onClick={() => setMobileMenuOpen(false)}>
                <span>✦</span> Stellar Bazaar <sup>x402</sup>
              </Link>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Cerrar menú"
              >
                ✕
              </button>
            </div>

            <div className="mobile-drawer-links" style={{ padding: "0.5rem 1.2rem 2rem 1.2rem" }}>
              {drawerSections.map((section, sIdx) => (
                <div key={sIdx} style={{ marginBottom: "1.2rem" }}>
                  <div
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#94a3b8",
                      marginBottom: "6px",
                      paddingLeft: "4px",
                    }}
                  >
                    {section.title}
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    {section.links.map((link) => {
                      const isActive = pathname === link.href;
                      if (link.external) {
                        return (
                          <a
                            key={link.href}
                            href={link.href}
                            target="_blank"
                            rel="noreferrer"
                            className="mobile-nav-link"
                            onClick={() => setMobileMenuOpen(false)}
                            style={{ display: "flex", alignItems: "center", gap: "8px" }}
                          >
                            <span>{link.icon}</span>
                            <span>{link.label} ↗</span>
                          </a>
                        );
                      }
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          className={`mobile-nav-link ${isActive ? "active" : ""}`}
                          onClick={() => setMobileMenuOpen(false)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            background: isActive ? "rgba(112, 87, 232, 0.2)" : "transparent",
                            border: isActive ? "1px solid rgba(112, 87, 232, 0.4)" : "1px solid transparent",
                            borderRadius: "8px",
                            padding: "8px 12px",
                          }}
                        >
                          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>{link.icon}</span>
                            <span>{link.label}</span>
                          </span>
                          {link.badge && (
                            <span
                              style={{
                                fontSize: "0.68rem",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                background: "rgba(16, 185, 129, 0.2)",
                                color: "#6ee7b7",
                                fontWeight: 700,
                              }}
                            >
                              {link.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
                <a
                  href="https://github.com/CaBsCrypto/stellar-bazaar-x402"
                  target="_blank"
                  rel="noreferrer"
                  className="mobile-nav-link external"
                  onClick={() => setMobileMenuOpen(false)}
                  style={{ display: "flex", alignItems: "center", gap: "8px", color: "#c4b5fd" }}
                >
                  <span>🐙</span>
                  <span>GitHub Oficial del Proyecto ↗</span>
                </a>
              </div>
            </div>

            <div className="mobile-drawer-footer">
              <span className="network-pill full-width">
                <i /> Stellar Testnet · USDC SEP-41
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
