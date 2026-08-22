import Link from "next/link";
import { DocsCodeTabs } from "@/components/DocsCodeTabs";
import "@/app/docs.css";

export const metadata = {
  title: "Developer Hub & Agent Kit | Stellar Bazaar x402",
  description: "Machine-readable integration guides for AI Agents (Claude, Cursor, LangChain, CrewAI) and API Providers on Stellar.",
};

export default function DocsPage() {
  return (
    <main>
      <div className="mock-banner">
        DEVELOPER HUB · MCP STREAMABLE HTTP READ-ONLY · x402 TESTNET EVIDENCE
      </div>

      <nav className="nav shell">
        <Link href="/" className="brand">
          <span>✦</span> Stellar Bazaar <sup>x402</sup>
        </Link>
        <div className="nav-links">
          <Link href="/#catalogo">Catálogo</Link>
          <Link href="/publish">Publicar API</Link>
          <Link href="/onboarding">Onboarding</Link>
          <Link href="/docs" className="active">Docs</Link>
          <a href="https://github.com/CaBsCrypto/stellar-bazaar-x402" target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </div>
        <span className="network-pill">
          <i /> Live Dev Hub
        </span>
      </nav>

      <header className="docs-shell docs-hero">
        <span className="kicker">DEVELOPER HUB & AGENT KIT</span>
        <h1>
          Integra tu Agente o Monetiza tu API.
          <br />
          <em>En menos de 3 minutos.</em>
        </h1>
        <p>
          Conecta agentes para descubrir e inspeccionar servicios mediante MCP read-only. La ejecución pagada exige un
          cliente externo con política y conciliación de recibo; Bazaar no firma ni custodia.
        </p>
      </header>

      <section className="docs-shell docs-section">
        <h2>⚡ Quickstart para Agentes de IA</h2>
        <p className="subtitle">
          Elige tu framework o entorno para conectar tu agente a Stellar Bazaar con copiado en 1 clic.
        </p>
        <DocsCodeTabs />
      </section>

      <section className="docs-shell docs-section">
        <h2>🤖 Modelos y Asistentes Soportados</h2>
        <p className="subtitle">
          Stellar Bazaar expone un servidor MCP nativo compatible con los principales entornos de IA agéntica.
        </p>
        <div className="docs-grid-3">
          <div className="docs-card">
            <h3>Claude Desktop & Anthropic</h3>
            <p>Conexión directa vía <code>claude_desktop_config.json</code> usando transporte MCP Streamable HTTP.</p>
            <code>URL: /api/mcp</code>
          </div>
          <div className="docs-card">
            <h3>Cursor IDE & Windsurf</h3>
            <p>Agrega el endpoint MCP para discovery y validación read-only; no expone tools de pago o escritura.</p>
            <code>Protocol: MCP v1.30</code>
          </div>
          <div className="docs-card">
            <h3>LangChain, CrewAI & AutoGen</h3>
            <p>Crea clients de discovery/política en Python o TypeScript sin introducir seeds en prompts o tools.</p>
            <code>Read-only discovery SDK</code>
          </div>
        </div>
      </section>

      <section className="docs-shell docs-section">
        <h2>💰 Para Proveedores: Monetiza tu API en 3 Pasos</h2>
        <p className="subtitle">
          Cualquier desarrollador puede envolver una función o microservicio existente y recibir micropagos en USDC directamente en su wallet de Stellar.
        </p>
        <div className="docs-grid-3">
          <div className="docs-card">
            <h3>1. Envuelve tu Endpoint</h3>
            <p>Agrega el middleware x402 que emite el desafío HTTP 402 y verifica la firma con el Facilitador.</p>
            <code>Express / Next.js / FastAPI</code>
          </div>
          <div className="docs-card">
            <h3>2. Define tu ServiceCard</h3>
            <p>Establece tu precio en USDC (ej. <code>0.001</code>), tu dirección pública de Stellar (<code>G...</code>) y el schema de inputs.</p>
            <code>bazaar-card.json</code>
          </div>
          <div className="docs-card">
            <h3>3. Publica en el Bazaar</h3>
            <p>Usa <code>/publish</code> para crear y validar un borrador sin secretos. El alta real es server-to-server y revisada.</p>
            <code>Local Draft → Operator Review</code>
          </div>
        </div>
      </section>

      <section className="docs-shell docs-section">
        <h2>📡 Endpoints Machine-Readable de Stellar Bazaar</h2>
        <p className="subtitle">
          Especificaciones estructuradas para descubrimiento algorítmico e inspección de capacidades.
        </p>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Método</th>
              <th>Descripción</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>/api/capabilities</code></td>
              <td>GET</td>
              <td>Capacidades globales, operaciones soportadas, políticas de seguridad y versiones.</td>
            </tr>
            <tr>
              <td><code>/api/discovery/resources</code></td>
              <td>GET</td>
              <td>Catálogo paginado completo de ServiceCards activas e indexadas.</td>
            </tr>
            <tr>
              <td><code>/api/discovery/search?q=...</code></td>
              <td>GET</td>
              <td>Búsqueda léxica determinista con scoring de relevancia (NDCG = 1.0).</td>
            </tr>
            <tr>
              <td><code>/api/mcp</code></td>
              <td>POST</td>
              <td>Servidor MCP Streamable HTTP (herramientas: <code>search_services</code>, <code>get_service</code>, etc.).</td>
            </tr>
            <tr>
              <td><code>/api/publisher/ingest</code></td>
              <td>POST (gated)</td>
              <td>Alta append-only deshabilitada por defecto; GET/PUT/DELETE fallan cerrados hasta existir ownership por provider.</td>
            </tr>
            <tr>
              <td><code>/api/openapi</code></td>
              <td>GET</td>
              <td>Especificación canónica OpenAPI 3.1 del Bazaar para agentes y parsers.</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}
