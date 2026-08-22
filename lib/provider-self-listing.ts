import { randomBytes, randomUUID } from "node:crypto";
import type { ServiceCard, ValidationOutcome } from "./types.ts";
import { validateCardRules, validateCardShape } from "./service-ingest.ts";

export const SELF_LISTING_VERSION = "bazaar.provider-submission/v1" as const;
const MAX_QUEUE_SIZE = 100;
const SUBMISSION_TTL_MS = 24 * 60 * 60 * 1000;

export type ControlProofMethod = "dns-txt" | "http-well-known";
export type SubmissionStatus =
  | "awaiting-control-proof"
  | "pending-manual-review"
  | "approved-for-staging"
  | "rejected"
  | "staged-not-public"
  | "expired";

export interface ControlProofClaim {
  method: ControlProofMethod;
  domain: string;
}

export interface ControlChallenge extends ControlProofClaim {
  challengeId: string;
  expectedRecord: string;
  verificationPath?: string;
  status: "pending" | "verified" | "failed";
}

export interface ProviderSubmission {
  version: typeof SELF_LISTING_VERSION;
  submissionId: string;
  card: ServiceCard;
  status: SubmissionStatus;
  publiclyActive: false;
  submittedAt: string;
  updatedAt: string;
  expiresAt: string;
  conformance: ValidationOutcome[];
  control: ControlChallenge;
  review?: {
    decision: "approve" | "reject";
    reviewerId: string;
    reasons: string[];
    reviewedAt: string;
  };
}

export type SelfListingErrorCode =
  | "INTAKE_DISABLED"
  | "INVALID_SUBMISSION"
  | "DOMAIN_CONTROL_MISMATCH"
  | "QUEUE_FULL"
  | "DUPLICATE_SUBMISSION"
  | "SUBMISSION_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "CONTROL_PROOF_MISMATCH";

export interface SelfListingError {
  code: SelfListingErrorCode;
  message: string;
  retryable: boolean;
  field?: string;
  failedRules?: Array<{ rule: string; reason: string }>;
}

type SelfListingResult<T> = { ok: true; value: T } | { ok: false; error: SelfListingError };

declare global {
  // eslint-disable-next-line no-var
  var __bazaar_provider_review_queue: Map<string, ProviderSubmission> | undefined;
  // eslint-disable-next-line no-var
  var __bazaar_provider_staging_index: Map<string, ProviderSubmission> | undefined;
}

const reviewQueue = globalThis.__bazaar_provider_review_queue ?? new Map<string, ProviderSubmission>();
const stagingIndex = globalThis.__bazaar_provider_staging_index ?? new Map<string, ProviderSubmission>();
globalThis.__bazaar_provider_review_queue = reviewQueue;
globalThis.__bazaar_provider_staging_index = stagingIndex;

const clone = <T>(value: T): T => structuredClone(value);

export function selfListingIntakeConfigured() {
  return process.env.BAZAAR_ENABLE_SELF_LISTING_INTAKE === "true";
}

function normalizeDomain(raw: string): string | null {
  const value = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!value || value === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return null;
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)) return null;
  return value;
}

function cardDomain(card: ServiceCard): string | null {
  try {
    return normalizeDomain(new URL(card.url).hostname);
  } catch {
    return null;
  }
}

function expireOldSubmissions(now = Date.now()) {
  for (const [id, submission] of reviewQueue) {
    if (Date.parse(submission.expiresAt) <= now && submission.status !== "staged-not-public") {
      reviewQueue.set(id, { ...submission, status: "expired", updatedAt: new Date(now).toISOString() });
    }
  }
}

export async function submitProviderDraft(
  rawCard: unknown,
  rawControl: unknown,
): Promise<SelfListingResult<ProviderSubmission>> {
  if (!selfListingIntakeConfigured()) {
    return {
      ok: false,
      error: {
        code: "INTAKE_DISABLED",
        message: "La cola de revisión está deshabilitada; conserva el borrador y usa el canal manual documentado.",
        retryable: false,
      },
    };
  }

  expireOldSubmissions();
  if ([...reviewQueue.values()].filter((entry) => entry.status !== "expired").length >= MAX_QUEUE_SIZE) {
    return { ok: false, error: { code: "QUEUE_FULL", message: "La cola manual alcanzó su límite temporal.", retryable: true } };
  }

  const shape = await validateCardShape(rawCard);
  if (!shape.ok) return { ok: false, error: { ...shape.error, code: "INVALID_SUBMISSION" } };
  const { outcomes, failedOutcomes } = validateCardRules(shape.card);
  if (failedOutcomes.length) {
    return {
      ok: false,
      error: {
        code: "INVALID_SUBMISSION",
        message: "La Service Card no supera conformance determinista.",
        retryable: false,
        failedRules: failedOutcomes.map((item) => ({ rule: item.rule, reason: item.reason })),
      },
    };
  }

  if (!rawControl || typeof rawControl !== "object" || Array.isArray(rawControl)) {
    return { ok: false, error: { code: "INVALID_SUBMISSION", message: "controlProof es obligatorio.", retryable: false, field: "controlProof" } };
  }
  const claim = rawControl as Partial<ControlProofClaim>;
  if (claim.method !== "dns-txt" && claim.method !== "http-well-known") {
    return { ok: false, error: { code: "INVALID_SUBMISSION", message: "Método de control no reconocido.", retryable: false, field: "controlProof.method" } };
  }
  const claimedDomain = normalizeDomain(claim.domain ?? "");
  const expectedDomain = cardDomain(shape.card);
  if (!claimedDomain || !expectedDomain || claimedDomain !== expectedDomain) {
    return {
      ok: false,
      error: {
        code: "DOMAIN_CONTROL_MISMATCH",
        message: "El dominio reclamado debe coincidir exactamente con el hostname HTTPS de la Service Card.",
        retryable: false,
        field: "controlProof.domain",
      },
    };
  }
  if ([...reviewQueue.values()].some((entry) => entry.card.id === shape.card.id && !["rejected", "expired"].includes(entry.status))) {
    return { ok: false, error: { code: "DUPLICATE_SUBMISSION", message: "Ya existe una revisión activa para esta Service Card.", retryable: false, field: "card.id" } };
  }

  const now = new Date();
  const challengeId = randomUUID();
  const challengeValue = randomBytes(18).toString("base64url");
  const control: ControlChallenge = {
    method: claim.method,
    domain: claimedDomain,
    challengeId,
    expectedRecord: `stellar-bazaar-verification=${challengeValue}`,
    ...(claim.method === "http-well-known" ? { verificationPath: "/.well-known/stellar-bazaar-provider.txt" } : {}),
    status: "pending",
  };
  const submission: ProviderSubmission = {
    version: SELF_LISTING_VERSION,
    submissionId: randomUUID(),
    card: shape.card,
    status: "awaiting-control-proof",
    publiclyActive: false,
    submittedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SUBMISSION_TTL_MS).toISOString(),
    conformance: outcomes,
    control,
  };
  reviewQueue.set(submission.submissionId, submission);
  return { ok: true, value: clone(submission) };
}

