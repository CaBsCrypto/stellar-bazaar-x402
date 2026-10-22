
import {UiText} from "@/components/UiLanguage";
import {LandingHero} from "@/components/LandingHero";
import {AgentHubLinks} from "@/components/AgentHubLinks";
import "@/styles/market-village.css";
import {Navbar} from "@/components/Navbar";
import {Footer} from "@/components/Footer";
import {Catalog} from "@/components/Catalog";
import {ButtonLink, Card, PageShell, Pill, SectionHeading} from "@/components/ui";
import {redirect} from "next/navigation";
export const dynamic = 'force-dynamic';
export default function Home() {
 if (process.env.BAZAAR_PUBLIC_DEMO === 'true' && process.env.BAZAAR_ENABLE_MARKETPLACE !== 'true') redirect('/demo');
 return <main><Navbar />
 <LandingHero/>
 <PageShell><AgentHubLinks/><Catalog marketEnabled={process.env.BAZAAR_ENABLE_MARKETPLACE === 'true'}/><section className="ui-how"><SectionHeading title="A place for each step" /><div className="ui-grid"><Card><Pill>01 · Explorar</Pill><h3><UiText text="Elige con contexto"/></h3><p className="ui-muted"><UiText text="Compara las condiciones declaradas del servicio. El catálogo no certifica una compra ni garantiza disponibilidad."/></p></Card><Card><Pill>02 · Solicitar</Pill><h3><UiText text="Instrucciones para tu agente"/></h3><p className="ui-muted"><UiText text="Conecta por MCP y conserva tus decisiones en el chat. Comprueba precio y red antes de pagar."/></p></Card><Card><Pill>03 · Consultar</Pill><h3><UiText text="Tu biblioteca privada"/></h3><p className="ui-muted"><UiText text="Abre el contenido conservado y consulta por separado el estado del pago y de la entrega."/></p><ButtonLink href="/history" variant="quiet"><UiText text="Abrir historial →"/></ButtonLink></Card></div></section></PageShell><Footer /></main>; }
