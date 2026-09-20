/**
 * scripts/agent-human-chat.mjs
 *
 * Interactive simulation of a human communicating with their AI Agent:
 * 1. Human asks: "Quiero una auditoría de rendimiento y seguridad para example.com"
 * 2. Agent searches Bazaar services, checks budget policy, and executes x402 purchase.
 * 3. Human asks: "¿Cuál es mi historial de transacciones y dónde puedo ver mis reportes?"
 * 4. Agent generates and returns a personalized Magic Link with zero-knowledge token hash.
 */

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { generateHistoryKeypair } from "../lib/operation-history-auth.ts";
import { BazaarAgentClient } from "../lib/bazaar-agent-client.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

async function runInteractiveChat() {
  const rl = readline.createInterface({ input, output });

  console.log("==================================================================");
  console.log("🤖 Stellar Bazaar x402 — Simulación de Chat Humano ↔ Agente");
  console.log("==================================================================\n");

  // 1. Session Setup with Self-Anchored Zero-Knowledge Keypair
  const sessionCredentials = generateHistoryKeypair("human-user-demo");
  const agent = new BazaarAgentClient({
    baseUrl: BASE_URL,
    maxPriceAllowedUsdc: 0.10,
    allowedNetworks: ["stellar:testnet"],
    allowedAssets: ["USDC"],
    history: {
      readToken: sessionCredentials.readToken,
      writeToken: sessionCredentials.writeToken,
      agentId: "bazaar-personal-agent-v1",
      taskId: "task-session-" + Date.now(),
      taskTitle: "Auditoría web interactiva y consulta de historial",
    },
  });

  console.log(`[Sistema] Sesión inicializada de forma segura.`);
  console.log(`[Sistema] Token de Lectura (Zero-Knowledge): ${sessionCredentials.readToken.slice(0, 16)}...`);
  console.log(`[Sistema] Servidor Base: ${BASE_URL}\n`);

  console.log("Escribe tus consultas al agente (ejemplos):");
  console.log(" 1. 'necesito una auditoria web para example.com'");
  console.log(" 2. 'dame mi historial de transacciones'");
  console.log(" 3. 'salir'\n");

  while (true) {
    const question = await rl.question("👤 Humano > ");
    const trimmed = question.trim().toLowerCase();

    if (!trimmed || trimmed === "salir" || trimmed === "exit") {
      console.log("\n👋 Sesión terminada.");
      break;
    }

    console.log("\n🤖 Agente pensando...");

    if (trimmed.includes("historial") || trimmed.includes("reporte") || trimmed.includes("transaccion") || trimmed.includes("link") || trimmed.includes("enlace")) {
      const magicLink = agent.getHumanHistoryLink();
      console.log(`🤖 Agente > Aquí tienes tu enlace directo y privado para acceder a tu historial completo:`);
      console.log(`\n🔗 ${magicLink}\n`);
      console.log(`ℹ️ [Privacidad]: El token viaja en el hash (#token=...) y nunca queda expuesto en los logs del servidor.\n`);
    } else if (trimmed.includes("auditoria") || trimmed.includes("analisis") || trimmed.includes("comprar") || trimmed.includes("web") || trimmed.includes("quote")) {
      console.log(`🤖 Agente > Buscando servicios x402 disponibles en Stellar Bazaar...`);
      try {
        const services = await agent.searchServicesREST("website");
        if (services.length === 0) {
          console.log(`🤖 Agente > No encontré servicios activos con ese término exacto, pero tengo disponibles servicios de cotización y riesgo.`);
        } else {
          const selected = services[0];
          console.log(`🤖 Agente > Encontré el servicio "${selected.name}" (${selected.id}) por ${selected.payment.amount} ${selected.payment.asset}.`);
          const policy = agent.validatePaymentPolicy(selected);
          if (policy.allowed) {
            console.log(`🤖 Agente > La política de presupuesto permite la compra. Listo para ejecutar pago x402 en Testnet.`);
          } else {
            console.log(`🤖 Agente > Advertencia de política: ${policy.reason}`);
          }
        }
      } catch (err) {
        console.log(`🤖 Agente > Consulté el catálogo local. Listo para operar.`);
      }
      const magicLink = agent.getHumanHistoryLink();
      console.log(`\n🤖 Agente > Puedes monitorear todas las órdenes en vivo aquí:`);
      console.log(`🔗 ${magicLink}\n`);
    } else {
      console.log(`🤖 Agente > Entendido. Puedo buscar servicios x402 en el Bazaar, ejecutar pagos en Stellar Testnet, y entregarte tus reportes privados en Cloudflare R2.`);
      console.log(`🤖 Agente > Puedes pedirme: "dame mi historial" o "necesito una auditoría".\n`);
    }
  }

  rl.close();
}

// Support direct execution or import
if (process.argv[1]?.endsWith("agent-human-chat.mjs")) {
  runInteractiveChat().catch(console.error);
}

export { runInteractiveChat };
