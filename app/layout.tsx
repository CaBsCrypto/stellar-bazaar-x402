import type { Metadata } from "next";
import { UiLanguageProvider } from "@/components/UiLanguage";
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
  title: "Stellar Bazaar x402 — AI Service Marketplace for Autonomous Agents",
  description: "Discover MCP services and route x402 payments in Stellar Testnet USDC through your own AI agent.",
  openGraph: {
    title: "Stellar Bazaar x402 — AI Service Marketplace for Agents",
    description: "Connect your agent through MCP, publish services and purchase text deliveries with x402 and Stellar Testnet USDC.",
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
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stellar Bazaar x402 — AI Agent Marketplace",
    description: "Connect your agent through MCP, publish services and purchase text deliveries with x402 and Stellar Testnet USDC.",
    images: ["/cover.jpg"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <UiLanguageProvider>{children}</UiLanguageProvider>
        {process.env.BAZAAR_ENABLE_MARKETPLACE !== 'true' && <WebMCPProvider />}
      </body>
    </html>
  );
}
