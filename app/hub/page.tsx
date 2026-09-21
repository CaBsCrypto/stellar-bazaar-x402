import {Navbar} from "@/components/Navbar";
import {Footer} from "@/components/Footer";
import {AgentHub} from "@/components/AgentHub";
import {PageShell,Pill} from "@/components/ui";
export default function HubPage(){return <main><Navbar/><PageShell className="connect-page"><Pill tone="info">Conexión de agentes · Testnet</Pill><h1 className="ui-page-title">Conecta tu agente</h1><p className="ui-muted">Elige comprar, preparar un servicio o conectar por MCP. Las instrucciones y decisiones siguen en tu chat.</p><AgentHub/></PageShell><Footer/></main>;}
