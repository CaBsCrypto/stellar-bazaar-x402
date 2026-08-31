"use client";

import { useEffect, useState, useRef } from "react";
import { initWebMCP } from "@/lib/webmcp/polyfill";
import { registerBazaarTools } from "@/lib/webmcp/register";
import { ModelContextRegistry, WebMCPActivityLog, WebMCPToolDefinition } from "@/lib/webmcp/types";

const PRESET_QUERIES: Record<string, string> = {
  bazaar_search_services: '{\n  "query": "finance",\n  "maxPrice": 1.0\n}',
  bazaar_get_service: '{\n  "serviceId": "risk-assessment-v0"\n}',
  bazaar_list_workflow_bundles: "{}",
  bazaar_get_payment_flow: '{\n  "serviceId": "risk-assessment-v0"\n}',
  bazaar_validate_service_card:
    '{\n  "serviceCard": {\n    "version": "bazaar.service-card/v0",\n    "id": "demo-oracle-v0",\n    "name": "Live Price Oracle",\n    "description": "Real-time Soroban price feeds",\n    "kind": "http",\n    "url": "https://api.example.com/oracle",\n    "routeTemplate": "/oracle/price",\n    "input": [{ "name": "symbol", "type": "string", "required": true }],\n    "network": "stellar:testnet",\n    "payment": {\n      "scheme": "exact",\n      "asset": "USDC",\n      "amount": "0.01",\n      "destination": "GDEMO123"\n    },\n    "provider": { "name": "Oracle Labs" },\n    "tags": ["oracle", "defi"]\n  }\n}',
};

