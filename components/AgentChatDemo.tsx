"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

/** Public illustration only. Real credentials require server operator provisioning. */
export function AgentChatDemo() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  useEffect(() => {
    try { localStorage.removeItem("bazaar_demo_agent_session"); } catch { /* Storage unavailable. */ }
  }, []);
  return <section aria-labelledby="agent-chat-title" style={{ maxWidth: 840, margin: "0 auto", padding: "1.5rem 1rem" }}>
    <span className="status-badge">Demostración · respuestas de ejemplo</span>
    <h1 id="agent-chat-title">Así colaboras con tu agente</h1>
    <p>Este chat ilustra el recorrido. No consulta proveedores, autoriza pagos ni crea accesos privados.</p>
    <div aria-live="polite" style={{ display: "grid", gap: 16, paddingBlock: 16 }}>
      <p>Cuéntale a tu agente qué necesitas. Puede comparar servicios y pedirte las condiciones que falten antes de comprar.</p>
      {messages.map((message, i) => <div key={i} className="card" style={{ padding: 16, overflowWrap: "anywhere" }}>
        <p><strong>Tú:</strong> {message}</p>
        <p><strong>Respuesta ilustrativa:</strong> Revisaría los servicios y las condiciones autorizadas. Después de una compra confirmada, conservaría la entrega. Solo compartiría un enlace privado si el historial y los accesos están configurados.</p>
      </div>)}
    </div>
    <form onSubmit={event => { event.preventDefault(); if (input.trim()) { setMessages(previous => [...previous, input.trim()]); setInput(""); } }} style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      <label htmlFor="demo-request">Solicitud de ejemplo</label>
      <input id="demo-request" value={input} onChange={event => setInput(event.target.value)} maxLength={2000} style={{ minWidth: 0, width: "100%" }} />
      <button type="submit" disabled={!input.trim()}>Ver respuesta de ejemplo</button>
    </form>
    <p><Link href="/history/review">Explorar biblioteca de demostración</Link></p>
    <p>Para utilizar tu agente real, <Link href="/hub">consulta las instrucciones de conexión</Link>.</p>
  </section>;
}
