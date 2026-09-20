"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { WebMCPClientAdapter } from "@/lib/webmcp-client-adapter";
import type { WebMCPToolDefinition, WebMCPActivityLog } from "@/lib/webmcp/types";

export function WebMCPPlayground() {
  const [adapter, setAdapter] = useState<WebMCPClientAdapter | null>(null);
  const [tools, setTools] = useState<WebMCPToolDefinition[]>([]);
  const [selectedTool, setSelectedTool] = useState<WebMCPToolDefinition | null>(null);
  const [inputJson, setInputJson] = useState("{}");
  const [output, setOutput] = useState<unknown | null>(null);
  const [logs, setLogs] = useState<WebMCPActivityLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = new WebMCPClientAdapter({
      onActivityLog: (log) => {
        setLogs((prev) => [log, ...prev].slice(0, 20));
      },
    });

    const { tools: registered } = client.init();
    setAdapter(client);
    setTools(registered);
    if (registered.length > 0) {
      setSelectedTool(registered[0]);
      setDefaultInputForTool(registered[0]);
    }
  }, []);

  const setDefaultInputForTool = (tool: WebMCPToolDefinition) => {
    if (!tool.inputSchema?.properties) {
      setInputJson("{}");
      return;
    }
    const sample: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
      if (prop.type === "string") sample[key] = prop.enum ? prop.enum[0] : "";
      else if (prop.type === "number") sample[key] = 0.05;
      else if (prop.type === "boolean") sample[key] = true;
      else sample[key] = null;
    }
    setInputJson(JSON.stringify(sample, null, 2));
  };

  const handleSelectTool = (tool: WebMCPToolDefinition) => {
    setSelectedTool(tool);
    setError(null);
    setOutput(null);
    setDefaultInputForTool(tool);
  };

  const handleExecute = async () => {
    if (!adapter || !selectedTool) return;
    setBusy(true);
    setError(null);
    setOutput(null);

    try {
      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = JSON.parse(inputJson || "{}");
      } catch {
        throw new Error("El JSON de entrada no es válido.");
      }

      const result = await adapter.executeTool(selectedTool.name, parsedInput);
      setOutput(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="webmcp-playground" style={{ maxWidth: 1080, margin: "0 auto", padding: "1.5rem 1rem" }}>
      <header style={{ marginBottom: "1.5rem", borderBottom: "1px solid #232834", paddingBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <span style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8ab4f8", fontWeight: 600 }}>
              WEBMCP CLIENT ENVIRONMENT · FRONTEND TOOLING
            </span>
            <h1 style={{ fontSize: "1.6rem", margin: "0.2rem 0" }}>WebMCP Tools Playground</h1>
            <p style={{ color: "#9aa0a6", margin: 0, fontSize: "0.95rem" }}>
              Explora, inspecciona y ejecuta herramientas del catálogo de Stellar Bazaar mediante el estándar WebMCP directamente en el navegador.
            </p>
          </div>
          <span style={{ fontSize: "0.8rem", background: "rgba(138, 180, 248, 0.1)", color: "#8ab4f8", border: "1px solid rgba(138, 180, 248, 0.2)", borderRadius: 16, padding: "4px 12px" }}>
            {tools.length} Herramientas WebMCP Registradas
          </span>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "1.5rem" }}>
        {/* Tools Sidebar */}
        <aside style={{ background: "#13161c", border: "1px solid #232834", borderRadius: 8, padding: "1rem", height: "fit-content" }}>
          <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#9aa0a6", marginBottom: "0.8rem" }}>
            Herramientas Disponibles
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {tools.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => handleSelectTool(t)}
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: selectedTool?.name === t.name ? "1px solid #2563eb" : "1px solid transparent",
                  background: selectedTool?.name === t.name ? "#1a4980" : "rgba(255,255,255,0.02)",
                  color: selectedTool?.name === t.name ? "#ffffff" : "#c4c7c5",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                <code>{t.name}</code>
              </button>
            ))}
          </div>
        </aside>

        {/* Execution Pane */}
        <main style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {selectedTool ? (
            <div style={{ background: "#13161c", border: "1px solid #232834", borderRadius: 8, padding: "1.2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.8rem" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.2rem", color: "#8ab4f8" }}><code>{selectedTool.name}</code></h3>
                  <p style={{ margin: "0.3rem 0 0", color: "#9aa0a6", fontSize: "0.9rem" }}>{selectedTool.description}</p>
                </div>
              </div>

              {/* Schema inspection */}
              {selectedTool.inputSchema && (
                <details style={{ marginBottom: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: "0.5rem 0.8rem" }}>
                  <summary style={{ cursor: "pointer", fontSize: "0.82rem", color: "#8ab4f8" }}>
                    Ver Input Schema (JSON Schema)
                  </summary>
                  <pre style={{ fontSize: "0.78rem", color: "#c4c7c5", margin: "0.5rem 0 0", overflowX: "auto" }}>
                    {JSON.stringify(selectedTool.inputSchema, null, 2)}
                  </pre>
                </details>
              )}

              {/* Input Form */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                  Parámetros de Entrada (JSON):
                </label>
                <textarea
                  rows={6}
                  value={inputJson}
                  onChange={(e) => setInputJson(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#0c0e12",
                    border: "1px solid #2d3748",
                    borderRadius: 6,
                    color: "#ffffff",
                    fontFamily: "monospace",
                    fontSize: "0.85rem",
                    padding: "0.6rem",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "0.8rem", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={handleExecute}
                  disabled={busy}
                  style={{
                    padding: "8px 18px",
                    background: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 6,
                    fontWeight: 600,
                    cursor: busy ? "not-allowed" : "pointer",
                    opacity: busy ? 0.7 : 1,
                  }}
                >
                  {busy ? "Ejecutando..." : "▶ Ejecutar Herramienta"}
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultInputForTool(selectedTool)}
                  style={{
                    padding: "8px 14px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 6,
                    color: "#e8eaed",
                    cursor: "pointer",
                  }}
                >
                  Restaurar Ejemplo
                </button>
              </div>

              {/* Error Output */}
              {error && (
                <div style={{ marginTop: "1rem", padding: "0.8rem", background: "rgba(234, 67, 53, 0.15)", border: "1px solid rgba(234, 67, 53, 0.4)", borderRadius: 6, color: "#f28b82" }}>
                  <strong>Error:</strong> {error}
                </div>
              )}

              {/* Success Output */}
              {output !== null && (
                <div style={{ marginTop: "1rem" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#81c995", marginBottom: "0.4rem" }}>
                    ✓ Resultado de Ejecución:
                  </div>
                  <pre style={{ background: "#0c0e12", border: "1px solid #2d3748", borderRadius: 6, padding: "0.8rem", fontSize: "0.8rem", color: "#e8eaed", overflowX: "auto", maxHeight: 320 }}>
                    {JSON.stringify(output, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: "#13161c", border: "1px solid #232834", borderRadius: 8, padding: "2rem", textAlign: "center", color: "#9aa0a6" }}>
              Selecciona una herramienta del panel izquierdo para comenzar.
            </div>
          )}

          {/* Activity Logs */}
          <section style={{ background: "#13161c", border: "1px solid #232834", borderRadius: 8, padding: "1.2rem" }}>
            <h3 style={{ fontSize: "1rem", margin: "0 0 0.8rem", color: "#e8eaed" }}>Registro de Actividad WebMCP</h3>
            {logs.length === 0 ? (
              <p style={{ margin: 0, color: "#9aa0a6", fontSize: "0.85rem" }}>Aún no se han ejecutado herramientas en esta sesión.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {logs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 10px",
                      background: "rgba(0,0,0,0.2)",
                      borderRadius: 4,
                      fontSize: "0.8rem",
                      borderLeft: log.status === "success" ? "3px solid #81c995" : "3px solid #f28b82",
                    }}
                  >
                    <div>
                      <code>{log.toolName}</code>
                      <span style={{ color: "#9aa0a6", marginLeft: "0.5rem" }}>({log.durationMs}ms)</span>
                    </div>
                    <span style={{ color: log.status === "success" ? "#81c995" : "#f28b82", fontSize: "0.75rem" }}>
                      {log.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </section>
  );
}
