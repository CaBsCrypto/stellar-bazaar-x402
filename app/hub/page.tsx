
import {Navbar} from "@/components/Navbar";
import {Footer} from "@/components/Footer";
import {AgentHub,type AgentHubTab} from "@/components/AgentHub";
import {PageShell} from "@/components/ui";
import {selectedServiceId} from '@/lib/service-selection';
export default async function HubPage({searchParams}:{searchParams:Promise<{service?:string|string[];tab?:string|string[]}>}){const params=await searchParams,serviceId=selectedServiceId(params.service),initialTab:AgentHubTab=params.tab==='buy'||params.tab==='sell'||params.tab==='connect'?params.tab:'connect';return <main><Navbar/><PageShell className="connect-page"><AgentHub key={initialTab} serviceId={serviceId} headingLevel={1} initialTab={initialTab}/></PageShell><Footer/></main>;}
