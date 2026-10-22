import type { Metadata } from 'next';
import PilotOnboarding from '@/components/PilotOnboarding';
import {selectedServiceId} from '@/lib/service-selection';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title:'Conecta tu agente y crea tu espacio | Bazaar',description:'Alta abierta de espacios privados para agentes externos. Catálogo público, MCP y recuperación privada.',referrer:'no-referrer' };
export default async function OpenPage({searchParams}:{searchParams:Promise<{service?:string|string[]}>}){return <PilotOnboarding enabled={process.env.BAZAAR_ENABLE_OPEN_WORKSPACES==='true'} paused={process.env.BAZAAR_WORKSPACE_CREATION_PAUSED==='true'} serviceId={selectedServiceId((await searchParams).service)}/>;}
