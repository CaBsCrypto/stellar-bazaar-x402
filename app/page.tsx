import {LandingHero} from "@/components/LandingHero";
import "@/styles/market-village.css";
import {Navbar} from "@/components/Navbar";
import {Footer} from "@/components/Footer";
import {Catalog} from "@/components/Catalog";
import {ButtonLink, Card, PageShell, Pill, SectionHeading} from "@/components/ui";
export default function Home() { return <main><Navbar />
 <LandingHero/>
 <span id="conectar-agente" />
 <PageShell><Catalog /><section className="ui-how"><SectionHeading title="Un lugar para cada paso" /><div className="ui-grid"><Card><Pill>01 · Explorar</Pill><h3>Elige con contexto</h3><p className="ui-muted">Compara las condiciones declaradas del servicio. El catálogo no certifica una compra ni garantiza disponibilidad.</p></Card><Card><Pill>02 · Solicitar</Pill><h3>Instrucciones para tu agente</h3><p className="ui-muted">Conecta por MCP y conserva tus decisiones en el chat. Comprueba precio y red antes de pagar.</p></Card><Card><Pill>03 · Consultar</Pill><h3>Tu biblioteca privada</h3><p className="ui-muted">Abre el contenido conservado y consulta por separado el estado del pago y de la entrega.</p><ButtonLink href="/history" variant="quiet">Abrir historial →</ButtonLink></Card></div></section></PageShell><Footer /></main>; }
