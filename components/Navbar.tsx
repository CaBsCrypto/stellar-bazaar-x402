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

  const navLinks = [
    { href: "/catalogo", label: "Catálogo" },
    { href: "/#conectar-agente", label: "Conectar Agente" },
    { href: "/agent-chat", label: "Agent Chat" },
    { href: "/webmcp-playground", label: "WebMCP" },
    { href: "/buyer-execution", label: "Workspace" },
    { href: "/publish", label: "Publicar API" },
    { href: "/history", label: "Historial" },
    { href: "/docs", label: "Docs" },
  ];

  return (
    <>
      <nav className="nav shell" aria-label="Navegación principal">
        <Link href="/" className="brand">
          <span>✦</span> Stellar Bazaar <sup>x402</sup>
        </Link>

        {/* Desktop Links */}
        <div className="nav-links desktop-only">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname === link.href ? "active" : ""}
            >
              {link.label}
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

            <div className="mobile-drawer-links">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`mobile-nav-link ${pathname === link.href ? "active" : ""}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <a
                href="https://github.com/CaBsCrypto/stellar-bazaar-x402"
                target="_blank"
                rel="noreferrer"
                className="mobile-nav-link external"
                onClick={() => setMobileMenuOpen(false)}
              >
                GitHub Oficial ↗
              </a>
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