export function getSubmissionStatus(submissionId: string): SelfListingResult<Omit<ProviderSubmission, "card" | "conformance"> & { serviceCardId: string }> {
  expireOldSubmissions();
  const submission = reviewQueue.get(submissionId);
  if (!submission) return { ok: false, error: { code: "SUBMISSION_NOT_FOUND", message: "Submission desconocida.", retryable: false } };
  const { card, conformance: _conformance, ...publicStatus } = submission;
  return { ok: true, value: { ...clone(publicStatus), serviceCardId: card.id } };
}

export function recordControlProofResult(
  submissionId: string,
  result: { challengeId: string; domain: string; verified: boolean },
): SelfListingResult<ProviderSubmission> {
  const submission = reviewQueue.get(submissionId);
  if (!submission) return { ok: false, error: { code: "SUBMISSION_NOT_FOUND", message: "Submission desconocida.", retryable: false } };
  if (submission.status !== "awaiting-control-proof") {
    return { ok: false, error: { code: "INVALID_TRANSITION", message: "La submission no espera prueba de control.", retryable: false } };
  }
  if (result.challengeId !== submission.control.challengeId || normalizeDomain(result.domain) !== submission.control.domain) {
    return { ok: false, error: { code: "CONTROL_PROOF_MISMATCH", message: "La evidencia no corresponde al challenge y dominio fijados.", retryable: false } };
  }
  const now = new Date().toISOString();
  const next: ProviderSubmission = {
    ...submission,
    status: result.verified ? "pending-manual-review" : "rejected",
    updatedAt: now,
    control: { ...submission.control, status: result.verified ? "verified" : "failed" },
    ...(result.verified ? {} : { review: { decision: "reject", reviewerId: "control-proof-verifier", reasons: ["Control proof failed."], reviewedAt: now } }),
  };
  reviewQueue.set(submissionId, next);
  return { ok: true, value: clone(next) };
}

export function recordManualReview(
  submissionId: string,
  review: { decision: "approve" | "reject"; reviewerId: string; reasons: string[] },
): SelfListingResult<ProviderSubmission> {
  const submission = reviewQueue.get(submissionId);
  if (!submission) return { ok: false, error: { code: "SUBMISSION_NOT_FOUND", message: "Submission desconocida.", retryable: false } };
  if (submission.status !== "pending-manual-review" || submission.control.status !== "verified") {
    return { ok: false, error: { code: "INVALID_TRANSITION", message: "Se requiere prueba de control verificada antes de revisión manual.", retryable: false } };
  }
  const reviewerId = review.reviewerId.trim();
  if (!reviewerId || review.reasons.length === 0) {
    return { ok: false, error: { code: "INVALID_SUBMISSION", message: "La revisión requiere reviewerId y al menos una razón.", retryable: false } };
  }
  const now = new Date().toISOString();
  const next: ProviderSubmission = {
    ...submission,
    status: review.decision === "approve" ? "approved-for-staging" : "rejected",
    updatedAt: now,
    review: { ...review, reviewerId, reasons: [...review.reasons], reviewedAt: now },
  };
  reviewQueue.set(submissionId, next);
  return { ok: true, value: clone(next) };
}

export function stageApprovedSubmission(submissionId: string): SelfListingResult<ProviderSubmission> {
  const submission = reviewQueue.get(submissionId);
  if (!submission) return { ok: false, error: { code: "SUBMISSION_NOT_FOUND", message: "Submission desconocida.", retryable: false } };
  if (submission.status !== "approved-for-staging" || submission.control.status !== "verified" || submission.review?.decision !== "approve") {
    return { ok: false, error: { code: "INVALID_TRANSITION", message: "Sólo una revisión aprobada puede pasar al staging no público.", retryable: false } };
  }
  const next: ProviderSubmission = { ...submission, status: "staged-not-public", publiclyActive: false, updatedAt: new Date().toISOString() };
  reviewQueue.set(submissionId, next);
  stagingIndex.set(submission.card.id, next);
  return { ok: true, value: clone(next) };
}

export function listManualReviewQueue(): ProviderSubmission[] {
  expireOldSubmissions();
  return [...reviewQueue.values()].map((entry) => clone(entry));
}

export function listStagedNotPublic(): ProviderSubmission[] {
  return [...stagingIndex.values()].map((entry) => clone(entry));
}

export function resetSelfListingStateForTests() {
  reviewQueue.clear();
  stagingIndex.clear();
}
