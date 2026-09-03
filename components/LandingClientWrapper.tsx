"use client";

import { useState } from "react";
import Link from "next/link";
import { AgentConnectModal } from "./AgentConnectModal";

export function LandingClientWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="hero-actions">
        <button
          className="primary"
          onClick={() => setModalOpen(true)}
          style={{
            cursor: "pointer",
            border: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "1rem",
            fontWeight: 700,
          }}
        >
          ⚡ Conectar mi Agente →
        </button>
        <Link className="ghost" href="/catalogo">
          Ver Catálogo Completo ↗
        </Link>
      </div>

      <AgentConnectModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      {children}
    </>
  );
}
