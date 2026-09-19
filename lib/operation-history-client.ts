/** Buyer-controlled journal transport. It never signs or retries a payment. */
export interface HistoryClientOptions {
  writeToken: string;
  readToken?: string;
  taskId?: string;
  taskTitle?: string;
  mode?: "fixture" | "mock" | "testnet";
  agentId?: string;
  includeResult?: boolean;
  preserveFiles?: boolean;
}

export function formatHumanHistoryUrl(baseUrl: string, readToken: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/history#token=${encodeURIComponent(readToken.trim())}`;
}

export function decimalToAtomic(value: string): string {
  if (!/^(0|[1-9]\d*)(\.\d{1,7})?$/.test(value)) throw new Error("INVALID_HISTORY_AMOUNT");
  const [whole, fraction = ""] = value.split(".");
  return (BigInt(whole) * 10000000n + BigInt(fraction.padEnd(7, "0"))).toString();
}

export async function appendOperationHistory(baseUrl: string, options: HistoryClientOptions, record: unknown): Promise<"recorded" | "failed"> {
  try {
    const base = new URL(baseUrl);
    if (base.username || base.password || (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname)))) return "failed";
    const response = await fetch(new URL("/api/operations", base), {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.writeToken}` },
      body: JSON.stringify(record),
    });
    return response.ok ? "recorded" : "failed";
  } catch { return "failed"; }
}
