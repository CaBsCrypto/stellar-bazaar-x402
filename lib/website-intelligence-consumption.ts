import { canonicalInputHash } from "./website-intelligence-readiness.ts";

export const WEBSITE_INTELLIGENCE_PUBLIC_BASE_URL = "https://website-intelligence-provider.vercel.app";
export const WEBSITE_INTELLIGENCE_PUBLIC_CARD_URL = `${WEBSITE_INTELLIGENCE_PUBLIC_BASE_URL}/v1/service-card`;
export const WEBSITE_INTELLIGENCE_PUBLIC_ENDPOINT = `${WEBSITE_INTELLIGENCE_PUBLIC_BASE_URL}/v1/x402/audits`;

export const verifiedWebsiteIntelligenceDelivery = {
  version: "bazaar.verified-delivery/v1",
  evidence: "historical-testnet-purchase",
  provider: "website-intelligence",
  request: { url: "https://example.com", language: "es" },
  payment: {
    status: "settled",
    network: "stellar:testnet",
    scheme: "exact",
    assetSymbol: "USDC",
    atomicAmount: "10000",
    displayAmount: "0.001 USDC",
    transactionHash: "bb47c3979c7a0031314685fea118687bcba26c4eddb3bb94ceccb980180514b0",
    ledger: 4424799,
    explorerUrl: "https://stellar.expert/explorer/testnet/tx/bb47c3979c7a0031314685fea118687bcba26c4eddb3bb94ceccb980180514b0",
  },
  result: {
    schemaVersion: "1.0",
    provider: "website-intelligence",
    mode: "fixture",
    requestedUrl: "https://example.com",
    canonicalUrl: "https://example.com/",
    fixtureId: "example-com-v1",
    language: "es",
    summary: "Auditoría local completada con puntuación 88/100 y 5 hallazgos.",
    score: 88,
    findings: [
      { id: "security.https", category: "security", severity: "info", title: "HTTPS habilitado", detail: "El fixture usa un origen cifrado.", evidence: "https=true" },
      { id: "accessibility.language", category: "accessibility", severity: "info", title: "Idioma del documento declarado", detail: "El fixture declara el idioma del documento.", evidence: "hasLanguage=true" },
      { id: "seo.description", category: "seo", severity: "medium", title: "Falta la meta descripción", detail: "Las vistas previas de búsqueda pueden carecer de un resumen útil.", evidence: "hasDescription=false" },
      { id: "accessibility.image-alt", category: "accessibility", severity: "info", title: "Alternativas de imagen completas", detail: "Todas las imágenes del fixture incluyen texto alternativo.", evidence: "images=0; withAlt=0" },
      { id: "performance.scripts", category: "performance", severity: "info", title: "Carga de scripts", detail: "La cantidad de scripts es un indicador determinista de rendimiento.", evidence: "scriptCount=0" },
    ],
    network: { attempted: false, allowed: false },
  },
  resultHash: "1f17669162f3742779ce990837c22c266ba60773d8f794fa838594fe14795ac8",
  reconciliation: {
    status: "matched",
    resultHashMatches: true,
    transactionMatchesReceipt: true,
    durableRecoveryVerified: true,
  },
  boundaries: {
    newPaymentPerformed: false,
    fixtureInputOnly: true,
    qualityCertifiedByBazaar: false,
    buyerSignerStoredByBazaar: false,
  },
} as const;

export function validateVerifiedWebsiteIntelligenceDelivery(delivery: unknown = verifiedWebsiteIntelligenceDelivery): boolean {
  try {
    const candidate = delivery as any;
    return canonicalInputHash(candidate.result) === candidate.resultHash
      && /^[0-9a-f]{64}$/.test(candidate.payment.transactionHash)
      && candidate.payment.ledger > 0
      && candidate.payment.status === "settled"
      && candidate.payment.network === "stellar:testnet"
      && candidate.payment.scheme === "exact"
      && candidate.payment.assetSymbol === "USDC"
      && candidate.payment.atomicAmount === "10000"
      && candidate.reconciliation.status === "matched"
      && candidate.reconciliation.resultHashMatches === true
      && candidate.reconciliation.transactionMatchesReceipt === true
      && candidate.reconciliation.durableRecoveryVerified === true
      && candidate.boundaries.newPaymentPerformed === false
      && candidate.boundaries.buyerSignerStoredByBazaar === false;
  } catch {
    return false;
  }
}
