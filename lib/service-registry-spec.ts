import { computeCanonicalServiceCardHash } from "./canonical-service-card.ts";
import type { ServiceCard } from "./types.ts";

/**
 * Off-chain companion to the Soroban Service Registry scaffold.
 *
 * The contract deliberately stores only this 32-byte digest, an owner, a
 * revision and lifecycle state. The full ServiceCard remains off-chain.
 */
export const SERVICE_REGISTRY_SPEC_VERSION = "bazaar.service-registry/v0";

export type RegistryStatus = "draft" | "reviewed" | "published" | "suspended" | "revoked";

export interface RegistryRecordInput {
  serviceId: string;
  provider: string;
  card: ServiceCard;
  revision: number;
  status: RegistryStatus;
  cardUri: string;
}

export interface RegistryAnchor {
  specVersion: typeof SERVICE_REGISTRY_SPEC_VERSION;
  serviceId: string;
  provider: string;
  cardHash: string;
  revision: number;
  status: RegistryStatus;
  cardUri: string;
}

export const providerTransitions: Readonly<Record<RegistryStatus, readonly RegistryStatus[]>> = {
  draft: ["revoked"],
  reviewed: ["revoked"],
  published: ["revoked"],
  suspended: ["revoked"],
  revoked: [],
};

export const curatorTransitions: Readonly<Record<RegistryStatus, readonly RegistryStatus[]>> = {
  draft: ["reviewed"],
  reviewed: ["published", "suspended"],
  published: ["suspended"],
  suspended: ["reviewed"],
  revoked: [],
};

export function canTransition(actor: "provider" | "curator", from: RegistryStatus, to: RegistryStatus): boolean {
  return (actor === "provider" ? providerTransitions : curatorTransitions)[from].includes(to);
}

export function toRegistryAnchor(input: RegistryRecordInput): RegistryAnchor {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.serviceId)) throw new Error("SERVICE_ID_INVALID");
  if (!/^G[A-Z2-7]{55}$/.test(input.provider)) throw new Error("PROVIDER_ADDRESS_INVALID");
  if (!Number.isInteger(input.revision) || input.revision < 1) throw new Error("REVISION_INVALID");
  if (!input.cardUri.startsWith("https://")) throw new Error("CARD_URI_MUST_BE_HTTPS");
  return {
    specVersion: SERVICE_REGISTRY_SPEC_VERSION,
    serviceId: input.serviceId,
    provider: input.provider,
    cardHash: computeCanonicalServiceCardHash(input.card),
    revision: input.revision,
    status: input.status,
    cardUri: input.cardUri,
  };
}

/** Converts the TypeScript hex digest into the exact 32 bytes expected by Soroban BytesN<32>. */
export function cardHashBytes(hexDigest: string): Uint8Array {
  if (!/^[a-f0-9]{64}$/.test(hexDigest)) throw new Error("CARD_HASH_INVALID");
  return Uint8Array.from(Buffer.from(hexDigest, "hex"));
}