export function WebMCPProvider() {
  const [status, setStatus] = useState<"initializing" | "ready" | "error">("initializing");
  const [isNative, setIsNative] = useState<boolean>(false);
  const [tools, setTools] = useState<WebMCPToolDefinition[]>([]);
  const [logs, setLogs] = useState<WebMCPActivityLog[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"activity" | "tools" | "tester">("activity");
  const [selectedTool, setSelectedTool] = useState<string>("bazaar_search_services");
  const [testPayload, setTestPayload] = useState<string>(PRESET_QUERIES.bazaar_search_services);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<string>("");
  const logContainerRef = useRef<HTMLDivElement>(null);
  const registryRef = useRef<ModelContextRegistry | null>(null);

  useEffect(() => {
    try {
      const nativeDetected = Boolean(
        (typeof navigator !== "undefined" && navigator.modelContext) ||
          (typeof document !== "undefined" && document.modelContext)
      );
      setIsNative(nativeDetected);

      const registry: ModelContextRegistry = initWebMCP();
      registryRef.current = registry;
      registerBazaarTools(registry);

      const toolList = registry.getTools?.() || [];
      setTools(toolList);
      setStatus("ready");

      const handleActivity = (e: Event) => {
        const customEvent = e as CustomEvent<WebMCPActivityLog>;
        if (customEvent.detail) {
          setLogs((prev) => [customEvent.detail, ...prev.slice(0, 99)]);
        }
      };

      window.addEventListener("webmcp-activity", handleActivity);
      return () => {
        window.removeEventListener("webmcp-activity", handleActivity);
      };
    } catch (err) {
      console.error("[WebMCP] Initialization error:", err);
      setStatus("error");
    }
  }, []);

  const handleToolChange = (toolName: string) => {
    setSelectedTool(toolName);
    if (PRESET_QUERIES[toolName]) {
      setTestPayload(PRESET_QUERIES[toolName]);
    }
  };

  const handleExecuteTool = async () => {
    setIsExecuting(true);
    try {
      let parsed = {};
      if (testPayload.trim()) {
        parsed = JSON.parse(testPayload);
      }
      if (window.__WEBMCP_EMULATOR__) {
        await window.__WEBMCP_EMULATOR__.executeTool(selectedTool, parsed);
      } else if (registryRef.current) {
        const tool = registryRef.current.getTools?.()?.find((t) => t.name === selectedTool);
        if (tool) {
          const res = await tool.execute(parsed);
          setLogs((prev) => [
            {
              id: "act_" + Math.random().toString(36).slice(2, 9),
              timestamp: new Date().toISOString(),
              toolName: selectedTool,
              input: parsed,
              output: res,
              durationMs: 12,
              status: "success",
            },
            ...prev,
          ]);
        }
      }
      setActiveTab("activity");
    } catch (err) {
      console.error("Execution error:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setLogs((prev) => [
        {
          id: "act_" + Math.random().toString(36).slice(2, 9),
          timestamp: new Date().toISOString(),
          toolName: selectedTool,
          input: {},
          durationMs: 0,
          status: "error",
          error: errorMessage,
        },
        ...prev,
      ]);
      setActiveTab("activity");
    } finally {
      setIsExecuting(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLogId(id);
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  const filteredLogs = logs.filter(
    (l) =>
      l.toolName.toLowerCase().includes(activityFilter.toLowerCase()) ||
      JSON.stringify(l.input).toLowerCase().includes(activityFilter.toLowerCase())
  );

  return (
    <>
      {/* Floating Status Pill */}
      <aside
        aria-label="WebMCP Status"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: "fixed",
          bottom: "16px",
          right: "16px",
          zIndex: 9999,
          fontSize: "12px",
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
          backgroundColor: isOpen ? "#030712" : "rgba(3, 7, 18, 0.9)",
          backdropFilter: "blur(12px)",
          border: isOpen ? "1px solid #38bdf8" : "1px solid rgba(56, 189, 248, 0.3)",
          borderRadius: "30px",
          padding: "8px 16px",
          color: "#e2e8f0",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          cursor: "pointer",
          boxShadow: isOpen
            ? "0 0 24px rgba(56, 189, 248, 0.25), 0 8px 32px rgba(0,0,0,0.8)"
            : "0 4px 20px rgba(0,0,0,0.6)",
          userSelect: "none",
          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <span
          style={{
            position: "relative",
            display: "flex",
            height: "10px",
            width: "10px",
          }}
        >
          {status === "ready" && (
            <span
              style={{
                position: "absolute",
                display: "inline-flex",
                height: "100%",
                width: "100%",
                borderRadius: "50%",
                backgroundColor: "#34d399",
                opacity: 0.75,
                animation: "ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite",
              }}
            />
          )}
          <span
            style={{
              position: "relative",
              display: "inline-flex",
              borderRadius: "50%",
              height: "10px",
              width: "10px",
              backgroundColor: status === "ready" ? "#10b981" : status === "error" ? "#ef4444" : "#f59e0b",
            }}
          />
        </span>
        <span style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>
          WebMCP: <span style={{ color: "#38bdf8" }}>{status === "ready" ? (isNative ? "Native W3C" : "Active (Polyfill)") : status}</span>
        </span>
        <span
          style={{
            backgroundColor: "rgba(56, 189, 248, 0.15)",
            color: "#38bdf8",
            padding: "2px 8px",
            borderRadius: "12px",
            fontSize: "10px",
            fontWeight: 700,
          }}
        >
          {tools.length} Tools
        </span>
        <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 500 }}>
          {isOpen ? "✕ Cerrar" : "▲ Agent Terminal"}
        </span>
      </aside>

      {/* Cyberpunk/Stellar Agent Live Terminal HUD (3:1 Widescreen Bottom Dock) */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "64px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "92vw",
            maxWidth: "1160px",
            height: "390px",
            zIndex: 9998,
            backgroundColor: "#030712",
            border: "1px solid #1e293b",
            borderRadius: "14px",
            boxShadow: "0 24px 60px rgba(0,0,0,0.9), 0 0 1px 1px rgba(56, 189, 248, 0.25)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
            color: "#e2e8f0",
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          {/* Terminal Window Top Bar */}
          <div
            style={{
              padding: "12px 16px",
              backgroundColor: "#090d16",
              borderBottom: "1px solid #1e293b",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#ef4444" }} />
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#f59e0b" }} />
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#10b981" }} />
              </div>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#f8fafc", letterSpacing: "0.02em" }}>
                STELLAR BAZAAR // WEBMCP TERMINAL
              </span>
              <span
                style={{
                  fontSize: "9px",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  backgroundColor: "rgba(14, 165, 233, 0.15)",
                  color: "#38bdf8",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                }}
              >
                W3C DRAFT SPEC
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: "14px",
                padding: "2px 6px",
              }}
            >
              ✕
            </button>
          </div>

          {/* Navigation Tabs Bar */}
          <div
            style={{
              display: "flex",
              backgroundColor: "#060a12",
              borderBottom: "1px solid #1e293b",
              fontSize: "11px",
              padding: "0 8px",
            }}
          >
            {(["activity", "tools", "tester"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "10px 16px",
                  background: activeTab === tab ? "rgba(56, 189, 248, 0.08)" : "transparent",
                  color: activeTab === tab ? "#38bdf8" : "#94a3b8",
                  border: "none",
                  borderBottom: activeTab === tab ? "2px solid #38bdf8" : "2px solid transparent",
                  cursor: "pointer",
                  fontWeight: activeTab === tab ? 700 : 500,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                {tab === "activity" && (
                  <>
                    <span>⚡ Live Feed</span>
                    <span
                      style={{
                        backgroundColor: activeTab === tab ? "#38bdf8" : "#1e293b",
                        color: activeTab === tab ? "#090d16" : "#cbd5e1",
                        fontSize: "9px",
                        padding: "1px 5px",
                        borderRadius: "10px",
                        fontWeight: "bold",
                      }}
                    >
                      {logs.length}
                    </span>
                  </>
                )}
                {tab === "tools" && (
                  <>
                    <span>🛠️ Tool Registry</span>
                    <span
                      style={{
                        backgroundColor: "#1e293b",
                        color: "#cbd5e1",
                        fontSize: "9px",
                        padding: "1px 5px",
                        borderRadius: "10px",
                      }}
                    >
                      {tools.length}
                    </span>
                  </>
                )}
                {tab === "tester" && <span>▶ Agent Simulator</span>}
              </button>
            ))}
          </div>

          {/* Body Content */}
          <div
            ref={logContainerRef}
            style={{
              padding: "14px",
              overflowY: "auto",
              flex: 1,
              backgroundColor: "#030712",
              fontSize: "12px",
            }}
          >
            {/* 1. ACTIVITY TAB */}
            {activeTab === "activity" && (
              <div>
                {/* Search / Filter Bar */}
                <div style={{ marginBottom: "12px", display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    placeholder="Filtrar por tool o payload..."
                    value={activityFilter}
                    onChange={(e) => setActivityFilter(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "6px 10px",
                      backgroundColor: "#0b1120",
                      border: "1px solid #1e293b",
                      borderRadius: "6px",
                      color: "#f8fafc",
                      fontSize: "11px",
                      fontFamily: "inherit",
                    }}
                  />
                  {logs.length > 0 && (
                    <button
                      onClick={() => setLogs([])}
                      style={{
                        padding: "6px 10px",
                        backgroundColor: "#1e293b",
                        border: "none",
                        borderRadius: "6px",
                        color: "#94a3b8",
                        cursor: "pointer",
                        fontSize: "10px",
                      }}
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                {filteredLogs.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      color: "#64748b",
                      padding: "48px 16px",
                      backgroundColor: "#080d1a",
                      borderRadius: "8px",
                      border: "1px dashed #1e293b",
                    }}
                  >
                    <div style={{ fontSize: "28px", marginBottom: "8px" }}>📡</div>
                    <p style={{ fontWeight: 600, color: "#94a3b8", marginBottom: "4px" }}>Esperando llamadas de agentes WebMCP...</p>
                    <p style={{ fontSize: "11px", color: "#64748b" }}>
                      Prueba disparar una simulación en la pestaña <strong>Agent Simulator</strong> o ejecuta <code>window.__WEBMCP_EMULATOR__.executeTool(...)</code> en la consola.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {filteredLogs.map((log) => (
                      <div
                        key={log.id}
                        style={{
                          backgroundColor: "#080d1a",
                          border: `1px solid ${log.status === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                          borderRadius: "8px",
                          padding: "10px 12px",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span
                              style={{
                                width: "6px",
                                height: "6px",
                                borderRadius: "50%",
                                backgroundColor: log.status === "success" ? "#10b981" : "#ef4444",
                              }}
                            />
                            <strong style={{ color: "#38bdf8", fontSize: "12px" }}>{log.toolName}</strong>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ color: "#64748b", fontSize: "10px" }}>{log.durationMs} ms</span>
                            <button
                              onClick={() => copyToClipboard(JSON.stringify(log, null, 2), log.id)}
                              style={{
                                background: "#1e293b",
                                border: "none",
                                borderRadius: "4px",
                                color: "#cbd5e1",
                                fontSize: "9px",
                                padding: "2px 6px",
                                cursor: "pointer",
                              }}
                            >
                              {copiedLogId === log.id ? "✓ Copiado" : "Copiar"}
                            </button>
                          </div>
                        </div>

                        {/* Input Box */}
                        <div style={{ marginBottom: "6px" }}>
                          <div style={{ fontSize: "9px", textTransform: "uppercase", color: "#64748b", marginBottom: "2px" }}>Input Args</div>
                          <pre
                            style={{
                              margin: 0,
                              padding: "6px 8px",
                              backgroundColor: "#030712",
                              borderRadius: "4px",
                              fontSize: "10px",
                              color: "#93c5fd",
                              overflowX: "auto",
                            }}
                          >
                            {JSON.stringify(log.input, null, 2)}
                          </pre>
                        </div>

                        {/* Output Box */}
                        {Boolean(log.output) && (
                          <div>
                            <div style={{ fontSize: "9px", textTransform: "uppercase", color: "#64748b", marginBottom: "2px" }}>Output Result</div>
                            <pre
                              style={{
                                margin: 0,
                                padding: "6px 8px",
                                backgroundColor: "#030712",
                                borderRadius: "4px",
                                fontSize: "10px",
                                color: "#86efac",
                                maxHeight: "120px",
                                overflowY: "auto",
                              }}
                            >
                              {JSON.stringify(log.output, null, 2)}
                            </pre>
                          </div>
                        )}

                        {log.error && (
                          <div
                            style={{
                              marginTop: "6px",
                              padding: "6px 8px",
                              backgroundColor: "rgba(239, 68, 68, 0.15)",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              borderRadius: "4px",
                              color: "#fca5a5",
                              fontSize: "10px",
                            }}
                          >
                            Error: {log.error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 2. TOOLS TAB */}
            {activeTab === "tools" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>
                  Herramientas W3C WebMCP registradas y expuestas al contexto del navegador:
                </div>
                {tools.map((t) => (
                  <div
                    key={t.name}
                    style={{
                      backgroundColor: "#080d1a",
                      border: "1px solid #1e293b",
                      borderRadius: "8px",
                      padding: "12px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
                      <div style={{ color: "#38bdf8", fontWeight: 700, fontSize: "12px" }}>{t.name}</div>
                      <button
                        onClick={() => {
                          handleToolChange(t.name);
                          setActiveTab("tester");
                        }}
                        style={{
                          backgroundColor: "#0284c7",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "4px",
                          padding: "3px 8px",
                          fontSize: "10px",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        Probar en Tester →
                      </button>
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: "11px", marginBottom: "8px", lineHeight: "1.4" }}>
                      {t.description}
                    </div>
                    <div style={{ fontSize: "9px", textTransform: "uppercase", color: "#64748b", marginBottom: "2px" }}>Input Schema</div>
                    <pre
                      style={{
                        margin: 0,
                        padding: "6px 8px",
                        backgroundColor: "#030712",
                        borderRadius: "4px",
                        fontSize: "10px",
                        color: "#94a3b8",
                        overflowX: "auto",
                      }}
                    >
                      {JSON.stringify(t.inputSchema || {}, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}

            {/* 3. TESTER TAB (Widescreen 2-column layout) */}
            {activeTab === "tester" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", height: "100%" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div>
                    <label style={{ display: "block", color: "#cbd5e1", fontSize: "11px", fontWeight: 600, marginBottom: "6px" }}>
                      1. Selecciona la Herramienta WebMCP:
                    </label>
                    <select
                      value={selectedTool}
                      onChange={(e) => handleToolChange(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        backgroundColor: "#0b1120",
                        border: "1px solid #334155",
                        borderRadius: "6px",
                        color: "#f8fafc",
                        fontSize: "11px",
                        fontFamily: "inherit",
                      }}
                    >
                      {tools.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ padding: "10px", backgroundColor: "#080d1a", borderRadius: "6px", border: "1px solid #1e293b", flex: 1 }}>
                    <div style={{ color: "#38bdf8", fontWeight: 700, fontSize: "11px", marginBottom: "4px" }}>
                      {selectedTool}
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: "10px", lineHeight: "1.4" }}>
                      {tools.find((t) => t.name === selectedTool)?.description}
                    </div>
                  </div>

                  <button
                    onClick={handleExecuteTool}
                    disabled={isExecuting}
                    style={{
                      padding: "10px",
                      backgroundColor: isExecuting ? "#075985" : "#0284c7",
                      border: "none",
                      borderRadius: "6px",
                      color: "#ffffff",
                      fontWeight: 700,
                      cursor: isExecuting ? "not-allowed" : "pointer",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      boxShadow: "0 4px 12px rgba(2, 132, 199, 0.4)",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {isExecuting ? "⚡ Ejecutando en navegador..." : "▶ Disparar Simulación de Agente IA"}
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <label style={{ color: "#cbd5e1", fontSize: "11px", fontWeight: 600 }}>2. Payload de Entrada (JSON):</label>
                    <button
                      onClick={() => PRESET_QUERIES[selectedTool] && setTestPayload(PRESET_QUERIES[selectedTool])}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#38bdf8",
                        fontSize: "10px",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      Restaurar Preset
                    </button>
                  </div>
                  <textarea
                    rows={9}
                    value={testPayload}
                    onChange={(e) => setTestPayload(e.target.value)}
                    style={{
                      flex: 1,
                      width: "100%",
                      padding: "10px",
                      backgroundColor: "#030712",
                      border: "1px solid #334155",
                      borderRadius: "6px",
                      color: "#38bdf8",
                      fontSize: "11px",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                      lineHeight: "1.4",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
