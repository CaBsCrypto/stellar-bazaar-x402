export type PilotCard = {
  version: "bazaar.pilot-card/v1";
  id: string;
  categoryId: string;
  category: { es: string; en: string };
  title: { es: string; en: string };
  description: { es: string; en: string };
  kind: "http" | "mcp";
  execution: { model: "sync" | "async-job"; status: "fixture-only"; endpointVerified: false };
  payment: { status: "not-active"; network: "stellar:testnet"; scheme: "exact"; priceProviderOwned: true };
  indexing: { status: "pilot-not-indexed" };
  input: string[];
  output: string[];
};

export const pilotCards: PilotCard[] = [
  {
    version: "bazaar.pilot-card/v1",
    id: "website-intelligence-pilot",
    categoryId: "website-intelligence",
    category: { es: "Inteligencia de sitios web", en: "Website Intelligence" },
    title: { es: "Auditoría estructurada de sitio", en: "Structured Website Audit" },
    description: { es: "Fixture para análisis técnico, contenido y señales públicas.", en: "Fixture for technical, content and public-signal analysis." },
    kind: "http",
    execution: { model: "sync", status: "fixture-only", endpointVerified: false },
    payment: { status: "not-active", network: "stellar:testnet", scheme: "exact", priceProviderOwned: true },
    indexing: { status: "pilot-not-indexed" },
    input: ["url", "locale"],
    output: ["summary", "findings", "disclaimer"]
  },
  {
    version: "bazaar.pilot-card/v1",
    id: "video-repurpose-pilot",
    categoryId: "video-repurpose",
    category: { es: "Reutilización de video", en: "Video Repurpose" },
    title: { es: "Paquete asíncrono multiformato", en: "Async Multi-format Package" },
    description: { es: "Fixture de job asíncrono; no procesa ni almacena videos hoy.", en: "Async-job fixture; it does not process or store videos today." },
    kind: "http",
    execution: { model: "async-job", status: "fixture-only", endpointVerified: false },
    payment: { status: "not-active", network: "stellar:testnet", scheme: "exact", priceProviderOwned: true },
    indexing: { status: "pilot-not-indexed" },
    input: ["sourceUrl", "target"],
    output: ["jobId", "status", "result"]
  },
  {
    version: "bazaar.pilot-card/v1",
    id: "agent-policy-pilot",
    categoryId: "agent-governance",
    category: { es: "Gobernanza y políticas de agentes", en: "Agent Governance & Policy" },
    title: { es: "Constructor y evaluador de políticas x402", en: "x402 Policy Builder & Evaluator" },
    description: { es: "Genera presupuestos acotados y evalúa compatibilidad de Service Cards antes de la firma.", en: "Drafts scoped budgets and evaluates Service Card compliance prior to payment." },
    kind: "mcp",
    execution: { model: "sync", status: "fixture-only", endpointVerified: false },
    payment: { status: "not-active", network: "stellar:testnet", scheme: "exact", priceProviderOwned: true },
    indexing: { status: "pilot-not-indexed" },
    input: ["budgetPerRequest", "permittedAssets", "riskTier"],
    output: ["policy", "decision", "matchedRules"]
  },
  {
    version: "bazaar.pilot-card/v1",
    id: "campaign-creator-pilot",
    categoryId: "campaign-creator",
    category: { es: "Creador de campañas", en: "Campaign Creator" },
    title: { es: "Brief y activos de campaña", en: "Campaign Brief & Assets" },
    description: { es: "Fixture para generar un plan de campaña con entregables declarados.", en: "Fixture for a campaign plan with declared deliverables." },
    kind: "mcp",
    execution: { model: "async-job", status: "fixture-only", endpointVerified: false },
    payment: { status: "not-active", network: "stellar:testnet", scheme: "exact", priceProviderOwned: true },
    indexing: { status: "pilot-not-indexed" },
    input: ["objective", "audience", "channels"],
    output: ["jobId", "status", "artifact"]
  },
  {
    version: "bazaar.pilot-card/v1",
    id: "research-scout-pilot",
    categoryId: "research-scout",
    category: { es: "Explorador de investigación", en: "Research Scout" },
    title: { es: "Mapa de fuentes y hallazgos", en: "Source & Findings Map" },
    description: { es: "Fixture de investigación con citas y límites visibles.", en: "Research fixture with visible citations and limitations." },
    kind: "mcp",
    execution: { model: "sync", status: "fixture-only", endpointVerified: false },
    payment: { status: "not-active", network: "stellar:testnet", scheme: "exact", priceProviderOwned: true },
    indexing: { status: "pilot-not-indexed" },
    input: ["question", "constraints"],
    output: ["sources", "findings", "uncertainty"]
  },
  {
    version: "bazaar.pilot-card/v1",
    id: "design-brief-pilot",
    categoryId: "design-brief",
    category: { es: "Brief de diseño", en: "Design Brief" },
    title: { es: "Especificación visual estructurada", en: "Structured Visual Specification" },
    description: { es: "Fixture para transformar contexto en requisitos de diseño verificables.", en: "Fixture for turning context into verifiable design requirements." },
    kind: "mcp",
    execution: { model: "sync", status: "fixture-only", endpointVerified: false },
    payment: { status: "not-active", network: "stellar:testnet", scheme: "exact", priceProviderOwned: true },
    indexing: { status: "pilot-not-indexed" },
    input: ["context", "audience", "constraints"],
    output: ["brief", "acceptanceCriteria", "openQuestions"]
  }
];

export const pilotCapabilityCard = {
  version: "bazaar.capabilities/v1",
  localeDefault: "es",
  locales: ["es", "en"],
  transport: { httpDiscovery: true, mcpStreamableHttp: true },
  operations: { discover: true, inspect: true, validate: true, execute: false, pay: false, sign: false, custody: false },
  serviceStatusValues: ["active-local", "fixture-only", "provider-unverified", "testnet-validated", "not-active", "payment-not-active"],
  policy: { metadataUntrusted: true, arbitraryUrlsRejected: true, providerEndpointRequiredForExecution: true }
} as const;

