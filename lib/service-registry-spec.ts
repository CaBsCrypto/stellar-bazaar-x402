import { computeCanonicalServiceCardHash } from "./canonical-service-card.ts";
import { Address } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
import type { ServiceCard } from "./types.ts";

/**
 * Off-chain companion to the Soroban Service Registry scaffold.
 *
 * The contract deliberately stores only this 32-byte digest, an owner, a
 * revision and lifecycle state. The full ServiceCard remains off-chain.
 */
export const SERVICE_REGISTRY_SPEC_VERSION = "bazaar.service-registry/v0";
export const SERVICE_ID_DOMAIN = Buffer.from("stellar-bazaar:service-registry:v1\0", "utf8");

export type RegistryStatus = "draft" | "reviewed" | "published" | "suspended" | "revoked";

export interface RegistryRecordInput {
  serviceSlug: string;
  provider: string;
  card: ServiceCard;
  revision: number;
  status: RegistryStatus;
  cardUri: string;
}

export interface RegistryAnchor {
  specVersion: typeof SERVICE_REGISTRY_SPEC_VERSION;
  serviceId: string;
  serviceKey: string;
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
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.serviceSlug)) throw new Error("SERVICE_SLUG_INVALID");
  if (!/^G[A-Z2-7]{55}$/.test(input.provider)) throw new Error("PROVIDER_ADDRESS_INVALID");
  if (!Number.isInteger(input.revision) || input.revision < 1) throw new Error("REVISION_INVALID");
  if (!input.cardUri.startsWith("https://")) throw new Error("CARD_URI_MUST_BE_HTTPS");
  return {
    specVersion: SERVICE_REGISTRY_SPEC_VERSION,
    serviceId: deriveRegistryServiceId(input.provider, computeRegistryServiceKey(input.serviceSlug)),
    serviceKey: computeRegistryServiceKey(input.serviceSlug),
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

export function computeRegistryServiceKey(serviceSlug: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(serviceSlug)) throw new Error("SERVICE_SLUG_INVALID");
  return createHash("sha256")
    .update(`stellar-bazaar:service-key:v1\0${serviceSlug}`)
    .digest("hex");
}

export function deriveRegistryServiceId(provider: string, serviceKeyHex: string): string {
  if (!/^G[A-Z2-7]{55}$/.test(provider)) throw new Error("PROVIDER_ADDRESS_INVALID");
  if (!/^[a-f0-9]{64}$/.test(serviceKeyHex)) throw new Error("SERVICE_KEY_INVALID");
  const providerScValXdr = Address.fromString(provider).toScVal().toXDR();
  return createHash("sha256")
    .update(Buffer.concat([SERVICE_ID_DOMAIN, providerScValXdr, Buffer.from(serviceKeyHex, "hex")]))
    .digest("hex");
}
