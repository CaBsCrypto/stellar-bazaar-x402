"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

interface AdminStats {
  totalVolumeUSDC: string;
  bazaarTreasuryFeesUSDC: string;
  providerDisbursementsUSDC: string;
  totalInvocations: number;
  totalSettlements: number;
  settlementSuccessRate: string;
  averageSettlementLatencyMs: number;
  network: string;
  sorobanFeeSplitRouter: string;
  storageMode: string;
  servicesCount: number;
  activeAgents: Array<{ id: string; label: string; status: string; lastSeen: string }>;
}

interface ServiceItem {
  id: string;
  name: string;
  kind: string;
  status: string;
  route: string;
  price: string;
  registeredAt?: string;
}

const STORAGE_KEY = "bazaar_admin_access_token";

export function AdminOperationsDashboard() {
  const [token, setToken] = useState<string>("");
  const [inputToken, setInputToken] = useState<string>("");
  const [emailInput, setEmailInput] = useState<string>("");
  const [magicLinkSent, setMagicLinkSent] = useState<boolean>(false);
  const [magicLinkMsg, setMagicLinkMsg] = useState<string>("");
  const [requestingMagic, setRequestingMagic] = useState<boolean>(false);
  const [authTab, setAuthTab] = useState<"email" | "key">("email");

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>("");

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [builtIn, setBuiltIn] = useState<ServiceItem[]>([]);
  const [dynamicServices, setDynamicServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const screenTitle = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { if (!loading) screenTitle.current?.focus(); }, [isAuthenticated, loading]);
  const requestVersion = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const initialRead = useRef(false);

  const loadData = useCallback(async (tokenToUse: string) => {
    if (!tokenToUse || activeRequest.current) return;
    const version = ++requestVersion.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    const current = () => mounted.current && version === requestVersion.current;
    const oneUse = tokenToUse.startsWith("bz_magic_");
    if (oneUse) setToken("");
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/stats", {headers:{Authorization: "Bearer " + tokenToUse},cache:"no-store",signal:controller.signal});
      tokenToUse = "";
      if (!current()) return;
      if (!res.ok) throw new Error("ADMIN_ACCESS_FAILED");
      const data = await res.json();
      if (!current()) return;
      setStats(data.stats);
      setBuiltIn(data.builtInServices || []);
      setDynamicServices(data.dynamicServices || []);
      setLastUpdated(new Date().toLocaleTimeString());
      setIsAuthenticated(true);
      setAuthError("");
    } catch {
      if (!current()) return;
      setIsAuthenticated(false); setStats(null); setBuiltIn([]); setDynamicServices([]); setToken("");
      setAuthError(oneUse ? "No se pudo recuperar esta consulta. Solicita un enlace nuevo; no se reintentará el anterior." : "No se pudo abrir el panel. Revisa tu acceso.");
    } finally {
      tokenToUse = "";
      if (current()) { activeRequest.current = null; setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!initialRead.current) {
      initialRead.current = true;
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* No stored credentials are read. */ }
      const key = new URLSearchParams(window.location.hash.slice(1)).get("key");
      if (key) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        if (!key.startsWith("bz_magic_")) setToken(key);
        void loadData(key);
      } else setLoading(false);
    }
    return () => { mounted.current = false; };
  }, [loadData]);

  function handleLoginKey(e: React.FormEvent) {
    e.preventDefault();
    const key = inputToken.trim();
    if (!key || activeRequest.current) return;
    setInputToken("");
    setToken(key.startsWith("bz_magic_") ? "" : key);
    void loadData(key);
  }

  async function handleRequestMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!emailInput.trim()) return;
    try {
      setRequestingMagic(true);
      setMagicLinkMsg("");
      const res = await fetch("/api/admin/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error("ADMIN_LINK_FAILED");
      setMagicLinkSent(true);
      setMagicLinkMsg(data.message || "Enlace de acceso enviado.");

    } catch (err) {
      setMagicLinkMsg("Error al solicitar el enlace. Intenta nuevamente.");
    } finally {
      setRequestingMagic(false);
    }
  }

  function handleLogout() {
    ++requestVersion.current; activeRequest.current?.abort(); activeRequest.current = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setToken("");
    setInputToken("");
    setIsAuthenticated(false);
    setStats(null); setBuiltIn([]); setDynamicServices([]); setLastUpdated(""); setAuthError(""); setLoading(false); setRefreshing(false);
  }

  // --- LOCKED STATE (AUTH FORM) ---
  if (!loading && !isAuthenticated) {
    return (
      <div style={{ maxWidth: "500px", margin: "4rem auto", padding: "0 1rem" }}>
        <div
          style={{
            background: "rgba(13, 17, 28, 0.85)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "16px",
            padding: "2.5rem 2rem",
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🛡️</div>
          <h1 ref={screenTitle} tabIndex={-1} style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.5rem 0" }}>
            Bazaar Admin Center
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "0.88rem", marginBottom: "1.75rem", lineHeight: 1.4 }}>
            Telemetría sensible y supervisión en vivo del protocolo de agentes. Acceso restringido para el equipo de <strong>Browns Studio</strong>.
          </p>

          {/* Tab Selector */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "4px",
              background: "rgba(0,0,0,0.3)",
              padding: "4px",
              borderRadius: "8px",
              marginBottom: "1.5rem",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <button
              onClick={() => setAuthTab("email")}
              style={{
                background: authTab === "email" ? "rgba(112, 87, 232, 0.3)" : "transparent",
                color: authTab === "email" ? "#fff" : "#94a3b8",
                border: authTab === "email" ? "1px solid rgba(112, 87, 232, 0.5)" : "none",
                padding: "8px",
                borderRadius: "6px",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ✉️ Magic Link Email
            </button>
            <button
              onClick={() => setAuthTab("key")}
              style={{
                background: authTab === "key" ? "rgba(112, 87, 232, 0.3)" : "transparent",
                color: authTab === "key" ? "#fff" : "#94a3b8",
                border: authTab === "key" ? "1px solid rgba(112, 87, 232, 0.5)" : "none",
                padding: "8px",
                borderRadius: "6px",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              🔑 Master Key
            </button>
          </div>

          {authTab === "email" ? (
            <form onSubmit={handleRequestMagicLink} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ textAlign: "left" }}>
                <label
                  style={{
                    display: "block",
                    color: "#cbd5e1",
                    fontSize: "0.8rem",
                    marginBottom: "0.4rem",
                    fontWeight: 600,
                  }}
                >
                  Correo Autorizado (@browns.studio):
                </label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="cristian@browns.studio"
                  style={{
                    width: "100%",
                    padding: "0.75rem 1rem",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "0.95rem",
                    outline: "none",
                  }}
                />
              </div>

              {magicLinkMsg && (
                <div
                  style={{
                    padding: "0.75rem",
                    background: magicLinkSent ? "rgba(54, 185, 144, 0.15)" : "rgba(239, 68, 68, 0.15)",
                    border: `1px solid ${magicLinkSent ? "rgba(54, 185, 144, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                    borderRadius: "6px",
                    color: magicLinkSent ? "#36b990" : "#f87171",
                    fontSize: "0.82rem",
                    lineHeight: 1.4,
                  }}
                >
                  {magicLinkMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={requestingMagic || !emailInput.trim()}
                style={{
                  marginTop: "0.5rem",
                  padding: "0.75rem",
                  background: "linear-gradient(135deg, #7057e8 0%, #4338ca 100%)",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  cursor: emailInput.trim() ? "pointer" : "not-allowed",
                  opacity: emailInput.trim() ? 1 : 0.6,
                }}
              >
                {requestingMagic ? "Enviando Magic Link..." : "Enviar Enlace a mi Correo →"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLoginKey} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ textAlign: "left" }}>
                <label
                  style={{
                    display: "block",
                    color: "#cbd5e1",
                    fontSize: "0.8rem",
                    marginBottom: "0.4rem",
                    fontWeight: 600,
                  }}
                >
                  Admin Master Access Key:
                </label>
                <input
                  type="password"
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                  placeholder="bz_admin_..."
                  style={{
                    width: "100%",
                    padding: "0.75rem 1rem",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "0.95rem",
                    outline: "none",
                    fontFamily: "monospace",
                  }}
                />
              </div>

              {authError && (
                <div
                  style={{
                    padding: "0.6rem",
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "6px",
                    color: "#f87171",
                    fontSize: "0.82rem",
                  }}
                >
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={refreshing || !inputToken.trim()}
                style={{
                  marginTop: "0.5rem",
                  padding: "0.75rem",
                  background: "linear-gradient(135deg, #7057e8 0%, #4338ca 100%)",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  cursor: inputToken.trim() ? "pointer" : "not-allowed",
                  opacity: inputToken.trim() ? 1 : 0.6,
                }}
              >
                {refreshing ? "Verificando..." : "Desbloquear con Master Key →"}
              </button>
            </form>
          )}

          <div
            style={{
              marginTop: "2rem",
              paddingTop: "1.25rem",
              borderTop: "1px solid rgba(255, 255, 255, 0.06)",
              fontSize: "0.78rem",
              color: "#64748b",
            }}
          >
            Tip: Al hacer clic en el Magic Link del correo entrarás directamente sin contraseñas.
          </div>
        </div>
      </div>
    );
  }

  // --- UNLOCKED / DASHBOARD VIEW ---
  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 1rem" }}>
      {/* Header Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "2rem",
          paddingBottom: "1.5rem",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.5rem" }}>🛡️</span>
            <h1 ref={screenTitle} tabIndex={-1} style={{ fontSize: "1.8rem", fontWeight: 700, margin: 0 }}>Operations & Admin Center</h1>
            <span
              style={{
                background: "rgba(56, 189, 248, 0.15)",
                color: "#38bdf8",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                borderRadius: "20px",
                padding: "2px 10px",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              AUTHENTICATED
            </span>
          </div>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: "0.4rem 0 0 0" }}>
            Monitoreo en tiempo real de interacciones x402, liquidación en Soroban, agentes activos y salud del catálogo.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {lastUpdated && (
            <span style={{ color: "#64748b", fontSize: "0.85rem" }}>
              Último scan: <strong>{lastUpdated}</strong>
            </span>
          )}
          <button
            onClick={() => void loadData(token)}
            disabled={refreshing || !token}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#fff",
              padding: "0.5rem 0.9rem",
              borderRadius: "8px",
              cursor: refreshing ? "not-allowed" : "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
          >
            {refreshing ? "Actualizando..." : !token ? "Consulta de un solo uso" : "🔄 Refrescar"}
          </button>
          <button
            onClick={handleLogout}
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#f87171",
              padding: "0.5rem 0.9rem",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
          >
            🔒 Cerrar Sesión
          </button>
        </div>
      </div>

      {loading && !stats ? (
        <div style={{ textAlign: "center", padding: "4rem 0", color: "#94a3b8" }}>
          Cargando telemetría del Bazaar...
        </div>
      ) : stats ? (
        <>
          {/* Key Metrics Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            {/* Total Volume */}
            <div
              style={{
                background: "rgba(13, 17, 28, 0.7)",
                border: "1px solid rgba(54, 185, 144, 0.3)",
                borderRadius: "12px",
                padding: "1.25rem",
              }}
            >
              <span style={{ color: "#94a3b8", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Volumen Total Liquidado
              </span>
              <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#36b990", margin: "0.4rem 0" }}>
                ${stats.totalVolumeUSDC} <span style={{ fontSize: "0.9rem", color: "#94a3b8" }}>USDC</span>
              </div>
              <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                {stats.totalSettlements} pagos exitosos en Stellar
              </span>
            </div>

            {/* Soroban Split Disbursement */}
            <div
              style={{
                background: "rgba(13, 17, 28, 0.7)",
                border: "1px solid rgba(112, 87, 232, 0.3)",
                borderRadius: "12px",
                padding: "1.25rem",
              }}
            >
              <span style={{ color: "#94a3b8", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Dispersión a Creadores (97%)
              </span>
              <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#a78bfa", margin: "0.4rem 0" }}>
                ${stats.providerDisbursementsUSDC} <span style={{ fontSize: "0.9rem", color: "#94a3b8" }}>USDC</span>
              </div>
              <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                Directo a wallets de proveedores
              </span>
            </div>

            {/* Treasury Fees */}
            <div
              style={{
                background: "rgba(13, 17, 28, 0.7)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                borderRadius: "12px",
                padding: "1.25rem",
              }}
            >
              <span style={{ color: "#94a3b8", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Bazaar Treasury (3% Fee)
              </span>
              <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#fbbf24", margin: "0.4rem 0" }}>
                ${stats.bazaarTreasuryFeesUSDC} <span style={{ fontSize: "0.9rem", color: "#94a3b8" }}>USDC</span>
              </div>
              <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                Retención de protocolo no-custodial
              </span>
            </div>

            {/* Invocations & Latency */}
            <div
              style={{
                background: "rgba(13, 17, 28, 0.7)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                borderRadius: "12px",
                padding: "1.25rem",
              }}
            >
              <span style={{ color: "#94a3b8", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Tasa de Éxito & Latencia
              </span>
              <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#38bdf8", margin: "0.4rem 0" }}>
                {stats.settlementSuccessRate}
              </div>
              <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                Avg Latency: ~{stats.averageSettlementLatencyMs} ms / invocación
              </span>
            </div>
          </div>

          {/* Quick Tools & Shortcuts */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1rem",
              marginBottom: "2.5rem",
            }}
          >
            <Link
              href="/agent-chat"
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "12px",
                padding: "1.25rem",
                textDecoration: "none",
                display: "block",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                <span style={{ fontSize: "1.2rem" }}>💬</span>
                <strong style={{ color: "#fff", fontSize: "1.05rem" }}>Probar Agent Chat</strong>
              </div>
              <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: 0, lineHeight: 1.4 }}>
                Abre la interfaz de conversación interactiva Humano ↔ Agente con magic-link zero-knowledge.
              </p>
            </Link>

            <Link
              href="/webmcp-playground"
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "12px",
                padding: "1.25rem",
                textDecoration: "none",
                display: "block",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                <span style={{ fontSize: "1.2rem" }}>🧪</span>
                <strong style={{ color: "#fff", fontSize: "1.05rem" }}>WebMCP Playground</strong>
              </div>
              <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: 0, lineHeight: 1.4 }}>
                Inspecciona y ejecuta herramientas WebMCP del navegador con validación en vivo de schemas.
              </p>
            </Link>

            <Link
              href="/fee-split"
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "12px",
                padding: "1.25rem",
                textDecoration: "none",
                display: "block",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                <span style={{ fontSize: "1.2rem" }}>⚖️</span>
                <strong style={{ color: "#fff", fontSize: "1.05rem" }}>Fee Split Router Simulator</strong>
              </div>
              <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: 0, lineHeight: 1.4 }}>
                Simula splits en Soroban (97/3 o 99/1) con safety cap on-chain y liquidación atómica.
              </p>
            </Link>

            <Link
              href="/history"
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "12px",
                padding: "1.25rem",
                textDecoration: "none",
                display: "block",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                <span style={{ fontSize: "1.2rem" }}>📜</span>
                <strong style={{ color: "#fff", fontSize: "1.05rem" }}>Historial & Entregas Privadas</strong>
              </div>
              <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: 0, lineHeight: 1.4 }}>
                Consulta entregas protegidas y desbloqueo seguro mediante tokens en fragmento hash.
              </p>
            </Link>
          </div>

          {/* Active Agents & Endpoints Supervision */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
              gap: "2rem",
              marginBottom: "3rem",
            }}
          >
            {/* Active Connected Agents */}
            <div
              style={{
                background: "rgba(13, 17, 28, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "14px",
                padding: "1.5rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>🤖</span> Agentes Conectados
                </h2>
                <span style={{ fontSize: "0.75rem", color: "#36b990", fontWeight: 600 }}>
                  ● {stats.activeAgents.filter((a) => a.status === "online").length} ONLINE
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {stats.activeAgents.map((ag) => (
                  <div
                    key={ag.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.75rem 1rem",
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                      borderRadius: "8px",
                    }}
                  >
                    <div>
                      <strong style={{ display: "block", fontSize: "0.9rem", color: "#f8fafc" }}>
                        {ag.label}
                      </strong>
                      <span style={{ color: "#64748b", fontSize: "0.75rem", fontFamily: "monospace" }}>
                        {ag.id}
                      </span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          background: ag.status === "online" ? "rgba(54, 185, 144, 0.15)" : "rgba(148, 163, 184, 0.15)",
                          color: ag.status === "online" ? "#36b990" : "#94a3b8",
                          marginBottom: "2px",
                        }}
                      >
                        {ag.status.toUpperCase()}
                      </span>
                      <small style={{ display: "block", color: "#64748b", fontSize: "0.7rem" }}>
                        {ag.lastSeen}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Catalog Services Healthcheck */}
            <div
              style={{
                background: "rgba(13, 17, 28, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "14px",
                padding: "1.5rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>📡</span> Estado de Servicios y APIs ({builtIn.length + dynamicServices.length})
                </h2>
                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                  Almacenamiento: <strong style={{ color: "#e2e8f0" }}>{stats.storageMode}</strong>
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "360px", overflowY: "auto" }}>
                {[...builtIn, ...dynamicServices].map((svc) => (
                  <div
                    key={svc.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.75rem 1rem",
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                      borderRadius: "8px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <strong style={{ fontSize: "0.9rem", color: "#f8fafc" }}>{svc.name}</strong>
                        <span
                          style={{
                            background: "rgba(112, 87, 232, 0.15)",
                            color: "#a78bfa",
                            borderRadius: "4px",
                            padding: "1px 5px",
                            fontSize: "0.65rem",
                            textTransform: "uppercase",
                          }}
                        >
                          {svc.kind}
                        </span>
                      </div>
                      <span style={{ color: "#64748b", fontSize: "0.75rem", fontFamily: "monospace" }}>
                        {svc.route}
                      </span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ color: "#36b990", fontSize: "0.8rem", fontWeight: 600, display: "block" }}>
                        {svc.price}
                      </span>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: svc.status === "healthy" || svc.status === "online" || svc.status === "active" ? "#36b990" : "#fbbf24",
                        }}
                      >
                        ● {svc.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
