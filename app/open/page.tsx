import type { Metadata } from 'next';
import PilotOnboarding from '@/components/PilotOnboarding';
import {selectedServiceId} from '@/lib/service-selection';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title:'Connect your agent and create your workspace | Bazaar',description:'Open registration for private workspaces and external agents. Public catalogue, MCP and private recovery.',referrer:'no-referrer' };
export default async function OpenPage({searchParams}:{searchParams:Promise<{service?:string|string[]}>}){return <PilotOnboarding enabled={process.env.BAZAAR_ENABLE_OPEN_WORKSPACES==='true'} paused={process.env.BAZAAR_WORKSPACE_CREATION_PAUSED==='true'} serviceId={selectedServiceId((await searchParams).service)}/>;}
