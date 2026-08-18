import type { WorkflowBundle } from "./workflow-bundle.ts";

export const workflowBundles: WorkflowBundle[] = [
  {
    version: "bazaar.workflow-bundle/v1",
    id: "brand-identity-bundle",
    title: {
      es: "Identidad de marca",
      en: "Brand Identity",
    },
    objective: {
      es: "Producir una base de identidad visual verificable a partir de evidencia y decisiones explícitas.",
      en: "Produce a verifiable visual identity foundation from explicit evidence and decisions.",
    },
    services: [
      { id: "research-scout-pilot", version: "bazaar.pilot-card/v1" },
      { id: "design-brief-pilot", version: "bazaar.pilot-card/v1" },
      { id: "campaign-creator-pilot", version: "bazaar.pilot-card/v1" },
    ],
    stages: [
      {
        order: 0,
        capability: "research-scout-pilot",
        input: ["question", "constraints"],
        outputArtifact: {
          type: "research-map",
          mediaType: "application/json",
          schemaVersion: "bazaar.artifact/research-map-v1",
        },
      },
      {
        order: 1,
        capability: "design-brief-pilot",
        input: ["context", "audience", "constraints"],
        outputArtifact: {
          type: "design-brief",
          mediaType: "application/json",
          schemaVersion: "bazaar.artifact/design-brief-v1",
        },
        approvalGate: true,
        next: 2,
      },
      {
        order: 2,
        capability: "campaign-creator-pilot",
        input: ["objective", "audience", "channels"],
        outputArtifact: {
          type: "brand-visuals",
          mediaType: "application/json",
          schemaVersion: "bazaar.artifact/brand-visuals-v1",
        },
      },
    ],
    handoffArtifact: {
      type: "bundle-manifest",
      mediaType: "application/json",
      schemaVersion: "bazaar.artifact/bundle-manifest-v1",
      integrity: "sha256-of-artifact-manifest",
    },
    aggregatePrice: {
      entries: [
        {
          provider: "Research Scout (pilot fixture)",
          asset: "USDC",
          network: "stellar:testnet",
          scheme: "exact",
          amount: "0.010",
        },
        {
          provider: "Design Brief (pilot fixture)",
          asset: "USDC",
          network: "stellar:testnet",
          scheme: "exact",
          amount: "0.015",
        },
        {
          provider: "Campaign Creator (pilot fixture)",
          asset: "USDC",
          network: "stellar:testnet",
          scheme: "exact",
          amount: "0.020",
        },
      ],
      status: "estimate",
    },
    status: "ready",
    policy: {
      allowlist: ["research-scout-pilot", "design-brief-pilot", "campaign-creator-pilot"],
      budget: "0.10",
      expiry: "2026-12-31T00:00:00Z",
      artifacts: "client-owned; bazaar validates shape only, never content.",
    },
  },
  {
    version: "bazaar.workflow-bundle/v1",
    id: "campaign-launch-bundle",
    title: {
      es: "Lanzamiento de campaña",
      en: "Campaign Launch",
    },
    objective: {
      es: "Combinar investigación y creativos para un plan de campaña acotado.",
      en: "Combine research and creative output into a scoped campaign plan.",
    },
    services: [
      { id: "research-scout-pilot", version: "bazaar.pilot-card/v1" },
      { id: "campaign-creator-pilot", version: "bazaar.pilot-card/v1" },
    ],
    stages: [
      {
        order: 0,
        capability: "research-scout-pilot",
        input: ["question", "constraints"],
        outputArtifact: {
          type: "research-map",
          mediaType: "application/json",
          schemaVersion: "bazaar.artifact/research-map-v1",
        },
      },
      {
        order: 1,
        capability: "campaign-creator-pilot",
        input: ["objective", "audience", "channels"],
        outputArtifact: {
          type: "campaign-plan",
          mediaType: "application/json",
          schemaVersion: "bazaar.artifact/campaign-plan-v1",
        },
      },
    ],
    handoffArtifact: {
      type: "bundle-manifest",
      mediaType: "application/json",
      schemaVersion: "bazaar.artifact/bundle-manifest-v1",
      integrity: "sha256-of-artifact-manifest",
    },
    aggregatePrice: {
      entries: [
        {
          provider: "Research Scout (pilot fixture)",
          asset: "USDC",
          network: "stellar:testnet",
          scheme: "exact",
          amount: "0.010",
        },
        {
          provider: "Campaign Creator (pilot fixture)",
          asset: "USDC",
          network: "stellar:testnet",
          scheme: "exact",
          amount: "0.020",
        },
      ],
      status: "estimate",
    },
    status: "draft",
  },
];

export function getWorkflowBundle(id: string) {
  return workflowBundles.find((bundle) => bundle.id === id);
}