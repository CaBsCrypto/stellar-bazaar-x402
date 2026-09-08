import type { ActivityInput } from "./activity.ts";
import type { HistoryClientOptions } from "./operation-history-client.ts";
export async function appendActivity(
  baseUrl: string,
  options: HistoryClientOptions,
  event: ActivityInput,
): Promise<"recorded" | "failed"> {
  try {
    const base = new URL(baseUrl);
    if (
      base.username ||
      base.password ||
      (base.protocol !== "https:" &&
        !(
          base.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(base.hostname)
        ))
    )
      return "failed";
    const response = await fetch(new URL("/api/activity", base), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + options.writeToken,
      },
      body: JSON.stringify(event),
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? "recorded" : "failed";
  } catch {
    return "failed";
  }
}
