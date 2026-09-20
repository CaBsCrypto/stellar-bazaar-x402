import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { AgentChatDemo } from "@/components/AgentChatDemo";

export const metadata: Metadata = {
  title: "Chat Humano ↔ Agente — Stellar Bazaar x402",
  description: "Interfaz interactiva de comunicación con tu agente autónomo con compras x402 y auto-desbloqueo de historial.",
};

export default function AgentChatPage() {
  return (
    <main>
      <div className="mock-banner">
        AI AGENT ASSISTANT · TESTNET x402 PURCHASES · CLOUDFLARE R2 DELIVERABLES · ZERO-KNOWLEDGE
      </div>
      <Navbar />
      <div className="shell">
        <AgentChatDemo />
      </div>
      <footer className="shell">
        <div className="brand">
          <span>✦</span> Stellar Bazaar x402
        </div>
        <p>Buyer-controlled · Non-custodial · Testnet payments and zero-knowledge history links</p>
      </footer>
    </main>
  );
}
