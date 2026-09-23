"use client";

import { useState } from "react";
import { buyerConnectionPrompt } from "@/lib/testnet-funding";
import {ButtonLink} from "@/components/ui";
import {CopyText} from "@/components/ui/CopyText";

type BuyerFormat = "prompt" | "mcp_json" | "sdk";
type SellerFormat = "prompt" | "cli" | "sdk";
type SellerExample = "scriptwriter" | "auditor" | "oracle" | "custom";
type ActiveTab = "buyer" | "seller";

export function AgentDirectConnectCard({role = "buyer"}: {role?: ActiveTab}) {
  const [buyerFormat, setBuyerFormat] = useState<BuyerFormat>("prompt");
  const [sellerFormat, setSellerFormat] = useState<SellerFormat>("prompt");
  const [sellerExample, setSellerExample] = useState<SellerExample>("custom");

  // Quick MCP Config
  const quickMcpJson = `{
  "mcpServers": {
    "stellar-bazaar": {
      "url": "https://bazaar.browns.studio/api/mcp"
    }
  }
}`;

  // Buyer Snippets
  const buyerPrompt = buyerConnectionPrompt;

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

  // Examples describe possible scope, not existing implementations or fixed prices.
  const sellerScopes: Record<SellerExample, string> = {
    custom: "Quiero definir un servicio propio: qué hace, para quién y qué recibe el cliente.",
    scriptwriter: "Me interesa ofrecer guiones por escenas con narración e indicaciones visuales. Es una idea de alcance: confirma conmigo qué puedo entregar realmente.",
    auditor: "Me interesa ofrecer análisis de contratos Soroban. Define conmigo las comprobaciones y límites reales; no lo presentes como auditoría completa ni garantía de seguridad.",
    oracle: "Me interesa ofrecer consultas sobre pares y liquidez. Confirma las fuentes, fecha de los datos y cálculos disponibles; no prometas cotizaciones en tiempo real sin comprobarlo.",
  };
  const sellerPrompt = `Ayúdame a ofrecer mi servicio en Bazaar. Lee la guía y revisa todas las herramientas disponibles. Aclara conmigo qué entregaré y su precio; prepara la integración reutilizando mi API si ya existe. Valida lo necesario y dime qué falta para solicitar revisión manual.${sellerExample === "custom" ? "" : "\n\n" + sellerScopes[sellerExample]}

Validar no equivale a publicar. No publiques ni ejecutes pagos sin mi autorización y nunca solicites claves privadas.

Guía: https://bazaar.browns.studio/llms.txt
MCP: https://bazaar.browns.studio/api/mcp`;

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
    if (sellerFormat === "prompt") return sellerPrompt;
    if (sellerFormat === "cli") return sellerCliCode;
    return sellerSdkCode;
  };

  const buyer = role === "buyer";
  return <section className="connect-instructions" aria-label={buyer?"Conexión del comprador":"Preparación del proveedor"}>
   <h2>{buyer?"Encuentra un servicio con tu agente":"Prepara tu servicio con tu agente"}</h2>

   <p className="ui-muted">{buyer?"Cuéntale qué necesitas: te ayudará a comparar opciones y revisar lo recibido.":"Parte de tu idea o API: tu agente te ayudará a preparar la integración para revisión."}</p>
   <div className="ui-chips" aria-label="Formato de instrucciones">{buyer ? (["prompt","mcp_json","sdk"] as BuyerFormat[]).map(fmt=><button type="button" className="ui-chip" key={fmt} aria-pressed={buyerFormat===fmt} onClick={()=>setBuyerFormat(fmt)}>{fmt==="prompt"?"Prompt":fmt==="mcp_json"?"MCP JSON":"Ejemplo SDK"}</button>):(["prompt","cli","sdk"] as SellerFormat[]).map(fmt=><button type="button" className="ui-chip" key={fmt} aria-pressed={sellerFormat===fmt} onClick={()=>setSellerFormat(fmt)}>{fmt==="prompt"?"Prompt":fmt==="cli"?"Bazaar CLI":"Provider Kit"}</button>)}</div>
   {!buyer && sellerFormat==="prompt" && <div className="ui-actions" aria-label="Ejemplos de proveedor">{(["custom","scriptwriter","auditor","oracle"] as SellerExample[]).map(ex=><button type="button" className="ui-chip" key={ex} aria-pressed={sellerExample===ex} onClick={()=>setSellerExample(ex)}>{ex==="scriptwriter"?"Guiones":ex==="auditor"?"Auditoría":ex==="oracle"?"Oráculo":"Personalizado"}</button>)}</div>}
   <details className="connect-help"><summary>Cómo usar estas instrucciones</summary><p>{buyer ? "Copia una plantilla o la configuración MCP. Conectar permite descubrir herramientas; para ver acciones externas en el historial, tu agente debe integrar su reporte." : "Estas plantillas son ejemplos para desarrollar un proveedor, no servicios ya disponibles. Publicar requiere validación, prueba de control y revisión manual."}</p><p>Copiar no envía mensajes, no publica un servicio ni ejecuta pagos. Revisa la plantilla antes de usarla; los ejemplos SDK requieren el entorno del repositorio.</p></details>
   {buyer && <details className="connect-help"><summary>¿Tu agente necesita fondos de prueba?</summary><p>Si ya tiene saldo, puede continuar. Sozu permite financiar su wallet de Testnet existente o crear una de pruebas si todavía no tiene. Para XLM, la guía explica cómo financiar una cuenta de pruebas con Friendbot. El agente necesita un firmante compatible y el servicio debe aceptar ese activo. No compartas claves secretas.</p><a href="https://faucet.sozu.capital/" target="_blank" rel="noopener noreferrer">Conocer Sozu Faucet ↗</a><p>El prompt enlaza la guía de fondos, que el agente consultará solo si la necesita.</p></details>}
   <CopyText key={buyer?buyerFormat:sellerFormat+sellerExample} text={buyer?getBuyerText():getSellerText()} label="Instrucciones" compact extraActions={buyer?<><ButtonLink href="/agent-chat" variant="secondary">Abrir chat existente</ButtonLink><ButtonLink href="/buyer-execution" variant="quiet">Abrir workspace</ButtonLink></>:<ButtonLink href="/publish" variant="secondary">Preparar mi servicio</ButtonLink>} />
  </section>;
}
