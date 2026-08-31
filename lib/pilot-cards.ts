export type PilotCard = {
  version: "bazaar.pilot-card/v1";
  id: string;
  categoryId: string;
  category: { es: string; en: string };
  title: { es: string; en: string };
  description: { es: string; en: string };
  tags: { es: string[]; en: string[] };
  kind: "http" | "mcp";
  execution: {
    model: "sync" | "async-job";
    status: "fixture-live" | "discovery-only";
    endpointVerified: true;
    method: "GET" | "POST";
    path: string;
  };
  payment: {
    status: "not-active" | "active-testnet";
    network: "stellar:testnet";
    scheme: "exact";
    priceProviderOwned: true;
    atomicAmount?: "10000";
    displayAmount?: "0.001 USDC";
    evidence?: { status: "verified-testnet"; transaction: string; ledger: number; checkedAt: string };
    blocker?: { es: string; en: string };
  };
  indexing: { status: "pilot-indexed"; source: "manual-https-qa" };
  links: { repository: string; deployment: string; health: string; serviceCard?: string };
  qa: { status: "passed"; checkedAt: string; sourceCommit: string };
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
    description: {
      es: "Endpoint HTTPS verificado que audita fixtures locales sin visitar el sitio indicado.",
      en: "Verified HTTPS endpoint that audits local fixtures without visiting the submitted site.",
    },
    tags: { es: ["piloto", "fixture", "auditoría web"], en: ["pilot", "fixture", "website audit"] },
    kind: "http",
    execution: { model: "sync", status: "fixture-live", endpointVerified: true, method: "POST", path: "/v1/x402/audits" },
    payment: { status: "active-testnet", network: "stellar:testnet", scheme: "exact", priceProviderOwned: true, atomicAmount: "10000", displayAmount: "0.001 USDC", evidence: { status: "verified-testnet", transaction: "bb47c3979c7a0031314685fea118687bcba26c4eddb3bb94ceccb980180514b0", ledger: 4424799, checkedAt: "2026-08-30" } },
    indexing: { status: "pilot-indexed", source: "manual-https-qa" },
    links: {
      repository: "https://github.com/CaBsCrypto/website-intelligence-provider",
      deployment: "https://website-intelligence-provider.vercel.app",
      health: "https://website-intelligence-provider.vercel.app/health",
      serviceCard: "https://website-intelligence-provider.vercel.app/v1/service-card",
    },
    qa: { status: "passed", checkedAt: "2026-08-30", sourceCommit: "dbcc7312c574a49cd7c6857116dc6c7685149f3f" },
    input: ["url", "language"],
    output: ["summary", "score", "findings", "network"],
  },
  {
    version: "bazaar.pilot-card/v1",
    id: "campaign-creator-pilot",
    categoryId: "campaign-creator",
    category: { es: "Crecimiento y marketing", en: "Growth & Marketing" },
    title: { es: "Creador de campañas", en: "Campaign Creator" },
    description: {
      es: "Endpoint HTTPS verificado para estrategia, copy y calendario deterministas en modo fixture.",
      en: "Verified HTTPS endpoint for deterministic strategy, copy and calendar output in fixture mode.",
    },
    tags: { es: ["piloto", "fixture", "campañas"], en: ["pilot", "fixture", "campaigns"] },
    kind: "http",
    execution: { model: "sync", status: "fixture-live", endpointVerified: true, method: "POST", path: "/api/campaign" },
    payment: { status: "not-active", network: "stellar:testnet", scheme: "exact", priceProviderOwned: true },
    indexing: { status: "pilot-indexed", source: "manual-https-qa" },
    links: {
      repository: "https://github.com/CaBsCrypto/campaign-creator-provider",
      deployment: "https://campaign-creator-provider.vercel.app",
      health: "https://campaign-creator-provider.vercel.app/health",
    },
    qa: { status: "passed", checkedAt: "2026-08-22", sourceCommit: "2a39053e556d9dbbf0ec51ba09bcf2a62b7548bb" },
    input: ["url", "objective", "locale", "days", "channels"],
    output: ["strategy", "copy", "calendar", "metadata"],
  },
  {
    version: "bazaar.pilot-card/v1",
    id: "research-scout-pilot",
    categoryId: "research-scout",
    category: { es: "Investigación y datos", en: "Research & Data" },
    title: { es: "Explorador de investigación", en: "Research Scout" },
    description: {
      es: "Endpoint HTTPS verificado que sintetiza únicamente fuentes y extractos aportados por quien llama.",
      en: "Verified HTTPS endpoint that synthesizes only caller-supplied sources and excerpts.",
    },
    tags: { es: ["piloto", "fixture", "investigación"], en: ["pilot", "fixture", "research"] },
    kind: "http",
    execution: { model: "sync", status: "fixture-live", endpointVerified: true, method: "POST", path: "/v1/research" },
    payment: { status: "not-active", network: "stellar:testnet", scheme: "exact", priceProviderOwned: true },
    indexing: { status: "pilot-indexed", source: "manual-https-qa" },
    links: {
      repository: "https://github.com/CaBsCrypto/research-scout-provider",
      deployment: "https://research-scout-provider.vercel.app",
      health: "https://research-scout-provider.vercel.app/health",
    },
    qa: { status: "passed", checkedAt: "2026-08-22", sourceCommit: "4313c379beedb69aaab4ff0b99def8bdef91b223" },
    input: ["query", "locale", "sources", "maxSources"],
    output: ["summary", "findings", "citations", "limitations"],
  },
  {
    version: "bazaar.pilot-card/v1",
    id: "video-repurpose-pilot",
    categoryId: "video-repurpose",
    category: { es: "Estudio creativo", en: "Creative Studio" },
    title: { es: "Reutilización de video", en: "Video Repurpose" },
    description: {
      es: "Contrato HTTPS de descubrimiento verificado. No procesa videos ni mantiene jobs durables en el deployment público.",
      en: "Verified HTTPS discovery contract. The public deployment does not process video or retain durable jobs.",
    },
    tags: { es: ["piloto", "fixture", "asíncrono"], en: ["pilot", "fixture", "async"] },
    kind: "http",
    execution: { model: "async-job", status: "discovery-only", endpointVerified: true, method: "GET", path: "/" },
    payment: { status: "not-active", network: "stellar:testnet", scheme: "exact", priceProviderOwned: true },
    indexing: { status: "pilot-indexed", source: "manual-https-qa" },
    links: {
      repository: "https://github.com/CaBsCrypto/video-repurpose-provider",
      deployment: "https://video-repurpose-provider.vercel.app",
      health: "https://video-repurpose-provider.vercel.app/health",
    },
    qa: { status: "passed", checkedAt: "2026-08-22", sourceCommit: "294335ed29a80b5cc8ad9fa22e53bbecaa40c39c" },
    input: ["sourceUrl", "locale", "targets"],
    output: ["jobId", "status", "fixture artifacts"],
  },
  {
    version: "bazaar.pilot-card/v1",
    id: "design-brief-pilot",
    categoryId: "design-brief",
    category: { es: "Estudio creativo", en: "Creative Studio" },
    title: { es: "Generador de brief de diseño", en: "Design Brief Generator" },
    description: {
      es: "Endpoint HTTPS verificado que genera briefs bilingües deterministas sin visitar URLs externas.",
      en: "Verified HTTPS endpoint that generates deterministic bilingual briefs without fetching external URLs.",
    },
    tags: { es: ["piloto", "fixture", "brief"], en: ["pilot", "fixture", "brief"] },
    kind: "http",
    execution: { model: "sync", status: "fixture-live", endpointVerified: true, method: "POST", path: "/api" },
    payment: { status: "not-active", network: "stellar:testnet", scheme: "exact", priceProviderOwned: true },
    indexing: { status: "pilot-indexed", source: "manual-https-qa" },
    links: {
      repository: "https://github.com/CaBsCrypto/design-brief-provider",
      deployment: "https://design-brief-provider.vercel.app",
      health: "https://design-brief-provider.vercel.app/health",
    },
    qa: { status: "passed", checkedAt: "2026-08-22", sourceCommit: "8aebc915c7d7fc85d5ec53290983acf8c308aec9" },
    input: ["url or brand", "locale", "projectType", "goals", "constraints"],
    output: ["brief", "sections", "acceptance criteria"],
  },
  {
    version: "bazaar.pilot-card/v1",
    id: "brand-identity-studio-pilot",
    categoryId: "brand-identity-studio",
    category: { es: "Paquete de capacidades", en: "Workflow Bundle" },
    title: { es: "Estudio de identidad de marca", en: "Brand Identity Studio" },
    description: {
      es: "Discovery HTTPS verificado para un workflow fixture con aprobación humana; sin generación externa ni almacenamiento durable.",
      en: "Verified HTTPS discovery for a fixture workflow with human approval; no external generation or durable storage.",
    },
    tags: { es: ["piloto", "fixture", "identidad de marca"], en: ["pilot", "fixture", "brand identity"] },
    kind: "http",
    execution: { model: "async-job", status: "discovery-only", endpointVerified: true, method: "GET", path: "/" },
    payment: { status: "not-active", network: "stellar:testnet", scheme: "exact", priceProviderOwned: true },
    indexing: { status: "pilot-indexed", source: "manual-https-qa" },
    links: {
      repository: "https://github.com/CaBsCrypto/brand-identity-studio-provider",
      deployment: "https://brand-identity-studio-provider.vercel.app",
      health: "https://brand-identity-studio-provider.vercel.app/health",
      serviceCard: "https://github.com/CaBsCrypto/brand-identity-studio-provider/blob/main/service-card/brand-identity-studio.v1.json",
    },
    qa: { status: "passed", checkedAt: "2026-08-22", sourceCommit: "ce8ada89f0378802bcb62a0027abcb35fcd8175d" },
    input: ["brand intake", "locale", "approval decision"],
    output: ["strategy brief", "approval state", "demo visual artifacts"],
  },
];

export const pilotCapabilityCard = {
  version: "bazaar.capabilities/v1",
  localeDefault: "es",
  locales: ["es", "en"],
  transport: { httpDiscovery: true, mcpStreamableHttp: true },
  operations: { discover: true, inspect: true, validate: true, execute: false, pay: false, sign: false, custody: false },
  serviceStatusValues: ["fixture-live", "discovery-only", "pilot-indexed", "not-active", "active-testnet"],
  policy: { metadataUntrusted: true, arbitraryUrlsRejected: true, providerEndpointRequiredForExecution: true },
} as const;
