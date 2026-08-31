# 🤖 Stellar Bazaar x402 — OpenAI WebMCP Challenge Submission

## 🌟 Executive Summary
**Stellar Bazaar** is an agent-native marketplace built for the autonomous AI economy. It leverages the **W3C Web Model Context Protocol (WebMCP)** standard to empower browser-based AI agents (such as ChatGPT in-browser or WebMCP-enabled Chrome) to discover, evaluate, validate, audit, and publish AI services and multi-step workflow bundles with on-chain **Stellar Testnet x402 micropayments** (USDC/XLM).

---

## 🏗️ How We Leverage WebMCP

### 1. Dual Integration (Imperative & Declarative)
Stellar Bazaar supports both dimensions of the W3C WebMCP specification:
* **Imperative In-Browser API (`navigator.modelContext` / `document.modelContext`)**:
  - Automatically initializes and registers high-value tools when the agent visits the page.
  - Transparent dual-layer architecture: uses the native browser Model Context if active, or falls back to an in-memory polyfill/emulator (`window.__WEBMCP_EMULATOR__`) for universal testing.
* **Declarative HTML Forms (`toolname`, `tooldescription`, `toolparamdescription`)**:
  - Catalog search and filter forms are semantically annotated so AI agents can invoke actions declaratively through standard form submissions.

### 2. The 8 Active WebMCP Tools
1. `bazaar_list_services`: List all active AI agent services with network, pricing, execution mode and category tags.
2. `bazaar_search_services`: Semantic search & deterministic ranking of paid/free AI services by query, tags, or max budget in USDC/XLM.
3. `bazaar_get_service`: Technical specification, endpoint routes, input schemas, and price breakdowns.
4. `bazaar_list_workflow_bundles`: Pre-composed autonomous multi-step bundles with dependencies and aggregated price estimation.
5. `bazaar_validate_service_card`: Validation of custom provider Service Cards against strict schema invariants.
6. `bazaar_get_payment_flow`: Full inspection of the HTTP 402 payment challenge, escrow terms, and on-chain receipt verification on Stellar Testnet.
7. `bazaar_publish_service`: Autonomous provider upload & self-listing of new AI services directly into the dynamic registry.
8. `bazaar_execute_service`: In-browser execution with real parameters and cryptographic Proof of Delivery envelope (`bazaar.delivery-envelope/v1`).

---

## 💻 Cyberpunk HUD Terminal (3:1 Widescreen), Live UI Reactivity & Policy Guard
To provide transparency for both human users and AI judges, the UI includes:
* **Live Feed (⚡):** Real-time activity log showing inputs, responses, and latency in milliseconds for every tool call.
* **Tool Registry (🛠️):** Visual inspection of all exposed JSON Schemas with 1-click `/api/webmcp/spec` export.
* **Agent Simulator (▶):** Interactive 2-column playground with pre-configured JSON presets to test live tool execution directly inside the browser.
* **Agent Policy Guard (🛡️):** Real-time budget limit interceptor (e.g. max 0.10 USDC per call) and asset whitelist to prevent agent overruns.
* **Reactive DOM Highlighting:** When an agent inspects a service or searches the marketplace, the UI displays a live toast indicator and glows on the target service card.

---

## 🎬 3-Minute Video Demo Script (YouTube)

* **0:00 - 0:40 (The Problem):**
  > *"AI agents navigating the web today rely on brittle screen scraping or simulated clicks. Furthermore, there is no standardized way for agents to discover paid tools and pay for services programmatically."*
* **0:40 - 1:30 (Discovery & WebMCP Terminal):**
  > *"Enter Stellar Bazaar. When an agent opens this page, 7 W3C WebMCP tools are instantly registered. Let's open the 3:1 WebMCP Terminal to see `bazaar_list_services` and `bazaar_search_services` in action with live reactive highlighting."*
* **1:30 - 2:20 (x402 Micropayments & Self-Publishing):**
  > *"Next, the agent evaluates payment terms with `bazaar_get_payment_flow` for on-chain Stellar Testnet verification (USDC/XLM). Then, an AI agent can self-publish its own service to the marketplace with `bazaar_publish_service`."*
* **2:20 - 3:00 (Impact & Conclusion):**
  > *"By combining WebMCP with x402 open payment rails, Stellar Bazaar turns websites into transparent, monetizable infrastructure for autonomous agents."*

---

## 🔗 Repository & Live Demo
* **Repository:** Open-source under Apache-2.0 License.
* **Protocol Standards:** W3C Web Machine Learning CG (WebMCP Draft), HTTP 402 Payment Required, SEP-41 Stellar Assets.
