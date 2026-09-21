import type { Metadata } from "next";
import { WebMCPProvider } from "@/components/WebMCPProvider";
import "@/styles/tokens.css";
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
import "@/styles/ui.css";

export const metadata: Metadata = {
  title: "Stellar Bazaar x402 — Marketplace de Servicios de IA para Agentes Autónomos",
  description: "Capa de descubrimiento y enrutamiento de pagos x402 en Stellar Testnet (USDC) para herramientas MCP y APIs consumidas por agentes autónomos de IA.",
  openGraph: {
    title: "Stellar Bazaar x402 — Marketplace de Servicios de IA para Agentes",
    description: "Descubre, invoca y monetiza APIs mediante W3C WebMCP y micropagos instantáneos x402 en USDC sobre Stellar.",
    url: "https://bazaar.browns.studio",
    siteName: "Stellar Bazaar x402",
    images: [
      {
        url: "/cover.jpg",
        width: 1200,
        height: 630,
        alt: "Stellar Bazaar x402",
      },
    ],
    locale: "es_ES",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stellar Bazaar x402 — AI Agent Marketplace",
    description: "Descubre, invoca y monetiza APIs mediante W3C WebMCP y micropagos instantáneos x402 en USDC sobre Stellar.",
    images: ["/cover.jpg"],
  },
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
