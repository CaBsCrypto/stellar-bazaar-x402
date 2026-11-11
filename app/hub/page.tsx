
import {Navbar} from "@/components/Navbar";
import {Footer} from "@/components/Footer";
import {AgentHub,type AgentHubTab} from "@/components/AgentHub";
import {PageShell} from "@/components/ui";
import {selectedServiceId} from '@/lib/service-selection';
export default async function HubPage({searchParams}:{searchParams:Promise<{service?:string|string[];tab?:string|string[]}>}) {
 const {service,tab}=await searchParams;
 const serviceId=selectedServiceId(service);
 const initialTab:AgentHubTab=tab==='buy'||tab==='sell'||tab==='connect'?tab:serviceId?'buy':'connect';
 return <main><Navbar/><PageShell className="connect-page"><AgentHub key={initialTab} serviceId={serviceId} headingLevel={1} initialTab={initialTab}/></PageShell><Footer/></main>;
}
