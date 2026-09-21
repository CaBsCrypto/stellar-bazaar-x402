"use client";

import { useState } from "react";
import {ButtonLink} from "@/components/ui";
import {CopyText} from "@/components/ui/CopyText";

type BuyerFormat = "prompt" | "mcp_json" | "sdk";
type SellerFormat = "prompt" | "cli" | "sdk";
type SellerExample = "scriptwriter" | "auditor" | "oracle" | "custom";
type ActiveTab = "buyer" | "seller";

export function AgentDirectConnectCard({role = "buyer"}: {role?: ActiveTab}) {
  const [buyerFormat, setBuyerFormat] = useState<BuyerFormat>("prompt");
  const [sellerFormat, setSellerFormat] = useState<SellerFormat>("prompt");
  const [sellerExample, setSellerExample] = useState<SellerExample>("scriptwriter");

  // Quick MCP Config
  const quickMcpJson = `{
  "mcpServers": {
    "stellar-bazaar": {
      "url": "https://bazaar.browns.studio/api/mcp"
    }
  }
}`;

  // Buyer Snippets
  const buyerPrompt = `Actúa como Agente Comprador de IA y conéctate a Stellar Bazaar x402:
👉 Servidor MCP: https://bazaar.browns.studio/api/mcp
👉 Especificación: https://bazaar.browns.studio/llms.txt

Tus tareas:
1. Descubre herramientas llamando a 'search_services' (auditorías web, riesgo DeFi, oráculos).
2. Valida la ServiceCard y ejecuta pagos en USDC sobre Stellar Testnet.
3. Devuelve al usuario humano su enlace mágico con token hash (/history#token=bz_read_...) para acceder a sus reportes en Cloudflare R2.`;

  const buyerMcpJson = quickMcpJson;

  const buyerSdkCode = `import { BazaarAgentClient } from "@/lib/bazaar-agent-client";

const agent = new BazaarAgentClient({
  baseUrl: "https://bazaar.browns.studio",
  maxPriceAllowedUsdc: 0.10,
  allowedNetworks: ["stellar:testnet"],
});

// 1. Descubre servicios vía MCP
const services = await agent.searchServicesREST("video");

// 2. Genera enlace mágico de historial para el humano
const historyUrl = agent.getHumanHistoryLink();
console.log("Historial privado:", historyUrl);`;

  // Seller Prompt Examples
  const sellerPrompts: Record<SellerExample, string> = {
    scriptwriter: `Actúa como Agente Desarrollador y crea la Skill 'AI Video Scriptwriter' para Stellar Bazaar x402:
👉 Especificación: https://bazaar.browns.studio/llms.txt
👉 Servidor MCP: https://bazaar.browns.studio/api/mcp
👉 Kit: @stellar-bazaar/provider-kit (o npm run bazaar-cli)

🎯 SKILL: "AI Video Scriptwriter & Creative Director"
- Rol: Guionista profesional de videos cortos (YouTube Shorts, TikTok, Reels).
- Inputs: 'topic' (string), 'durationSeconds' (number), 'tone' (string).
- Precio: 0.02 USDC en Stellar Testnet.
- Wallet de Cobro: [Tu clave pública Stellar G...]

Tus 2 entregables:
1. 'server.ts': Endpoint HTTP con middleware x402 que genera el guion estructurado por escenas y un visor 'teleprompter.html' bajo el estándar 'bazaarDelivery' (con hashes SHA-256).
2. 'service-card.json': Ficha oficial de catálogo validada para indexación MCP.`,

    auditor: `Actúa como Agente Desarrollador y crea la Skill 'Soroban Smart Contract Auditor' para Stellar Bazaar x402:
👉 Especificación: https://bazaar.browns.studio/llms.txt
👉 Servidor MCP: https://bazaar.browns.studio/api/mcp

🎯 SKILL: "Soroban Smart Contract Safety Auditor"
- Rol: Auditor de vulnerabilidades estáticas en contratos Soroban/Rust.
- Inputs: 'contractAddress' (string), 'sourceCode' (string opcional).
- Precio: 0.05 USDC en Stellar Testnet.
- Wallet de Cobro: [Tu clave pública Stellar G...]

Tus 2 entregables:
1. 'server.ts': Endpoint x402 que analiza seguridad y emite 'audit-report.html' bajo el estándar 'bazaarDelivery'.
2. 'service-card.json': Ficha oficial del catálogo validada para indexación MCP.`,

    oracle: `Actúa como Agente Desarrollador y crea la Skill 'DeFi Arbitrage & Oracle' para Stellar Bazaar x402:
👉 Especificación: https://bazaar.browns.studio/llms.txt
👉 Servidor MCP: https://bazaar.browns.studio/api/mcp

🎯 SKILL: "Stellar DEX Arbitrage & Slippage Oracle"
- Rol: Oráculo de cotizaciones y cálculo de slippage entre pares XLM/USDC/EURC.
- Inputs: 'pair' (string), 'amount' (number), 'side' (string: buy/sell).
- Precio: 0.01 USDC en Stellar Testnet.
- Wallet de Cobro: [Tu clave pública Stellar G...]

Tus 2 entregables:
1. 'server.ts': Endpoint x402 con cotizaciones en tiempo real y envelope 'bazaarDelivery'.
2. 'service-card.json': Ficha oficial de catálogo validada para indexación MCP.`,

    custom: `Actúa como Agente Desarrollador y crea una Skill personalizada para Stellar Bazaar x402:
👉 Especificación: https://bazaar.browns.studio/llms.txt
👉 Servidor MCP: https://bazaar.browns.studio/api/mcp

🎯 DATOS DE LA SKILL:
- Nombre: "[Nombre de tu Servicio]"
- Descripción: "[Qué hace la herramienta]"
- Inputs: "[parámetros requeridos]"
- Precio: "[Monto]" USDC en Stellar Testnet
- Wallet de Cobro: "[Tu wallet pública Stellar G...]"

Tus 2 entregables:
1. 'server.ts': Endpoint HTTP con middleware x402 y estándar 'bazaarDelivery'.
2. 'service-card.json': Ficha oficial del catálogo validada para indexación MCP.`,
  };

  const sellerCliCode = `# 1. Inicializar plantilla de servicio
npm run bazaar-cli init mi-servicio.json

# 2. Validar conformidad con el estándar del Bazaar
npm run bazaar-cli validate mi-servicio.json`;

  const sellerSdkCode = `import { generateCanonicalServiceCard, createDeliverableBundle } from "@/lib/provider-kit";

// 1. Genera la ServiceCard oficial
const card = generateCanonicalServiceCard({
  id: "mi-servicio-ai",
  name: "Mi Servicio AI",
  description: "Microservicio de inferencia con cobro x402",
  tags: ["ai", "analysis"],
  pricing: { amountUsdc: "0.05", destinationAddress: "G..." },
  endpointUrl: "https://mi-api.com/x402/run",
  input: [{ name: "prompt", type: "string", required: true }],
  provider: { name: "Mi Org" }
});

// 2. Empaqueta el entregable con hashes SHA-256
const envelope = createDeliverableBundle(card.id, { output: "OK" }, files);`;

  const getBuyerText = () => {
    if (buyerFormat === "prompt") return buyerPrompt;
    if (buyerFormat === "mcp_json") return buyerMcpJson;
    return buyerSdkCode;
  };

  const getSellerText = () => {
    if (sellerFormat === "prompt") return sellerPrompts[sellerExample];
    if (sellerFormat === "cli") return sellerCliCode;
    return sellerSdkCode;
  };

  const buyer = role === "buyer";
  return <section aria-label={buyer?"Conexión del comprador":"Preparación del proveedor"}>
   <h2>{buyer?"Prepara las instrucciones para tu agente":"Prepara tu servicio para revisión"}</h2>
   <p className="ui-muted">{buyer?"Copia una plantilla o la configuración MCP. Conectar permite descubrir herramientas; para ver acciones externas en el historial, tu agente debe integrar su reporte.":"Estas plantillas son ejemplos para desarrollar un proveedor, no servicios ya disponibles. Publicar requiere validación, prueba de control y revisión manual."}</p>
   <div className="ui-chips" aria-label="Formato de instrucciones">{buyer ? (["prompt","mcp_json","sdk"] as BuyerFormat[]).map(fmt=><button type="button" className="ui-chip" key={fmt} aria-pressed={buyerFormat===fmt} onClick={()=>setBuyerFormat(fmt)}>{fmt==="prompt"?"Prompt":fmt==="mcp_json"?"MCP JSON":"Ejemplo SDK"}</button>):(["prompt","cli","sdk"] as SellerFormat[]).map(fmt=><button type="button" className="ui-chip" key={fmt} aria-pressed={sellerFormat===fmt} onClick={()=>setSellerFormat(fmt)}>{fmt==="prompt"?"Prompt":fmt==="cli"?"Bazaar CLI":"Provider Kit"}</button>)}</div>
   {!buyer && sellerFormat==="prompt" && <div className="ui-actions" aria-label="Ejemplos de proveedor">{(["scriptwriter","auditor","oracle","custom"] as SellerExample[]).map(ex=><button type="button" className="ui-chip" key={ex} aria-pressed={sellerExample===ex} onClick={()=>setSellerExample(ex)}>{ex==="scriptwriter"?"Guiones":ex==="auditor"?"Auditoría":ex==="oracle"?"Oráculo":"Personalizado"}</button>)}</div>}
   <p className="ui-notice">Copiar no envía mensajes, no publica un servicio ni ejecuta pagos. Revisa la plantilla antes de usarla; los ejemplos SDK requieren el entorno del repositorio.</p>
   <CopyText key={buyer?buyerFormat:sellerFormat+sellerExample} text={buyer?getBuyerText():getSellerText()} label="Instrucciones" />
   <div className="ui-actions">{buyer?<><ButtonLink href="/agent-chat" variant="secondary">Abrir chat existente</ButtonLink><ButtonLink href="/buyer-execution" variant="quiet">Abrir workspace</ButtonLink></>:<ButtonLink href="/publish" variant="secondary">Publicar API</ButtonLink>}</div>
  </section>;
}
