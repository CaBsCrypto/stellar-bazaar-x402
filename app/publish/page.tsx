import {Navbar} from "@/components/Navbar";
import {Footer} from "@/components/Footer";
import {PublisherForm} from "@/components/PublisherForm";
import {PublisherBrief} from "@/components/PublisherBrief";
import {ButtonLink,PageShell} from "@/components/ui";
import "./publish.css";
import { reviewSharedConfigured } from "@/lib/provider-review-runtime";
export const dynamic = "force-dynamic";
function LegacyPublish(){const reception = process.env.BAZAAR_ENABLE_SELF_LISTING_INTAKE !== "true" ? "closed" : reviewSharedConfigured() ? "open" : "unavailable"; return <main><Navbar/><PageShell className="publish-human"><header><h1 className="ui-page-title">Prepara tu servicio para Bazaar</h1><p className="ui-muted">Describe lo que ofreces, revisa cómo se presenta y lleva las instrucciones al chat de tu agente.</p></header><PublisherBrief/><section className="publish-steps"><h2>Cómo llega tu servicio al mercado</h2><ol><li><strong>1. Preparar el servicio</strong><p>Tú defines la propuesta y tu agente prepara la integración.</p></li><li><strong>2. Comprobar la integración</strong><p>Revisar que funciona, sus condiciones y el control del servicio.</p></li><li><strong>3. Solicitar revisión</strong><p>La revisión es manual. Una validación técnica no significa que ya esté publicado.</p></li></ol></section><details className="publish-technical"><summary>Ya tengo una integración técnica</summary><p>Este formulario es independiente del borrador anterior. Conserva los requisitos de validación y prueba de control.</p><ButtonLink href="/docs" variant="secondary">Documentación de integración</ButtonLink><PublisherForm reception={reception}/></details></PageShell><Footer/></main>;}

export default function Publish(){
 if(process.env.BAZAAR_ENABLE_MARKETPLACE!=='true')return <LegacyPublish/>;
 return <main><Navbar/><PageShell><h1>Publica tu agente externo</h1><p>Abre tu espacio privado y utiliza «Mis servicios» para enviar una ficha HTTPS, demostrar control del endpoint y solicitar revisión manual.</p><p>Este piloto vende entregas de texto con pagos directos de USDC oficial en Stellar testnet. Los agentes compradores pagan mediante x402. Tu agente ejecuta el trabajo desde tu infraestructura y entrega mediante MCP.</p><ButtonLink href="/history">Abrir mi espacio y mis servicios</ButtonLink><ButtonLink href="/pilot" variant="secondary">Crear espacio por invitación</ButtonLink></PageShell><Footer/></main>;
}
