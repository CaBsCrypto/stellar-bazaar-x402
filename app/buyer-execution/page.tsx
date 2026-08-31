import Link from "next/link";
import { BuyerExecutionDemo } from "@/components/BuyerExecutionDemo";
import { WebsiteIntelligenceConsumption } from "@/components/WebsiteIntelligenceConsumption";

export default function BuyerExecutionPage() {
  return <main>
    <div className="mock-banner">BUYER WORKSPACE · TESTNET EVIDENCE + LOCAL CONTRACT FIXTURES · NON-CUSTODIAL</div>
    <nav className="nav shell">
      <Link href="/" className="brand"><span>✦</span> Stellar Bazaar <sup>x402</sup></Link>
      <div className="nav-links"><Link href="/#catalogo">Catálogo</Link><Link href="/payment-flow">Modelo x402</Link><Link href="/resources/swap-risk-quote">Service card</Link><Link href="/docs">Docs</Link></div>
      <span className="network-pill"><i /> Stellar Testnet · 1 verified purchase</span>
    </nav>
    <div className="shell"><WebsiteIntelligenceConsumption /><BuyerExecutionDemo /></div>
    <footer className="shell"><div className="brand"><span>✦</span> Stellar Bazaar x402</div><p>Buyer-controlled · Non-custodial · Testnet evidence and local fixtures</p></footer>
  </main>;
}

