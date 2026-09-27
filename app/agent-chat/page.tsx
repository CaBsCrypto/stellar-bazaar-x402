import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Footer } from "@/components/Footer";
import { AgentChatDemo } from "@/components/AgentChatDemo";

export const metadata: Metadata = {
  title: "Chat Humano ↔ Agente — Stellar Bazaar x402",
  description: "Demostración de cómo colaborar con tu agente. Respuestas ilustrativas, sin compras ni creación de accesos privados.",
};

export default function AgentChatPage() {
  return (
    <main>
      <div className="mock-banner">
        DEMOSTRACIÓN · RESPUESTAS DE EJEMPLO · SIN COMPRAS
      </div>
      <Navbar />

      <div className="shell" style={{ marginTop: "1rem", marginBottom: "4rem" }}>
        <Breadcrumbs
          items={[{ label: "Chat de demostración" }]}
          backHref="/catalogo"
          backLabel="← Volver al Catálogo"
          actions={
            <div style={{ display: "flex", gap: "8px" }}>
              <Link
                href="/history"
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
                🔒 Ver Historial
              </Link>
              <Link
                href="/webmcp-playground"
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
                🤖 WebMCP Playground
              </Link>
            </div>
          }
        />

        <AgentChatDemo />
      </div>

      <Footer />
    </main>
  );
}
