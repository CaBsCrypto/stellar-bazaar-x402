import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Footer } from "@/components/Footer";
import { BuyerExecutionDemo } from "@/components/BuyerExecutionDemo";
import { WebsiteIntelligenceConsumption } from "@/components/WebsiteIntelligenceConsumption";

export default function BuyerExecutionPage() {
  return (
    <main>
      <div className="mock-banner">BUYER WORKSPACE · TESTNET EVIDENCE + LOCAL CONTRACT FIXTURES · NON-CUSTODIAL</div>
      <Navbar />
      <div className="shell" style={{ marginTop: "1rem", marginBottom: "4rem" }}>
        <Breadcrumbs
          items={[{ label: "Buyer Workspace" }]}
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
                💬 Agent Chat
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
        <WebsiteIntelligenceConsumption />
        <BuyerExecutionDemo />
      </div>
      <Footer />
    </main>
  );
}

