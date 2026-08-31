"use client";

import { useEffect, useState } from "react";
import { initWebMCP } from "@/lib/webmcp/polyfill";
import { registerBazaarTools } from "@/lib/webmcp/register";
import { ModelContextRegistry, WebMCPActivityLog, WebMCPToolDefinition } from "@/lib/webmcp/types";

export function WebMCPProvider() {
  const [status, setStatus] = useState<"initializing" | "ready" | "error">("initializing");
  const [isNative, setIsNative] = useState<boolean>(false);
  const [tools, setTools] = useState<WebMCPToolDefinition[]>([]);
  const [logs, setLogs] = useState<WebMCPActivityLog[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"activity" | "tools" | "tester">("activity");
  const [selectedTool, setSelectedTool] = useState<string>("bazaar_search_services");
  const [testPayload, setTestPayload] = useState<string>('{\n  "query": "finance"\n}');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);

  useEffect(() => {
    try {
      const nativeDetected = Boolean(
        (typeof navigator !== "undefined" && navigator.modelContext) ||
        (typeof document !== "undefined" && document.modelContext)
      );
      setIsNative(nativeDetected);

      const registry: ModelContextRegistry = initWebMCP();
      registerBazaarTools(registry);

      const toolList = registry.getTools?.() || [];
      setTools(toolList);
      setStatus("ready");

      const handleActivity = (e: Event) => {
        const customEvent = e as CustomEvent<WebMCPActivityLog>;
        if (customEvent.detail) {
          setLogs((prev) => [customEvent.detail, ...prev.slice(0, 49)]);
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

  const handleExecuteTool = async () => {
    setIsExecuting(true);
    try {
      let parsed = {};
      if (testPayload.trim()) {
        parsed = JSON.parse(testPayload);
      }
      if (window.__WEBMCP_EMULATOR__) {
        await window.__WEBMCP_EMULATOR__.executeTool(selectedTool, parsed);
      }
    } catch (err) {
      console.error("Execution error:", err);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <>
      {/* Floating Status Pill */}
      <aside
        aria-label="WebMCP Status"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: "fixed",
          bottom: "12px",
          right: "12px",
          zIndex: 9999,
          fontSize: "11px",
          fontFamily: "monospace",
          backgroundColor: isOpen ? "#0f172a" : "rgba(15, 23, 42, 0.85)",
          backdropFilter: "blur(8px)",
          border: isOpen ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "8px",
          padding: "7px 12px",
          color: "#94a3b8",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          userSelect: "none",
          transition: "all 0.2s ease",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: status === "ready" ? "#10b981" : status === "error" ? "#ef4444" : "#f59e0b",
            boxShadow: status === "ready" ? "0 0 8px #10b981" : "none",
          }}
        />
        <span>
          WebMCP: <strong style={{ color: "#f8fafc" }}>{status === "ready" ? (isNative ? "Native W3C" : "Active (Polyfill)") : status}</strong>
          {status === "ready" && ` • ${tools.length} tools`}
        </span>
        <span style={{ color: "#38bdf8", marginLeft: "4px", fontSize: "10px" }}>{isOpen ? "▼ Cerrar" : "▲ Agent Console"}</span>
      </aside>

      {/* Interactive WebMCP Live Drawer */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "48px",
            right: "12px",
            width: "480px",
            maxHeight: "560px",
            zIndex: 9998,
            backgroundColor: "#090d16",
            border: "1px solid #1e293b",
            borderRadius: "10px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.7)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "monospace",
            color: "#cbd5e1",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "10px 14px",
              backgroundColor: "#0f172a",
              borderBottom: "1px solid #1e293b",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "14px" }}>🤖</span>
              <strong style={{ color: "#f8fafc", fontSize: "12px" }}>WebMCP Agent Live Console</strong>
              <span style={{ fontSize: "9px", padding: "2px 6px", borderRadius: "4px", backgroundColor: "#1e293b", color: "#38bdf8" }}>
                W3C Draft
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#64748b",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              ✕
            </button>
          </div>

          {/* Navigation Tabs */}
          <div
            style={{
              display: "flex",
              backgroundColor: "#0b1120",
              borderBottom: "1px solid #1e293b",
              fontSize: "11px",
            }}
          >
            {(["activity", "tools", "tester"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  background: activeTab === tab ? "#1e293b" : "transparent",
                  color: activeTab === tab ? "#38bdf8" : "#64748b",
                  border: "none",
                  borderBottom: activeTab === tab ? "2px solid #38bdf8" : "2px solid transparent",
                  cursor: "pointer",
                  fontWeight: activeTab === tab ? "bold" : "normal",
                  textTransform: "capitalize",
                }}
              >
                {tab === "activity" && `Activity (${logs.length})`}
                {tab === "tools" && `Tools (${tools.length})`}
                {tab === "tester" && "Agent Tester"}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div style={{ padding: "12px", overflowY: "auto", flex: 1, maxHeight: "420px", fontSize: "11px" }}>
            {activeTab === "activity" && (
              <div>
                {logs.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#64748b", padding: "24px 0" }}>
                    <p>No se han registrado llamadas de agentes aún.</p>
                    <p style={{ fontSize: "10px", marginTop: "6px" }}>
                      Usa la pestaña <strong>Agent Tester</strong> o ejecuta herramientas en la consola.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        style={{
                          backgroundColor: "#0f172a",
                          border: `1px solid ${log.status === "success" ? "#10b98133" : "#ef444433"}`,
                          borderRadius: "6px",
                          padding: "8px 10px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <span style={{ color: "#38bdf8", fontWeight: "bold" }}>{log.toolName}</span>
                          <span style={{ color: "#64748b", fontSize: "10px" }}>{log.durationMs}ms</span>
                        </div>
                        <div style={{ fontSize: "10px", color: "#94a3b8", marginBottom: "4px" }}>
                          <strong>Input:</strong> {JSON.stringify(log.input)}
                        </div>
                        {Boolean(log.output) && (
                          <div style={{ fontSize: "10px", color: "#a7f3d0", maxHeight: "80px", overflowY: "auto" }}>
                            <strong>Output:</strong> {JSON.stringify(log.output, null, 2)}
                          </div>
                        )}
                        {log.error && <div style={{ fontSize: "10px", color: "#f87171" }}>Error: {log.error}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "tools" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {tools.map((t) => (
                  <div
                    key={t.name}
                    style={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #1e293b",
                      borderRadius: "6px",
                      padding: "8px 10px",
                    }}
                  >
                    <div style={{ color: "#38bdf8", fontWeight: "bold", marginBottom: "3px" }}>{t.name}</div>
                    <div style={{ color: "#94a3b8", fontSize: "10px", marginBottom: "6px" }}>{t.description}</div>
                    <pre
                      style={{
                        margin: 0,
                        padding: "4px 6px",
                        backgroundColor: "#020617",
                        borderRadius: "4px",
                        fontSize: "9px",
                        color: "#64748b",
                        overflowX: "auto",
                      }}
                    >
                      {JSON.stringify(t.inputSchema || {}, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "tester" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", color: "#94a3b8", fontSize: "10px", marginBottom: "4px" }}>
                    Select WebMCP Tool:
                  </label>
                  <select
                    value={selectedTool}
                    onChange={(e) => setSelectedTool(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px",
                      backgroundColor: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: "4px",
                      color: "#f8fafc",
                      fontSize: "11px",
                      fontFamily: "monospace",
                    }}
                  >
                    {tools.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", color: "#94a3b8", fontSize: "10px", marginBottom: "4px" }}>
                    Input Payload (JSON):
                  </label>
                  <textarea
                    rows={4}
                    value={testPayload}
                    onChange={(e) => setTestPayload(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px",
                      backgroundColor: "#020617",
                      border: "1px solid #334155",
                      borderRadius: "4px",
                      color: "#38bdf8",
                      fontSize: "10px",
                      fontFamily: "monospace",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <button
                  onClick={handleExecuteTool}
                  disabled={isExecuting}
                  style={{
                    padding: "8px",
                    backgroundColor: "#0284c7",
                    border: "none",
                    borderRadius: "4px",
                    color: "#ffffff",
                    fontWeight: "bold",
                    cursor: "pointer",
                    fontSize: "11px",
                  }}
                >
                  {isExecuting ? "Executing..." : "▶ Simulate AI Agent Call"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
