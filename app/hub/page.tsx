import {Navbar} from "@/components/Navbar";
import {Footer} from "@/components/Footer";
import {AgentHub} from "@/components/AgentHub";
import {PageShell} from "@/components/ui";
export default function HubPage(){return <main><Navbar/><PageShell className="connect-page"><header className="connect-heading"><h1 className="ui-page-title">Conecta tu agente</h1><p className="ui-muted">Elige cómo empezar. Copia las instrucciones y continúa en el chat de tu agente.</p></header><AgentHub/></PageShell><Footer/></main>;}
