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

export interface StructuredError {
  code: string;
  message: string;
  retryable: boolean;
  stage: "discover" | "quote" | "authorize" | "settle" | "call";
}
