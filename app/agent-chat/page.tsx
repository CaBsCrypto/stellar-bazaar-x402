import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { PrivateAgentChat } from '@/components/PrivateAgentChat';
export const metadata: Metadata = { title:'Conversación privada — Bazaar', description:'Mensajes privados para tu agente y acceso a tus entregas.', robots:{index:false,follow:false} };
export default function AgentChatPage(){return <main><Navbar prefetch={false}/><div className="shell" style={{marginTop:'1rem',marginBottom:'4rem'}}><PrivateAgentChat/></div><Footer prefetch={false}/></main>;}
