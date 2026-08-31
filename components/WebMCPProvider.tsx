"use client";

import { useEffect, useState } from "react";
import { initWebMCP } from "@/lib/webmcp/polyfill";
import { registerBazaarTools } from "@/lib/webmcp/register";
import { ModelContextRegistry } from "@/lib/webmcp/types";

export function WebMCPProvider() {
  const [status, setStatus] = useState<"initializing" | "ready" | "error">("initializing");
  const [registeredToolsCount, setRegisteredToolsCount] = useState<number>(0);
  const [isNative, setIsNative] = useState<boolean>(false);

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
      setRegisteredToolsCount(toolList.length || 4);
      setStatus("ready");

      console.info(
        `%c[WebMCP] ✨ Initialized successfully (${nativeDetected ? "Native W3C" : "Polyfill"} Mode) with ${toolList.length || 4} tools`,
        "color: #10b981; font-weight: bold;"
      );
    } catch (err) {
      console.error("[WebMCP] Initialization error:", err);
      setStatus("error");
    }
  }, []);

  return (
    <aside
      aria-label="WebMCP Status"
      style={{
        position: "fixed",
        bottom: "12px",
        right: "12px",
        zIndex: 9999,
        fontSize: "11px",
        fontFamily: "monospace",
        backgroundColor: "rgba(15, 23, 42, 0.85)",
        backdropFilter: "blur(6px)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "6px",
        padding: "6px 10px",
        color: "#94a3b8",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: status === "ready" ? "#10b981" : status === "error" ? "#ef4444" : "#f59e0b",
        }}
      />
      <span>
        WebMCP: <strong style={{ color: "#f8fafc" }}>{status === "ready" ? (isNative ? "Native" : "Active (Polyfill)") : status}</strong>
        {status === "ready" && ` (${registeredToolsCount} tools)`}
      </span>
    </aside>
  );
}
