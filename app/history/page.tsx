import "./deliveries.css";
import type { Metadata } from "next";
import { HistoryEntry } from "@/components/HistoryEntry";
import "./history.css";

export const metadata: Metadata = {
  title: "Historial privado / Private history — Stellar Bazaar",
  robots: { index: false, follow: false },
};

export default function HistoryPage() {
  return <HistoryEntry />;
}

