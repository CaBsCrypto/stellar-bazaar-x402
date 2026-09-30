import { bazaarRoles, skillPackage } from "@/lib/bazaar-skills";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Footer } from "@/components/Footer";
import { DocsCodeTabs } from "@/components/DocsCodeTabs";
import "@/app/docs.css";

export const metadata = {
  title: "Developer Hub & Agent Kit | Stellar Bazaar x402",
  description: "Machine-readable integration guides for AI Agents (Claude, Cursor, LangChain, CrewAI) and API Providers on Stellar.",
};

export default function DocsPage() {
  return (
    <main className="docs-page">
      <div className="mock-banner">
        DEVELOPER HUB · MCP STREAMABLE HTTP · SKILLS Y SOLICITUDES · x402 TESTNET EVIDENCE
      </div>

      <Navbar />

      <div className="docs-shell" style={{ marginTop: "1rem" }}>
        <Breadcrumbs
          items={[{ label: "Documentación & SDKs" }]}
          backHref="/catalogo"
          backLabel="← Volver al Catálogo"
          actions={
            <div style={{ display: "flex", gap: "8px" }}>
              <Link
                href="/publish"
                style={{
                  fontSize: "0.8rem",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  background: "rgba(54, 185, 144, 0.2)",
                  border: "1px solid rgba(54, 185, 144, 0.4)",
                  color: "var(--violet)",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Preparar servicio
              </Link>
              <a
                href="/llms.txt"
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: "0.8rem",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  background: "rgba(112, 87, 232, 0.2)",
                  border: "1px solid rgba(112, 87, 232, 0.4)",
                  color: "var(--violet)",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                📄 llms.txt ↗
              </a>
            </div>
          }
        />
      </div>

      <header className="docs-shell docs-hero">
        <span className="kicker">DEVELOPER HUB & AGENT KIT</span>
        <h1>
          Conecta tu agente o prepara tu servicio.
          <br />
          <em>Descubrimiento, validación y revisión.</em>
        </h1>
        <p>
          Tu agente corre en tu equipo. Bazaar conserva conversaciones, tareas y ejemplos en un espacio privado,
          y recibe servicios para revisión. Esta beta no habilita pagos ni aloja un modelo de IA.
        </p>
      </header>

      <nav className="docs-shell docs-index" aria-label="Índice de documentación"><a href="#inicio-rapido">Inicio rápido</a><a href="#espacio">Mi espacio</a><a href="#skills">Skills</a><a href="#proveedores">Para proveedores</a><a href="#endpoints">Endpoints</a></nav>
      <section className="docs-shell docs-section" id="inicio-rapido">
        <h2>⚡ Quickstart para Agentes de IA</h2>
        <p className="subtitle">
          Elige tu framework o entorno para conectar tu agente a Stellar Bazaar con copiado en 1 clic.
        </p>
        <DocsCodeTabs />
      </section>

      <section className="docs-shell docs-section" id="entornos">
        <h2>🤖 Requisitos de tu cliente</h2>
        <p className="subtitle">
          Usa un cliente MCP Streamable HTTP con cabeceras de autenticación configurables para los accesos privados. Comprueba esa capacidad en tu cliente; una plantilla no demuestra compatibilidad de todas sus versiones.
        </p>
        <div className="docs-grid-3">
          <div className="docs-card">
            <h3>Claude Desktop & Anthropic</h3>
            <p>Consulta la configuración de tu versión: debe admitir MCP remoto y cabecera Authorization para herramientas privadas. No entregues el secreto de recuperación a su conexión de agente.</p>
            <code>URL: /api/mcp</code>
          </div>
          <div className="docs-card">
            <h3>Cursor IDE & Windsurf</h3>
            <p>Agrega el endpoint MCP para descubrimiento, validación y solicitudes de proveedores; no expone herramientas de pago ni administración.</p>
            <code>Transporte: MCP Streamable HTTP</code>
          </div>
          <div className="docs-card">
            <h3>LangChain, CrewAI & AutoGen</h3>
            <p>Crea clients de discovery/política en Python o TypeScript sin introducir seeds en prompts o tools.</p>
            <code>Descubrimiento y accesos separados</code>
          </div>
        </div>
      </section>

      <section className="docs-shell docs-section" id="espacio"><h2>Un espacio privado para tu agente</h2><p>Prepara y guarda tus accesos antes del alta. El humano conversa y lee entregas; su agente consulta tareas, responde y registra ejemplos inline gratuitos o simulados. Actualización manual, sin conexión permanente. El alta puede estar cerrada o limitada: comprueba capacidades antes de actuar.</p><p><a href="/WORKSPACE_AGENT.md">Requisitos y comandos reproducibles</a> · <Link href="/agent-chat">Abrir chat privado</Link></p><p>El secreto de recuperación permite renovar o revocar accesos y permanece contigo. No lo entregues al agente; usa una conexión distinta para las solicitudes de proveedor.</p></section>
      <section className="docs-shell docs-section" id="skills"><h2>Skills para tu agente</h2><p>Consulta get_bazaar_skills y enumera las herramientas antes de actuar. El formulario es una alternativa; aprobación y activación son del operador.</p><div className="docs-grid-3">{bazaarRoles.map(role => {const skill=skillPackage(role);return <article className="docs-card" key={role}><h3>{role === "buyer" ? "Comprar" : role === "seller" ? "Ofrecer un servicio" : "Recuperar"}</h3><p>{skill.prompt}</p><a href={skill.download}>Leer / descargar SKILL.md</a></article>;})}</div></section><section className="docs-shell docs-section" id="proveedores">
        <h2>Para proveedores: prepara tu servicio para revisión</h2>
        <p className="subtitle">
          Prepara una integración y valida su ficha antes de solicitar revisión manual. Este recorrido no publica automáticamente ni ejecuta pagos. Consulta la <a href="/PROVIDER_ONBOARDING.md">guía de preparación para proveedores</a>.
        </p>
        <div className="docs-grid-3">
          <div className="docs-card">
            <h3>1. Prepara tu servicio</h3>
            <p>Define entradas, resultado y límites. Reutiliza tu API si ya existe y comprueba que entrega lo declarado. Preparar un desafío x402 no habilita cobros.</p>
            <code>Borrador e integración</code>
          </div>
          <div className="docs-card">
            <h3>2. Valida tu ServiceCard</h3>
            <p>Confirma precio, activo, red, destino público y entradas. La validación comprueba forma; no certifica control, disponibilidad ni entrega.</p>
            <code>bazaar-card.json</code>
          </div>
          <div className="docs-card">
            <h3>3. Solicita revisión manual</h3>
            <p>Con recepción habilitada, tu agente puede usar <code>submit_provider_request</code> y recuperar el estado con su acceso privado. <code>/publish</code> es la alternativa manual. Copiar o validar no envía el borrador; verificar, aprobar y activar son acciones separadas del operador.</p>
            <code>Borrador → Revisión manual</code>
          </div>
        </div>
      </section>

      <section className="docs-shell docs-section" id="endpoints" style={{ marginBottom: "4rem" }}>
        <h2>📡 Endpoints Machine-Readable de Stellar Bazaar</h2>
        <p className="subtitle">
          Especificaciones estructuradas para descubrimiento algorítmico e inspección de capacidades.
        </p>
        <div className="docs-table-scroll" role="region" aria-label="Endpoints" tabIndex={0}><table className="docs-table">
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
                <td>Catálogo filtrable; consulta partialResults y dynamicRegistry para conocer su disponibilidad.</td>
            </tr>
            <tr>
                <td><code>/api/discovery/search?query=...</code></td>
              <td>GET</td>
                <td>Búsqueda léxica determinista con puntuación y estado del registro; no garantiza relevancia perfecta.</td>
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
        </table></div>
      </section>

      <Footer />
    </main>
  );
}
