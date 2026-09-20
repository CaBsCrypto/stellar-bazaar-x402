import Link from "next/link";
import type { Metadata } from "next";
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
      <nav className="nav shell">
        <Link href="/" className="brand">
          <span>✦</span> Stellar Bazaar <sup>x402</sup>
        </Link>
        <div className="nav-links">
          <Link href="/catalogo">Catálogo</Link>
          <Link href="/agent-chat">Agent Chat</Link>
          <Link href="/buyer-execution">Buyer Workspace</Link>
          <Link href="/history">Historial</Link>
          <Link href="/docs">Docs</Link>
        </div>
        <span className="network-pill">
          <i /> WebMCP Ready
        </span>
      </nav>
      <div className="shell">
        <WebMCPPlayground />
      </div>
      <footer className="shell">
        <div className="brand">
          <span>✦</span> Stellar Bazaar x402
        </div>
        <p>WebMCP Client Adapter · Standards-compliant Model Context Protocol · Zero-Knowledge</p>
      </footer>
    </main>
  );
}
