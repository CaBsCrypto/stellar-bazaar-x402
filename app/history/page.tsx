import "./deliveries.css";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import "./history.css";

const OperationHistory = dynamic(
  () => import("@/components/OperationHistory").then((mod) => mod.OperationHistory),
  { ssr: false }
);

export const metadata: Metadata = {
  title: "Historial privado / Private history — Stellar Bazaar",
  robots: { index: false, follow: false },
};

export default function HistoryPage() {
  return <OperationHistory />;
}
