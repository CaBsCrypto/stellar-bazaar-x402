"use client";

import { useState } from "react";

const evidence = {
  network: "Stellar Testnet",
  scheme: "exact",
  symbol: "USDC",
  atomicAmount: "10000",
  displayAmount: "0.001 USDC",
  transaction: "9dfb7e3045e40d59fb51c8eb2ec6fe60dc15560e48888933103c5652eced937f",
  ledger: 4129217,
  timestamp: "2026-08-14T00:31:11Z",
  payer: "GC3CK5A4…CTB2VDL4",
  recipient: "GDVR2KDK…BMW6RMCQ",
};

type DemoResponse = {
  status?: number;
  paymentResponsePresent?: boolean;
  body?: {
    payment?: {
      network?: string;
      transaction?: string;
      payer?: string;
      recipient?: string;
      amount?: string;
    };
  };
  error?: { code?: string; message?: string };
};

const shortAddress = (value?: string) =>
  value && value.length > 18 ? `${value.slice(0, 9)}…${value.slice(-8)}` : value ?? "—";

export function TestnetPaymentDemo() {
  const [result, setResult] = useState<DemoResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const response = await fetch("/api/x402/demo-pay", { method: "POST" });
      setResult((await response.json()) as DemoResponse);
    } finally {
      setLoading(false);
    }
  }

  const liveReceipt = result?.body?.payment;
  return (
    <section className="testnet-box" aria-labelledby="testnet-payment-title">
      <span>EVIDENCIA TESTNET · EXACT · SIN MAINNET</span>
      <h3 id="testnet-payment-title">Recibo x402 verificado</h3>
      <p>
        Evidencia pública de una única liquidación local validada. No implica producción,
        auditoría, custodia ni disponibilidad pública del flujo de pago.
      </p>

      <dl className="receipt-grid">
        <div><dt>Red / Network</dt><dd>{evidence.network}</dd></div>
        <div><dt>Esquema / Scheme</dt><dd><code>{evidence.scheme}</code></dd></div>
        <div><dt>Monto / Amount</dt><dd>{evidence.displayAmount} <small>({evidence.atomicAmount} atomic)</small></dd></div>
        <div><dt>Activo / Asset</dt><dd>{evidence.symbol} · SEP-41 Testnet</dd></div>
        <div><dt>Ledger</dt><dd>{evidence.ledger}</dd></div>
        <div><dt>Fecha / Timestamp</dt><dd><time dateTime={evidence.timestamp}>{evidence.timestamp}</time></dd></div>
        <div><dt>Pagador / Payer</dt><dd><code>{evidence.payer}</code></dd></div>
        <div><dt>Destino / Recipient</dt><dd><code>{evidence.recipient}</code></dd></div>
      </dl>
      <a
        className="receipt-link"
        href={`https://stellar.expert/explorer/testnet/tx/${evidence.transaction}`}
        target="_blank"
        rel="noreferrer"
      >
        Ver transacción Testnet {evidence.transaction.slice(0, 10)}…{evidence.transaction.slice(-8)}
      </a>

      <div className="demo-control">
        <h4>Repetición local opcional</h4>
        <p>
          La seed permanece server-only. Este control está deshabilitado salvo configuración local
          explícita y cada uso crea un nuevo pago Testnet.
        </p>
        <button className="primary" onClick={run} disabled={loading}>
          {loading ? "Autorizando en Testnet…" : "Probar pago Testnet local"}
        </button>
      </div>

      {result && (
        <div className="live-result" aria-live="polite">
          <strong>{liveReceipt ? "Nuevo recibo Testnet" : "Resultado local"}</strong>
          {liveReceipt ? (
            <ul>
              <li>Estado HTTP: {result.status ?? 200}</li>
              <li>PAYMENT-RESPONSE: {result.paymentResponsePresent ? "presente" : "ausente"}</li>
              <li>Tx: {shortAddress(liveReceipt.transaction)}</li>
              <li>Pagador: {shortAddress(liveReceipt.payer)}</li>
              <li>Destino: {shortAddress(liveReceipt.recipient)}</li>
              <li>Monto atomic: {liveReceipt.amount ?? "—"}</li>
            </ul>
          ) : (
            <p>{result.error?.message ?? "El pago local no se completó."}</p>
          )}
        </div>
      )}
    </section>
  );
}
