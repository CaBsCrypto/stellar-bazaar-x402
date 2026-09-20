import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Footer } from "@/components/Footer";
import { WebMCPPlayground } from "@/components/WebMCPPlayground";

export const metadata: Metadata = {
  title: "WebMCP Tools Playground — Stellar Bazaar x402",
  description: "Entorno interactivo para inspeccionar y ejecutar herramientas de Stellar Bazaar vía el estándar WebMCP.",
};

export default function WebMCPPlaygroundPage() {
  return (
    <main>
      <div className="mock-banner">
        WEBMCP INTERFACE · BROWSER AGENT RUNTIME · MODEL CONTEXT PROTOCOL · CLIENT ADAPTER
      </div>
      <Navbar />
      <div className="shell" style={{ marginTop: "1rem", marginBottom: "4rem" }}>
        <Breadcrumbs
          items={[{ label: "WebMCP Playground" }]}
          backHref="/catalogo"
          backLabel="← Volver al Catálogo"
          actions={
            <div style={{ display: "flex", gap: "8px" }}>
              <Link
                href="/agent-chat"
                style={{
                  fontSize: "0.8rem",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  background: "rgba(112, 87, 232, 0.2)",
                  border: "1px solid rgba(112, 87, 232, 0.4)",
                  color: "#c4b5fd",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                💬 Agent Chat Live
              </Link>
              <Link
                href="/docs"
                style={{
                  fontSize: "0.8rem",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  background: "rgba(56, 189, 248, 0.2)",
                  border: "1px solid rgba(56, 189, 248, 0.4)",
                  color: "#38bdf8",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                📚 Docs de Integración
              </Link>
            </div>
          }
        />
        <WebMCPPlayground />
      </div>
      <Footer />
    </main>
  );
}
