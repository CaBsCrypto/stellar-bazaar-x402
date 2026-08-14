import type { Metadata } from "next";
import "./globals.css";
import "./reference.css";
import "./product.css";
import "./publisher.css";
import "./testnet.css";

export const metadata: Metadata = {
  title: "Stellar Bazaar x402 — Discovery POC",
  description: "Catálogo mock Stellar-native de servicios HTTP y MCP pagados."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
