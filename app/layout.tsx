import type { Metadata } from "next";
import { WebMCPProvider } from "@/components/WebMCPProvider";
import "./globals.css";
import "./reference.css";
import "./product.css";
import "./publisher.css";
import "./testnet.css";
import "./workflow-showcase.css";
import "./onboarding.css";
import "./verified-providers.css";
import "./payment-flow.css";
import "./payment-receipt.css";
import "./buyer-execution.css";
import "./buyer-execution-additions.css";

export const metadata: Metadata = {
  title: "Stellar Bazaar x402 — Discovery POC",
  description: "Catálogo Stellar-native de servicios HTTP y MCP pagados; x402 en Testnet verificado on-chain."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {children}
        <WebMCPProvider />
      </body>
    </html>
  );
}
