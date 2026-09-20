"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { generateHistoryKeypair } from "@/lib/operation-history-auth";
import { formatHumanHistoryUrl } from "@/lib/operation-history-client";

interface Message {
  id: string;
  sender: "human" | "agent" | "system";
  text: string;
  time: string;
  magicLink?: string;
  status?: "pending" | "processing" | "completed" | "failed";
  details?: {
    serviceId?: string;
    action?: string;
    amount?: string;
    network?: string;
    r2Delivery?: boolean;
  };
}

export function AgentChatDemo() {
  const [credentials, setCredentials] = useState<{ readToken: string; writeToken: string; ownerId: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Generate or retrieve session keypair
    let creds: { readToken: string; writeToken: string; ownerId: string };
    const saved = localStorage.getItem("bazaar_demo_agent_session");
    if (saved) {
      try {
        creds = JSON.parse(saved);
      } catch {
        creds = generateHistoryKeypair("chat-user-" + Math.random().toString(36).slice(2, 8));
        localStorage.setItem("bazaar_demo_agent_session", JSON.stringify(creds));
      }
    } else {
      creds = generateHistoryKeypair("chat-user-" + Math.random().toString(36).slice(2, 8));
      localStorage.setItem("bazaar_demo_agent_session", JSON.stringify(creds));
    }
    setCredentials(creds);

    const initialTime = new Date().toISOString().slice(11, 19);
    setMessages([
      {
        id: "sys-1",
        sender: "system",
        text: "🔐 Sesión segura inicializada. Tu agente opera de forma autónoma con pagos x402 en Stellar Testnet y almacenamiento privado en Cloudflare R2.",
        time: initialTime,
      },
      {
        id: "ag-1",
        sender: "agent",
        text: "¡Hola! Soy tu agente del Bazaar. Puedes pedirme una auditoría de sitio web, cotizaciones x402, o consultar tu historial privado en cualquier momento.",
        time: initialTime,
      },
    ]);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = input.trim();
    if (!query || busy || !credentials) return;

    setInput("");
    const now = new Date().toISOString().slice(11, 19);
    const userMsgId = "msg-" + Date.now();

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: "human",
        text: query,
        time: now,
      },
    ]);

    setBusy(true);

    const lower = query.toLowerCase();

    // Simulating agent processing
    setTimeout(async () => {
      const respTime = new Date().toISOString().slice(11, 19);
      const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      const magicLink = formatHumanHistoryUrl(origin, credentials.readToken);

      if (
        lower.includes("historial") ||
        lower.includes("transaccion") ||
        lower.includes("reporte") ||
        lower.includes("link") ||
        lower.includes("enlace") ||
        lower.includes("compras")
      ) {
        setMessages((prev) => [
          ...prev,
          {
            id: "resp-" + Date.now(),
            sender: "agent",
            text: "Aquí tienes tu enlace personalizado y privado para ver todas las compras y entregables en tu historial:",
            time: respTime,
            magicLink,
            status: "completed",
            details: {
              action: "get_history_magic_link",
              network: "stellar:testnet",
            },
          },
        ]);
      } else if (
        lower.includes("auditoria") ||
        lower.includes("web") ||
        lower.includes("analisis") ||
        lower.includes("audit") ||
        lower.includes("sitio")
      ) {
        setMessages((prev) => [
          ...prev,
          {
            id: "resp-" + Date.now(),
            sender: "agent",
            text: `He localizado el servicio "Website Intelligence" en el catálogo x402. Evaluando política de presupuesto (0.01 USDC max) ... Aprobado. Ejecutando pago x402 en Testnet y guardando entregable privado en Cloudflare R2.`,
            time: respTime,
            magicLink,
            status: "completed",
            details: {
              serviceId: "website-intelligence-preview",
              amount: "0.005 USDC",
              network: "stellar:testnet",
              r2Delivery: true,
            },
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: "resp-" + Date.now(),
            sender: "agent",
            text: `Entendido. Puedo buscar servicios x402 en el Bazaar, ejecutar pagos en Stellar Testnet y entregarte tus reportes privados en Cloudflare R2. Prueba pidiéndome: "¿Puedes hacer una auditoría a mi web?" o "Dame mi historial de compras".`,
            time: respTime,
            magicLink,
          },
        ]);
      }

      setBusy(false);
    }, 1000);
  };

  const handlePreset = (text: string) => {
    setInput(text);
  };

  return (
    <section className="agent-chat-demo" aria-labelledby="agent-chat-title" style={{ maxWidth: 840, margin: "0 auto", padding: "1.5rem 1rem" }}>
      <header style={{ marginBottom: "1.5rem", borderBottom: "1px solid var(--border-color, #2a2e39)", paddingBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <span style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8ab4f8", fontWeight: 600 }}>
              AI AGENT INTERFACE · ZERO-KNOWLEDGE
            </span>
            <h1 id="agent-chat-title" style={{ fontSize: "1.6rem", margin: "0.2rem 0" }}>
              Chat Interactivo Humano ↔ Agente
            </h1>
            <p style={{ color: "#9aa0a6", margin: 0, fontSize: "0.95rem" }}>
              Habla con tu agente: solicita microservicios x402, autoriza pagos en Testnet y recibe enlaces mágicos directos a tus entregables en R2.
            </p>
          </div>
          {credentials && (
            <span style={{ fontSize: "0.75rem", background: "rgba(138, 180, 248, 0.1)", color: "#8ab4f8", border: "1px solid rgba(138, 180, 248, 0.2)", borderRadius: 16, padding: "4px 10px" }}>
              Sesión: {credentials.ownerId}
            </span>
          )}
        </div>
      </header>

      {/* Suggested prompts */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => handlePreset("Quiero una auditoría web para mi proyecto")}
          style={{ fontSize: "0.85rem", padding: "6px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#e8eaed", cursor: "pointer" }}
        >
          🔍 "Quiero una auditoría web"
        </button>
        <button
          type="button"
          onClick={() => handlePreset("¿Dónde puedo ver mi historial de transacciones?")}
          style={{ fontSize: "0.85rem", padding: "6px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#e8eaed", cursor: "pointer" }}
        >
          📜 "¿Dónde está mi historial?"
        </button>
        <button
          type="button"
          onClick={() => handlePreset("Verifica el riesgo de swap y cotización")}
          style={{ fontSize: "0.85rem", padding: "6px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#e8eaed", cursor: "pointer" }}
        >
          ⚡ "Verifica el riesgo de swap"
        </button>
      </div>

      {/* Chat messages viewport */}
      <div
        style={{
          background: "#13161c",
          border: "1px solid #232834",
          borderRadius: 8,
          minHeight: 380,
          maxHeight: 520,
          overflowY: "auto",
          padding: "1.2rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: msg.sender === "human" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "85%",
                borderRadius: 8,
                padding: "0.8rem 1rem",
                background:
                  msg.sender === "human"
                    ? "#1a4980"
                    : msg.sender === "system"
                    ? "rgba(255, 255, 255, 0.04)"
                    : "#1c222d",
                border:
                  msg.sender === "system"
                    ? "1px dashed #3c4043"
                    : msg.sender === "human"
                    ? "1px solid #2563eb"
                    : "1px solid #2d3748",
                color: "#f1f3f4",
                fontSize: "0.95rem",
                lineHeight: 1.45,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "0.3rem", fontSize: "0.75rem", color: "#9aa0a6" }}>
                <strong>
                  {msg.sender === "human" ? "👤 Tú" : msg.sender === "agent" ? "🤖 Agente Bazaar" : "🛡️ Sistema"}
                </strong>
                <span>{msg.time}</span>
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg.text}</p>

              {msg.details && (
                <div style={{ marginTop: "0.6rem", padding: "0.5rem", background: "rgba(0,0,0,0.25)", borderRadius: 4, fontSize: "0.8rem", borderLeft: "3px solid #8ab4f8" }}>
                  {msg.details.serviceId && <div><strong>Servicio:</strong> {msg.details.serviceId}</div>}
                  {msg.details.amount && <div><strong>Costo:</strong> {msg.details.amount}</div>}
                  {msg.details.network && <div><strong>Red:</strong> {msg.details.network}</div>}
                  {msg.details.r2Delivery && <div style={{ color: "#81c995" }}>✓ Entregable protegido en Cloudflare R2 ($0 egress)</div>}
                </div>
              )}

              {msg.magicLink && (
                <div style={{ marginTop: "0.8rem", paddingTop: "0.6rem", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                  <Link
                    href={msg.magicLink}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      background: "#2563eb",
                      color: "#ffffff",
                      textDecoration: "none",
                      padding: "6px 14px",
                      borderRadius: 6,
                      fontSize: "0.88rem",
                      fontWeight: 500,
                    }}
                  >
                    <span>✦ Ver mi Historial Privado Desbloqueado</span>
                  </Link>
                  <div style={{ fontSize: "0.72rem", color: "#9aa0a6", marginTop: "4px" }}>
                    Auto-autenticación Zero-Knowledge vía token hash.
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#8ab4f8", fontSize: "0.85rem" }}>
            <span style={{ animation: "pulse 1.5s infinite" }}>🤖 Agente analizando y evaluando políticas x402...</span>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Input box */}
      <form onSubmit={handleSend} style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe una instrucción para tu agente o consulta tu historial..."
          disabled={busy}
          style={{
            flex: 1,
            padding: "0.75rem 1rem",
            background: "#13161c",
            border: "1px solid #2d3748",
            borderRadius: 6,
            color: "#ffffff",
            fontSize: "0.95rem",
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          style={{
            padding: "0.75rem 1.4rem",
            background: "#2563eb",
            color: "#ffffff",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy || !input.trim() ? 0.6 : 1,
          }}
        >
          Enviar
        </button>
      </form>
    </section>
  );
}
