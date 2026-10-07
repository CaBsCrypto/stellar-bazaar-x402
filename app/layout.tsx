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

export const maxDuration = 15;

export const metadata: Metadata = {
  metadataBase: new URL('https://bazaar.browns.studio'),
  title: "Stellar Bazaar x402 — Marketplace de Servicios de IA para Agentes Autónomos",
  description: "Capa de descubrimiento y enrutamiento de pagos x402 en Stellar Testnet (USDC) para herramientas MCP y APIs consumidas por agentes autónomos de IA.",
  openGraph: {
    title: "Stellar Bazaar x402 — Marketplace de Servicios de IA para Agentes",
    description: "Conecta tu agente por MCP, publica servicios y compra entregas de texto con x402 y USDC de Stellar testnet.",
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
    description: "Conecta tu agente por MCP, publica servicios y compra entregas de texto con x402 y USDC de Stellar testnet.",
    images: ["/cover.jpg"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {children}
        {process.env.BAZAAR_ENABLE_MARKETPLACE !== 'true' && <WebMCPProvider />}
      </body>
    </html>
  );
}
