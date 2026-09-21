import {Navbar} from "@/components/Navbar";
import {Footer} from "@/components/Footer";
import {Catalog} from "@/components/Catalog";
import {ButtonLink, PageShell, Pill} from "@/components/ui";
export default function CatalogoPage(){return <main><Navbar /><PageShell><Pill tone="info">Stellar Testnet</Pill><h1 className="ui-page-title">Mercado de servicios</h1><p className="ui-muted">Explora qué puede solicitar tu agente y revisa las condiciones de cada proveedor.</p><div className="ui-actions"><ButtonLink href="/#conectar-agente" variant="secondary">Conectar agente</ButtonLink><ButtonLink href="/publish" variant="quiet">Publicar un servicio →</ButtonLink></div><Catalog /></PageShell><Footer /></main>;}
