# ✦ Stellar Bazaar x402
### *Catálogo de Descubrimiento Inteligente y Micropagos Atómicos x402 para Agentes de IA en Stellar*

<div align="center">

[![English Version](https://img.shields.io/badge/Language-English-blue?style=for-the-badge)](README.md)
[![Versión en Español](https://img.shields.io/badge/Idioma-Espa%C3%B1ol-orange?style=for-the-badge)](README.es.md)

</div>

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Stellar: Testnet](https://img.shields.io/badge/Stellar-Testnet%20Verified-08B5E5.svg)](https://stellar.expert/explorer/testnet)
[![x402: v2 Compatible](https://img.shields.io/badge/x402-v2%20Standard-8A2BE2.svg)](https://x402.org)
[![MCP: Streamable HTTP](https://img.shields.io/badge/MCP-Streamable%20HTTP-10B981.svg)](docs/AGENT_QUICKSTART.md)
[![TypeScript: Strict](https://img.shields.io/badge/TypeScript-Strict%200%20Errors-3178C6.svg)](tsconfig.json)

---

## 🌟 Pitch Ejecutivo: La Nueva Economía Agente-a-Agente (A2A)

Los **agentes de Inteligencia Artificial autónomos** (Claude, Cursor, LangChain, CrewAI, AutoGen) están revolucionando el software, pero enfrentan un **cuello de botella crítico**:

> **El Dilema:** Los agentes no tienen tarjetas de crédito humanas, no pueden suscribirse a planes SaaS mensuales recurrentes de $50/mes para una sola consulta, y compartir API keys maestras representa un riesgo de seguridad inaceptable.

```
       [ EL PROBLEMA ACTUAL ]                          [ LA SOLUCIÓN STELLAR BAZAAR x402 ]
 ❌ Paywalls con suscripción humana mensual        ✅ Micropagos atómicos por llamada (ej. 0.001 USDC)
 ❌ Fuga de API keys maestras en prompts           ✅ Cero llaves compartidas; pago directo por llamada
 ❌ Directorios cerrados o perfiles humanos        ✅ Catálogo legible por máquinas (MCP + REST)
 ❌ Falta de acuerdos de nivel de servicio        ✅ ServiceCards con esquemas I/O y precios deterministas
 ❌ Custodia de fondos y comisiones abusivas       ✅ Cero custodia de fondos: liquidación directa en Stellar
```

**Stellar Bazaar x402** es la capa de **descubrimiento y catálogo inteligente** que conecta a compradores y agentes de IA con APIs HTTP y herramientas MCP de pago, liquidando micropagos instantáneos y de bajo costo a través del protocolo abierto **x402 sobre la red Stellar**.

---

## 💡 ¿Por Qué Stellar + x402?

1. **Velocidad y Comisiones Ultra-bajas:** Transacciones liquidadas en 3-5 segundos con comisiones de red despreciables ($0.00001), ideales para llamadas de alta frecuencia de agentes.
2. **Estándar Abierto x402 v2:** Devuelve `HTTP 402 Payment Required` estándar del W3C con especificación de activo SEP-41 y monto.
3. **Model Context Protocol (MCP) Nativo:** Compatible directamente con asistentes como Claude Desktop, Cursor IDE y frameworks como LangChain y CrewAI.
4. **Enfoque Spanish-First con Paridad Global:** Metadatos, categorías y documentación diseñados prioritariamente en español con paridad exacta en inglés (`es` / `en`).

---

## 🏗️ Arquitectura del Sistema

```mermaid
flowchart TD
    subgraph Clients["1. Clientes y Agentes Autónomos"]
        Claude["Claude Desktop / Cursor IDE"]
        LangChain["LangChain / CrewAI / AutoGen"]
        WebUI["Navegador Web / Frontend"]
    end

    subgraph Bazaar["2. Capa de Descubrimiento (Stellar Bazaar Core)"]
        MCPServer["/api/mcp<br/>(Servidor MCP Streamable HTTP)"]
        RESTDiscovery["/api/discovery<br/>(resources / search / pilots)"]
        Validator["validateServiceCard()<br/>(Motor de Conformidad)"]
        DynamicRegistry["/api/publisher/ingest<br/>(Auto-Registro Dinámico)"]
        PilotCatalog["6 Catálogos Piloto Bilingües<br/>(Gobernanza, Web Intel, Video, etc.)"]
    end

    subgraph x402Layer["3. Protocolo x402 & Resource Server"]
        Challenge402["Desafío HTTP 402<br/>(PAYMENT-REQUIRED v2)"]
        FacilitatorGate["Facilitator Verification Gate<br/>(OpenZeppelin Hosted)"]
    end

    subgraph Settlement["4. Infraestructura Blockchain"]
        Testnet["Stellar Testnet Ledger<br/>(Contratos USDC / XLM / EURC SEP-41)"]
    end

    subgraph Providers["5. Microservicios Proveedores Desacoplados"]
        DeFiService["Stellar DeFi Quote Service<br/>(Port 3500)"]
        WebIntelService["Website Intelligence Service<br/>(Port 3501)"]
    end

    Clients --> MCPServer
    Clients --> RESTDiscovery
    RESTDiscovery --> Validator
    MCPServer --> PilotCatalog
    DynamicRegistry --> Validator

    Clients --> Challenge402
    Challenge402 -. "Firma Ed25519" .-> FacilitatorGate
    FacilitatorGate --> Testnet
    FacilitatorGate --> Providers
```

---

## 🔄 Flujo de Interacción: Descubrir, Pagar y Ejecutar

```mermaid
sequenceDiagram
    autonumber
    actor Agent as Agente Autónomo (Payer)
    participant Bazaar as Stellar Bazaar (MCP / REST)
    participant Provider as Proveedor x402
    participant Facilitator as Facilitador OpenZeppelin
    participant Stellar as Stellar Testnet Blockchain

    Note over Agent,Bazaar: Fase 1: Descubrimiento & Verificación de Política
    Agent->>Bazaar: POST /api/mcp (search_services: "riesgo swap")
    Bazaar-->>Agent: ServiceCard (Asset: USDC, Amount: 0.001, Scheme: exact)
    Agent->>Agent: Pre-flight Safety Check (Valida presupuesto & allowlist)

    Note over Agent,Provider: Fase 2: Reto x402
    Agent->>Provider: GET /api/x402/swap-risk?pair=XLM/USDC&amount=2500&side=buy
    Provider-->>Agent: HTTP 402 Payment Required + Header PAYMENT-REQUIRED

    Note over Agent,Stellar: Fase 3: Firma & Liquidación
    Agent->>Agent: Firma autorización Ed25519 con wallet local
    Agent->>Provider: GET (con Header PAYMENT-SIGNATURE)
    Provider->>Facilitator: verify(signature, requirements)
    Facilitator-->>Provider: { isValid: true }
    Provider->>Facilitator: settle(signature, requirements)
    Facilitator->>Stellar: Transacción de Pago USDC
    Stellar-->>Facilitator: Confirmado en Ledger on-chain
    Facilitator-->>Provider: { success: true, txHash: "d6154a4c..." }

    Note over Provider,Agent: Fase 4: Entrega de Resultado
    Provider-->>Agent: HTTP 200 OK + Header PAYMENT-RESPONSE + Resultado de Negocio
```

---

## 💎 Estado Actual del Proyecto & Evidencia en Vivo

### 🟢 Hitos Completados y Verificados

1. **Liquidación On-Chain en Stellar Testnet Verificada:**
   * **Hash de Transacción:** [`d6154a4c60607bac76309462d109c85031f66710dfe22fe603cada4d41e78094`](https://stellar.expert/explorer/testnet/tx/d6154a4c60607bac76309462d109c85031f66710dfe22fe603cada4d41e78094)
   * **Ledger Confirmado:** `4202242`
   * **Monto:** `0.001 USDC` (`10000` stroops)
   * **Contrato SEP-41:** `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`
2. **Servidor MCP Streamable HTTP (`/api/mcp`):**
   * 5 herramientas estándar: `get_bazaar_capabilities`, `list_services`, `search_services`, `get_service`, `validate_service_card`.
3. **SDK Oficial para Agentes (`lib/bazaar-agent-client.ts`):**
   * SDK fuertemente tipado para interactuar, evaluar políticas de gasto y auto-liquidar pagos x402 en 3 líneas de código.
4. **Auto-Registro de Proveedores (`/api/publisher/ingest`):**
   * Registro dinámico con verificación determinista de 11 reglas de conformidad.
5. **6 Pilotos Bilingües Estructurados:**
   * Gobernanza de Agentes (`agent-policy-pilot`), Inteligencia Web, Reutilización de Video, Creador de Campañas, Explorador de Investigación y Brief de Diseño.
6. **Arnés de Pruebas Automatizado 5-en-1 (`scripts/test-e2e-ecosystem.mjs`):**
   * Validación integral de punta a punta con **cero riesgo de fondos**.

---

## 🚀 Inicio Rápido (Quickstart)

### 1. Instalación y Ejecución Local

```bash
# Clonar el repositorio
git clone https://github.com/CaBsCrypto/stellar-bazaar-x402.git
cd stellar-bazaar-x402

# Instalar dependencias
npm install

# Iniciar servidor Next.js
npm run dev
```

Abre `http://localhost:3000` en tu navegador.

---

### 2. Ejecutar la Batería de Pruebas

```bash
# Validar tipos TypeScript estrictos (0 errores)
npm run typecheck

# Ejecutar el arnés E2E del ecosistema (REST + MCP + x402)
npm run test:e2e:ecosystem

# Ejecutar la suite de seguridad y hard-caps de agentes
npm run test:agent:safety

# Ejecutar el test de ingesta y auto-registro de proveedores
npm run test:publisher:ingest

# Ejecutar la simulación del comprador autónomo
npm run agent:quickstart
```

---

### 3. Conexión de Agentes de IA en 3 Líneas de Código

```typescript
import { BazaarAgentClient } from "@/lib/bazaar-agent-client";

// 1. Inicializar cliente con clave de Testnet y límite de presupuesto
const client = new BazaarAgentClient({
  baseUrl: "http://localhost:3000",
  payerSecretKey: process.env.X402_PAYER_SECRET,
  maxPriceAllowedUsdc: 0.05,
});

// 2. Descubrir el servicio deseado vía MCP
const [serviceCard] = await client.searchServicesMCP("riesgo swap");

// 3. Ejecutar con auto-liquidación x402
const execution = await client.executeService(serviceCard, {
  pair: "XLM/USDC",
  amount: 2500,
  side: "buy",
});

console.log("Resultado:", execution.data);
console.log("Recibo Stellar:", execution.payment.receiptUrl);
```

---

## 🛡️ Fronteras de Seguridad y Confianza (Trust & Safety)

* **Cero Custodia:** Bazaar jamás almacena, retiene ni custodia fondos de usuarios o agentes.
* **Cero Firma de Llaves:** La firma y consentimiento residen 100% del lado del cliente/wallet (`server-only`).
* **Sin Intermediación de Secretos:** Las ServiceCards no contienen API keys, tokens ni claves privadas (`S...`).
* **Metadata No Confiable:** Toda entrada, descripción y plantilla de ruta se valida y sanitiza contra inyecciones SSRF y path traversal (`..`, `@`, `#`).
* **Protección Anti-Bucle (Circuit Breakers):** Máximo de 1 reintento con pago por ciclo para prevenir bucles de cobro involuntarios.

---

## 🗺️ Hoja de Ruta (Roadmap)

```
 [ FASE 1: COMPLETADA ]        [ FASE 2: COMPLETADA ]        [ FASE 3: COMPLETADA ]       [ FASE 4: EN CURSO ]
  Discovery UI & REST API   --> Liquidación Testnet x402 --> Ingesta de Proveedores  --> Soporte Multiactivo
  Servidor MCP Streamable       Evidencia On-Chain Real       SDK & Quickstarts Agentes     Mainnet & Auditoría
```

1. ✅ **Fase 1 (Discovery Core):** Catálogo bilingüe, ranking determinista, servidor MCP y validador de ServiceCards.
2. ✅ **Fase 2 (Liquidación Testnet):** Reto HTTP 402, firmas Ed25519 y liquidación on-chain con `@x402/stellar`.
3. ✅ **Fase 3 (SDK & Ingesta):** `BazaarAgentClient`, suite de seguridad, auto-registro `/api/publisher/ingest` y arnés E2E.
4. 🟡 **Fase 4 (Expansión & Producción):** Soporte multiactivo SEP-41 (`USDC`, `XLM`, `EURC`), despliegue global y preparación para Mainnet tras auditoría externa.

---

## 📖 Documentación Relacionada

* [**Guía de Integración para Agentes (`AGENT_QUICKSTART.md`)**](docs/AGENT_QUICKSTART.md)
* [**Guía de Reproducción Testnet (`DEMO_TESTNET.md`)**](docs/DEMO_TESTNET.md)
* [**Especificación del Contrato de Discovery (`DISCOVERY_CONTRACT.md`)**](docs/DISCOVERY_CONTRACT.md)
* [**Biblia del Proyecto & Arquitectura (`PROJECT_BIBLE.md`)**](docs/PROJECT_BIBLE.md)
* [**Onboarding de Agentes MCP (`MCP_AGENT_ONBOARDING.md`)**](docs/MCP_AGENT_ONBOARDING.md)

---

## 📄 Licencia

Este proyecto y su documentación están licenciados bajo **[Apache-2.0](LICENSE)**.
Las dependencias externas conservan sus respectivas licencias.
