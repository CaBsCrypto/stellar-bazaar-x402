export type ServiceKind = "http" | "mcp";
export type PaymentScheme = "exact" | "upto";

export interface PaidService {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  kind: ServiceKind;
  tags: string[];
  routeTemplate: string;
  provider: string;
  network: "stellar:testnet";
  payment: { scheme: PaymentScheme; asset: "USDC"; amount: string };
  latency: string;
  input: string[];
  output: string[];
  accent: "violet" | "mint" | "amber" | "blue";
  featured?: boolean;
}

export interface ServiceCard {
  version: "bazaar.service-card/v0";
  id: string;
  name: string;
  description: string;
  kind: ServiceKind;
  url: string;
  routeTemplate: string;
  input: Array<{ name: string; type: "string" | "number" | "boolean"; required: boolean }>;
  network: "stellar:testnet";
  payment: { scheme: PaymentScheme; asset: string; amount: string; destination: string };
  provider: { name: string };
  tags: string[];
}

export interface ValidationOutcome { rule: string; status: "pass" | "warning" | "fail"; reason: string }
export interface RankedService { service: PaidService; score: number; reasons: string[] }

export interface StructuredError {
  code: string;
  message: string;
  retryable: boolean;
  stage: "discover" | "quote" | "authorize" | "settle" | "call";
}
