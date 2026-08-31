# 🤖 Stellar Bazaar x402 — OpenAI WebMCP Challenge Submission

## 🌟 Executive Summary
**Stellar Bazaar** is an agent-native marketplace built for the autonomous AI economy. It leverages the **W3C Web Model Context Protocol (WebMCP)** standard to empower browser-based AI agents (such as ChatGPT in-browser or WebMCP-enabled Chrome) to discover, evaluate, validate, and audit AI services and multi-step workflow bundles with on-chain **Stellar Testnet x402 micropayments** (USDC/XLM).

---

## 🏗️ How We Leverage WebMCP

### 1. Dual Integration (Imperative & Declarative)
Stellar Bazaar supports both sides of the emerging W3C WebMCP specification:
* **Imperative In-Browser API (
avigator.modelContext / document.modelContext)**:
  - Automatically initializes and registers high-value tools when the agent visits the page.
  - Transparent dual-layer architecture: uses the native browser Model Context if active, or falls back to an in-memory polyfill/emulator (window.__WEBMCP_EMULATOR__) for universal testing.
* **Declarative HTML Forms (	oolname, 	ooldescription, 	oolparamdescription)**:
  - Forms are semantically annotated so AI agents can invoke actions without brittle DOM parsing or vision-based screen clicking.

### 2. Available WebMCP Tools
1. azaar_search_services: Semantic search & ranking of paid/free AI services by query, tags, or max budget in USDC/XLM.
2. azaar_get_service: Technical specification, endpoint routes, input schemas, and price breakdowns.
3. azaar_list_workflow_bundles: Pre-composed autonomous multi-step bundles with dependencies and aggregated price estimation.
4. azaar_validate_service_card: Validation of custom provider Service Cards against strict schema invariants.
5. azaar_get_payment_flow: Full inspection of the HTTP 402 payment challenge, escrow terms, and on-chain receipt verification on Stellar Testnet.

---

## 💻 Cyberpunk HUD Terminal (3:1 Widescreen)
To provide transparency for both human users and AI judges, the UI includes a floating **WebMCP Agent Terminal**:
* **Live Feed (⚡):** Real-time activity log showing inputs, responses, and latency in milliseconds for every tool call.
* **Tool Registry (🛠️):** Visual inspection of all exposed JSON Schemas.
* **Agent Simulator (▶):** Interactive playground with pre-configured JSON presets to test live tool execution directly inside the browser.

---

## 🔗 Repository & Live Demo
* **Repository:** Open-source under Apache-2.0 License.
* **Protocol Standards:** W3C Web Machine Learning CG (WebMCP Draft), HTTP 402 Payment Required, SEP-41 Stellar Assets.
