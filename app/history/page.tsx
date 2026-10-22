import "./deliveries.css";
import type { Metadata } from "next";
import { HistoryEntry } from "@/components/HistoryEntry";
import { selectedServiceId } from '@/lib/service-selection';
import "./history.css";
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Private history — Stellar Bazaar",
  robots: { index: false, follow: false },
};

export default async function HistoryPage({searchParams}:{searchParams:Promise<{service?:string|string[]}>}) {
  return <HistoryEntry marketEnabled={process.env.BAZAAR_ENABLE_MARKETPLACE === 'true'} demoEnabled={process.env.BAZAAR_PUBLIC_DEMO === 'true'} serviceId={selectedServiceId((await searchParams).service)} />;
}

