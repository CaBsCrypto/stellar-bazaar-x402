import Link from "next/link";
import { AdminOperationsDashboard } from "@/components/AdminOperationsDashboard";

export default function AdminPage() {
  return (
    <main>
      <div className="mock-banner">
        🛡️ <strong>BAZAAR OPERATIONS & SUPERVISOR CENTER</strong> · STELLAR TESTNET · MONITOREO DE ACTIVIDAD Y ESTADO
      </div>

      <nav className="nav shell">
        <Link href="/" className="brand">
          <span>✦</span> Stellar Bazaar <sup>x402</sup>
        </Link>
        <div className="nav-links">
          <Link href="/">Inicio</Link>
          <Link href="/catalogo">Catálogo</Link>
          <Link href="/agent-chat">Agent Chat</Link>
          <Link href="/webmcp-playground">WebMCP</Link>
          <Link href="/fee-split">Fee Split</Link>
          <Link href="/history">Historial</Link>
          <Link href="/admin" className="active">Admin</Link>
          <Link href="/docs">Docs</Link>
        </div>
        <span className="network-pill"><i /> Testnet en vivo</span>
      </nav>

      <div className="shell" style={{ marginTop: "2rem", marginBottom: "4rem" }}>
        <AdminOperationsDashboard />
      </div>

      <footer className="shell" style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)", paddingTop: "2rem", paddingBottom: "3rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div className="brand"><span>✦</span> Stellar Bazaar <sup>x402</sup></div>
          <p style={{ margin: 0, color: "#64748b", fontSize: "0.85rem" }}>
            Stellar Agentic Infrastructure · Operations Center & Protocol Telemetry
          </p>
        </div>
      </footer>
    </main>
  );
}
