import Link from "next/link";
import { PaymentFlowVisualizer } from "@/components/PaymentFlowVisualizer";

export default function PaymentFlowPage() {
  return (
    <main>
      <div className="mock-banner">STATE MACHINE POC · READ-ONLY · TESTNET EVIDENCE OR PAYMENT INACTIVE</div>
      <nav className="nav shell">
        <Link href="/" className="brand"><span>✦</span> Stellar Bazaar <sup>x402</sup></Link>
        <div className="nav-links">
          <Link href="/#catalogo">Catálogo</Link>
          <Link href="/#proveedores-verificados">Pilotos HTTPS</Link>
          <Link href="/onboarding">Onboarding</Link>
          <Link href="/docs">Docs</Link>
        </div>
        <span className="network-pill"><i /> No side effects</span>
      </nav>
      <div className="shell"><PaymentFlowVisualizer /></div>
      <footer className="shell">
        <div className="brand"><span>✦</span> Stellar Bazaar x402</div>
        <p>Read-only visualization · Non-custodial · Testnet only</p>
      </footer>
    </main>
  );
}
