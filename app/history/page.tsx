import "./deliveries.css";
import type { Metadata } from "next";
import { OperationHistory } from "@/components/OperationHistory";
import "./history.css";

export const metadata: Metadata = {
  title: "Historial privado / Private history — Stellar Bazaar",
  robots: { index: false, follow: false },
};

export default function HistoryPage() {
  return <OperationHistory />;
}
