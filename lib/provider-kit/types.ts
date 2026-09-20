import type { PaymentScheme } from "../types.ts";

export interface ProviderServiceConfig {
  id: string;
  name: string;
  description: string;
  category?: string;
  tags: string[];
  pricing: {
    amountUsdc: string;
    scheme?: PaymentScheme;
    destinationAddress: string;
    feeBps?: number;
  };
  endpointUrl: string;
  routeTemplate?: string;
  input: Array<{
    name: string;
    type: "string" | "number" | "boolean";
    required: boolean;
  }>;
  provider: {
    name: string;
    website?: string;
  };
}

export interface DeliverableFileInput {
  id: string;
  path: string;
  contentType: string;
  content: string | Uint8Array;
  role: "primary-view" | "document" | "data" | "asset";
}

export interface StandardDeliveryEnvelope<T = unknown> {
  result: T;
  resultHash: string;
  bazaarDelivery?: {
    version: "bazaar.delivery-bundle/v1";
    serviceId: string;
    deliveredAt: string;
    manifestHash: string;
    files: Array<{
      id: string;
      path: string;
      contentType: string;
      sizeBytes: number;
      sha256: string;
      role: "primary-view" | "document" | "data" | "asset";
    }>;
  };
}
