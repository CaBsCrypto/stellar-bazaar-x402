import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { BuyerExecutionDemo } from "@/components/BuyerExecutionDemo";
import { WebsiteIntelligenceConsumption } from "@/components/WebsiteIntelligenceConsumption";

export default function BuyerExecutionPage() {
  return <main>
    <div className="mock-banner">BUYER WORKSPACE · TESTNET EVIDENCE + LOCAL CONTRACT FIXTURES · NON-CUSTODIAL</div>
    <Navbar />
    <div className="shell"><WebsiteIntelligenceConsumption /><BuyerExecutionDemo /></div>
    <footer className="shell"><div className="brand"><span>✦</span> Stellar Bazaar x402</div><p>Buyer-controlled · Non-custodial · Testnet evidence and local fixtures</p></footer>
  </main>;
}

