import { services } from "./catalog";
import { pilotCards } from "./pilot-cards";

export const PAYMENT_FLOW_VERSION = "bazaar.payment-flow/v1" as const;

export type PaymentFlowStatus =
  | "available"
  | "buyer-controlled"
  | "fixture"
  | "testnet-evidence"
  | "pending-provider"
  | "inactive";

export type PaymentFlowStageId =
  | "discover"
  | "quote"
  | "challenge-402"
  | "buyer-policy"
  | "settle"
  | "delivery"
  | "receipt";

export type PaymentFlowStage = {
  id: PaymentFlowStageId;
  order: number;
  actor: "bazaar" | "provider" | "buyer" | "facilitator";
  title: { es: string; en: string };
  description: { es: string; en: string };
  status: PaymentFlowStatus;
};

export type PaymentFlowSnapshot = {
  version: typeof PAYMENT_FLOW_VERSION;
  serviceId: string;
  serviceName: string;
  source: "catalog" | "pilot-card";
  network: "stellar:testnet";
  executionMode: "reference-local" | "fixture-live" | "discovery-only" | "fixture-only";
  paymentMode: "historical-testnet-evidence" | "inactive";
  currentRun: "visualization-only";
  stages: PaymentFlowStage[];
  boundaries: {
    custody: false;
    signsForBuyer: false;
    settlesFromUi: false;
    invokesProviderFromUi: false;
    policyOwner: "buyer";
  };
};

const stageCopy: Record<PaymentFlowStageId, Omit<PaymentFlowStage, "status">> = {
  discover: {
    id: "discover",
    order: 1,
    actor: "bazaar",
    title: { es: "Descubrir", en: "Discover" },
    description: {
      es: "Bazaar devuelve una card versionada y metadata tratada como no confiable.",
      en: "Bazaar returns a versioned card and metadata treated as untrusted.",
    },
  },
  quote: {
    id: "quote",
    order: 2,
    actor: "provider",
    title: { es: "Inspeccionar quote", en: "Inspect quote" },
    description: {
      es: "El buyer inspecciona inputs, output, red, asset, precio y términos declarados.",
      en: "The buyer inspects declared inputs, output, network, asset, price, and terms.",
    },
  },
  "challenge-402": {
    id: "challenge-402",
    order: 3,
    actor: "provider",
    title: { es: "Recibir 402", en: "Receive 402" },
    description: {
      es: "El provider puede responder PAYMENT-REQUIRED. Esta UI no envía la solicitud.",
      en: "The provider may return PAYMENT-REQUIRED. This UI sends no request.",
    },
  },
  "buyer-policy": {
    id: "buyer-policy",
    order: 4,
    actor: "buyer",
    title: { es: "Autorizar por política", en: "Authorize by policy" },
    description: {
      es: "La política del buyer decide límites y aprobación. Bazaar no firma ni autoriza fondos.",
      en: "Buyer policy decides limits and approval. Bazaar does not sign or authorize funds.",
    },
  },
  settle: {
    id: "settle",
    order: 5,
    actor: "facilitator",
    title: { es: "Liquidar", en: "Settle" },
    description: {
      es: "Un facilitator externo verificaría y liquidaría. La visualización no lo invoca.",
      en: "An external facilitator would verify and settle. The visualization never invokes it.",
    },
  },
  delivery: {
    id: "delivery",
    order: 6,
    actor: "provider",
    title: { es: "Entregar resultado", en: "Deliver result" },
    description: {
      es: "El provider, no Bazaar, entrega el resultado bajo su contrato declarado.",
      en: "The provider, not Bazaar, delivers the result under its declared contract.",
    },
  },
  receipt: {
    id: "receipt",
    order: 7,
    actor: "buyer",
    title: { es: "Reconciliar recibo", en: "Reconcile receipt" },
    description: {
      es: "El cliente compara red, asset, monto, destino, card y receipt antes de afirmar settlement.",
      en: "The client compares network, asset, amount, destination, card, and receipt before claiming settlement.",
    },
  },
};

function buildStages(paymentMode: PaymentFlowSnapshot["paymentMode"], executionMode: PaymentFlowSnapshot["executionMode"]) {
  const paymentEvidence = paymentMode === "historical-testnet-evidence";
  const deliveryStatus: PaymentFlowStatus = executionMode === "reference-local" || executionMode === "fixture-live"
    ? "fixture"
    : executionMode === "discovery-only"
      ? "pending-provider"
      : "inactive";
  const statuses: Record<PaymentFlowStageId, PaymentFlowStatus> = {
    discover: "available",
    quote: paymentEvidence ? "available" : "pending-provider",
    "challenge-402": paymentEvidence ? "testnet-evidence" : "inactive",
    "buyer-policy": "buyer-controlled",
    settle: paymentEvidence ? "testnet-evidence" : "inactive",
    delivery: deliveryStatus,
    receipt: paymentEvidence ? "testnet-evidence" : "inactive",
  };
  return (Object.keys(stageCopy) as PaymentFlowStageId[]).map((id) => ({ ...stageCopy[id], status: statuses[id] }));
}

export function getPaymentFlow(serviceId: string): PaymentFlowSnapshot | undefined {
  const service = services.find((item) => item.id === serviceId);
  if (service) {
    const isReference = service.id === "swap-risk-quote";
    const paymentMode = isReference ? "historical-testnet-evidence" : "inactive";
    const executionMode = isReference ? "reference-local" : "fixture-only";
    return {
      version: PAYMENT_FLOW_VERSION,
      serviceId: service.id,
      serviceName: service.name,
      source: "catalog",
      network: "stellar:testnet",
      executionMode,
      paymentMode,
      currentRun: "visualization-only",
      stages: buildStages(paymentMode, executionMode),
      boundaries: {
        custody: false,
        signsForBuyer: false,
        settlesFromUi: false,
        invokesProviderFromUi: false,
        policyOwner: "buyer",
      },
    };
  }

  const pilot = pilotCards.find((item) => item.id === serviceId);
  if (!pilot) return undefined;
  const executionMode = pilot.execution.status;
  return {
    version: PAYMENT_FLOW_VERSION,
    serviceId: pilot.id,
    serviceName: `${pilot.title.es} / ${pilot.title.en}`,
    source: "pilot-card",
    network: "stellar:testnet",
    executionMode,
    paymentMode: "inactive",
    currentRun: "visualization-only",
    stages: buildStages("inactive", executionMode),
    boundaries: {
      custody: false,
      signsForBuyer: false,
      settlesFromUi: false,
      invokesProviderFromUi: false,
      policyOwner: "buyer",
    },
  };
}

export const paymentFlowCapability = {
  version: PAYMENT_FLOW_VERSION,
  stages: Object.keys(stageCopy),
  mode: "read-only-visualization",
  sideEffects: {
    wallet: false,
    signing: false,
    payment: false,
    settlement: false,
    providerInvocation: false,
  },
  notice: {
    es: "Describe responsabilidades y estados; no ejecuta pagos.",
    en: "Describes responsibilities and states; it executes no payments.",
  },
} as const;
