import type { ServiceCard } from "./types";

export interface ConformanceNotificationPayload {
  serviceId: string;
  serviceName: string;
  provider: string;
  destinationWallet?: string;
  price?: string;
  url?: string;
  source: "web-publish" | "api-conformance" | "mcp-validate";
  valid: boolean;
  failedRules?: string[];
  timestamp: string;
}

export async function notifyAdminOnValidation(payload: ConformanceNotificationPayload): Promise<void> {
  // Fire and forget - never block the user request if notification fails
  try {
    const adminEmail = process.env.ADMIN_ALERT_EMAIL;
    const resendApiKey = process.env.RESEND_API_KEY;
    const webhookUrl = process.env.ADMIN_WEBHOOK_URL; // Discord / Telegram / Slack webhook

    const subject = payload.valid
      ? `🟢 [Stellar Bazaar] Nuevo Servicio Validado con Éxito: ${payload.serviceName}`
      : `⚠️ [Stellar Bazaar] Intento de Validación Fallido: ${payload.serviceName}`;

    const bodyText = [
      `Servicio: ${payload.serviceName} (${payload.serviceId})`,
      `Proveedor: ${payload.provider}`,
      `Precio: ${payload.price ?? "N/A"}`,
      `Wallet de Cobro: ${payload.destinationWallet ?? "N/A"}`,
      `URL Endpoint: ${payload.url ?? "N/A"}`,
      `Origen: ${payload.source}`,
      `Estado: ${payload.valid ? "VALIDADO (11 Reglas OK)" : "FALLIDO"}`,
      payload.failedRules && payload.failedRules.length > 0 ? `Reglas que fallaron: ${payload.failedRules.join(", ")}` : "",
      `Fecha: ${payload.timestamp}`,
    ].filter(Boolean).join("\n");

    // 1. Email alert via Resend (if configured)
    if (resendApiKey && adminEmail) {
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Stellar Bazaar Alerts <alerts@stellar-bazaar.app>",
          to: adminEmail,
          subject,
          text: bodyText,
        }),
      }).catch((e) => console.warn("[ADMIN_NOTIFIER_EMAIL_FAIL]", e));
    }

    // 2. Webhook alert via Discord / Slack / Telegram (if configured)
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `**${subject}**\n\`\`\`\n${bodyText}\n\`\`\``,
        }),
      }).catch((e) => console.warn("[ADMIN_NOTIFIER_WEBHOOK_FAIL]", e));
    }

    // 3. Fallback server log
    console.log(`[CONFORMANCE_ALERT] [${payload.valid ? "VALID" : "INVALID"}] ${payload.serviceName} (${payload.source}) -> ${payload.destinationWallet ?? "no-wallet"}`);
  } catch (error) {
    console.warn("[ADMIN_NOTIFIER_ERROR]", error);
  }
}
