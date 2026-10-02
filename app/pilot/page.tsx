import type { Metadata } from 'next';
import PilotOnboarding from '@/components/PilotOnboarding';
import {workspacePublicOrigin} from '@/lib/workspace-public-origin';

export const dynamic = 'force-dynamic';
export function generateMetadata(): Metadata {
  const origin = workspacePublicOrigin();
  if (origin) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error('Invalid pilot public origin');
  } else if (process.env.BAZAAR_ENABLE_OPEN_WORKSPACES === 'true' && process.env.BAZAAR_WORKSPACE_ADMISSION === 'invite-only') {
    throw new Error('Pilot public origin required');
  }
  const title = 'Tu espacio privado | Bazaar';
  const description = 'Acceso por invitación al piloto de conversaciones privadas con tu agente.';
  return {
    title, description, robots: { index: false, follow: false }, referrer: 'no-referrer',
    ...(origin ? { metadataBase: new URL(origin), alternates: { canonical: `${origin}/pilot` } } : {}),
    // Replace inherited marketplace metadata, including its unrelated domain.
    openGraph: { title, description, type: 'website', images: [], ...(origin ? { url: `${origin}/pilot` } : {}) },
    twitter: { card: 'summary', title, description, images: [] },
  };
}
export default function PilotPage() { return <PilotOnboarding />; }
