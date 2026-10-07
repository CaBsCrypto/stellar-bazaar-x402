import { createHash, timingSafeEqual, randomBytes, randomUUID } from "node:crypto";
import { createFileReviewStore, createMemoryReviewStoreForTests, type ProviderReviewStore, type ReviewState } from "./provider-review-store.ts";
import { createRedisReviewStore } from "./provider-review-redis.ts";
import { getReviewRedis, getReviewPrefix } from "./provider-review-runtime.ts";
import type { ServiceCard, ValidationOutcome } from "./types.ts";
import { parseServiceCardShape } from "./service-card-schema.ts";
import { validateCardRules, validateCardShape } from "./service-ingest.ts";

export const SELF_LISTING_VERSION = "bazaar.provider-submission/v1" as const;
const SUBMISSION_TTL_MS = 24 * 60 * 60 * 1000;

export type ControlProofMethod = "dns-txt" | "http-well-known";
export type SubmissionStatus =
  | "awaiting-control-proof"
  | "pending-manual-review"
  | "approved-for-staging"
  | "rejected"
  | "staged-not-public"
  | "expired" | "activation-pending" | "activation-uncertain" | "activated";

export interface ControlProofClaim {
  method: ControlProofMethod;
  domain: string;
}

export interface ControlChallenge extends ControlProofClaim {
  challengeId: string;
  expectedRecord: string;
  verificationPath?: string;
  status: "pending" | "verified" | "failed";
  evidence?: {observedAt?:string;source?:string;challengeHash?:string;cardHash?:string};
}

export interface ProviderSubmission {
  version: typeof SELF_LISTING_VERSION;
  submissionId: string;
  card: ServiceCard;
  status: SubmissionStatus;
  publiclyActive: boolean;
  activation?: {intentId:string;cardHash:string;startedAt:string;entryHash?:string;error?:string};
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
  | "STORE_UNAVAILABLE" | "SUBMISSION_CONFLICT"
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

let injectedStore: ProviderReviewStore<ProviderSubmission> | undefined;
const hash = (v:string) => createHash("sha256").update(v).digest("hex");
function canonical(v:unknown):string { if(Array.isArray(v)) return "["+v.map(canonical).join(",")+"]"; if(v && typeof v === "object") return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical((v as Record<string,unknown>)[k])).join(",")+"}"; return JSON.stringify(v); }
function validEvidence(s:ProviderSubmission,e:ControlChallenge["evidence"]):boolean { return !!e && e.challengeHash===hash(s.control.expectedRecord) && e.cardHash===canonicalCardHash(s.card) && e.source===s.control.method && iso(e.observedAt) && Date.parse(e.observedAt)>=Date.parse(s.submittedAt) && Date.parse(e.observedAt)<=Date.now() && Date.parse(e.observedAt)<Date.parse(s.expiresAt); }
export const canonicalCardHash = (v:unknown) => hash(canonical(v));
const tokenMatches=(token:string,digest:string)=>timingSafeEqual(Buffer.from(hash(token),"hex"),Buffer.from(digest,"hex"));
const uuid = (v:unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const iso = (v:unknown):v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v));
const hex = (v:unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export function validateReviewState(value:unknown): asserts value is ReviewState<ProviderSubmission> {
 const state=value as ReviewState<ProviderSubmission>;
 if(!state || state.version!==1 || !Array.isArray(state.records) || Buffer.byteLength(JSON.stringify(state),'utf8')>1024*1024 || Object.keys(state).sort().join(",")!=="records,version") throw Error("Invalid state");
 const ids=new Set();
 for(const r of state.records){const s=r?.submission;
 if(!parseServiceCardShape(s?.card).ok)throw Error("Invalid stored card shape");
 if(!s || Object.keys(r).sort().join(",")!=="digest,submission,tokenHash" || !hex(r.tokenHash) || !hex(r.digest) || !uuid(s.submissionId) || ids.has(s.submissionId) || s.version!==SELF_LISTING_VERSION || !s.card || typeof s.card.id!=="string" || validateCardRules(s.card).failedOutcomes.length || !Array.isArray(s.conformance) || !s.control || !uuid(s.control.challengeId) || normalizeDomain(s.control.domain)!==cardDomain(s.card) || !["dns-txt","http-well-known"].includes(s.control.method) || !["pending","verified","failed"].includes(s.control.status) || !/^stellar-bazaar-verification=[A-Za-z0-9_-]{24}$/.test(s.control.expectedRecord) || !["awaiting-control-proof","pending-manual-review","approved-for-staging","rejected","staged-not-public","expired","activation-pending","activation-uncertain","activated"].includes(s.status) || [s.submittedAt,s.updatedAt,s.expiresAt].some(t=>!iso(t)) || s.publiclyActive!==(s.status==="activated")) throw Error("Invalid record");
 if(["pending-manual-review","approved-for-staging","staged-not-public","activation-pending","activation-uncertain","activated"].includes(s.status) && s.control.status!=="verified") throw Error("Missing proof");
 if(["approved-for-staging","staged-not-public","activation-pending","activation-uncertain","activated"].includes(s.status) && (s.review?.decision!=="approve" || !s.review.reviewerId || !s.review.reasons?.length)) throw Error("Missing approval");
 if(s.status.startsWith("activation-") || s.status==="activated") {if(!s.activation || !uuid(s.activation.intentId) || s.activation.cardHash!==canonicalCardHash(s.card) || !iso(s.activation.startedAt) || (s.status==="activated" && s.activation.entryHash!==s.activation.cardHash)) throw Error("Invalid activation");} if(r.digest!==canonicalCardHash({card:s.card,control:{method:s.control.method,domain:s.control.domain}}))throw Error("Submission digest mismatch");
 if(canonical(s.conformance)!==canonical(validateCardRules(s.card).outcomes))throw Error("Invalid conformance evidence");
 if (Date.parse(s.expiresAt)-Date.parse(s.submittedAt)!==SUBMISSION_TTL_MS || Date.parse(s.updatedAt)<Date.parse(s.submittedAt)) throw Error("Invalid submission timestamps");
 if(s.review && (!["approve","reject"].includes(s.review.decision) || typeof s.review.reviewerId!=="string" || !s.review.reviewerId.trim() || !Array.isArray(s.review.reasons) || !s.review.reasons.length || s.review.reasons.some(r=>typeof r!=="string" || !r.trim()) || !iso(s.review.reviewedAt)))throw Error("Invalid review metadata");
 if(s.activation && !["activation-pending","activation-uncertain","activated"].includes(s.status))throw Error("Unexpected activation marker");
 if(s.control.status==="verified" && !validEvidence(s,s.control.evidence))throw Error("Invalid stored proof evidence");
 ids.add(s.submissionId);
 }
}
function store():ProviderReviewStore<ProviderSubmission> { if(injectedStore)return injectedStore; const redis=getReviewRedis(); if(redis)return createRedisReviewStore(redis,getReviewPrefix(),validateReviewState); if(process.env.VERCEL)throw Error("File reviews are localhost only"); if(!process.env.BAZAAR_PROVIDER_REVIEW_DIR)throw Error("Store missing"); return createFileReviewStore(process.env.BAZAAR_PROVIDER_REVIEW_DIR,validateReviewState);}
const failure=(code:SelfListingErrorCode,message:string):SelfListingResult<never>=>({ok:false,error:{code,message,retryable:code==="STORE_UNAVAILABLE"}});
async function transaction<T>(op:(queue:Map<string,ProviderSubmission>,state:ReviewState<ProviderSubmission>)=>T|Promise<T>,expire=true):Promise<T>{return store().transact(async state=>{const queue=new Map(state.records.map(r=>[r.submission.submissionId,r.submission]));if(expire)expireOldSubmissions(queue);const result=await op(queue,state);for(const r of state.records)r.submission=queue.get(r.submission.submissionId)!;return result;});}
async function safe<T>(op:()=>Promise<SelfListingResult<T>>):Promise<SelfListingResult<T>>{try{return await op();}catch{return failure("STORE_UNAVAILABLE","Review store unavailable; no action confirmed.");}}
const clone = <T>(value: T): T => structuredClone(value);

export function selfListingIntakeConfigured() {
  return process.env.BAZAAR_ENABLE_SELF_LISTING_INTAKE === "true";
}

function normalizeDomain(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
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

function expireOldSubmissions(reviewQueue:Map<string,ProviderSubmission>, now = Date.now()) {
  for (const [id, submission] of reviewQueue) {
    if (Date.parse(submission.expiresAt) <= now && !["expired","staged-not-public","activated","activation-pending","activation-uncertain"].includes(submission.status)) {
      reviewQueue.set(id, { ...submission, status: "expired", updatedAt: new Date(now).toISOString() });
    }
  }
}

export async function submitProviderDraft(
  rawCard: unknown,
  rawControl: unknown,
  options?: {submissionId:string;submissionToken:string},
): Promise<SelfListingResult<ProviderSubmission>> {
  if (!selfListingIntakeConfigured()) {
    return {
      ok: false,
      error: {
        code: "INTAKE_DISABLED",
        message: "La recepción de solicitudes está deshabilitada. Conserva la ficha y solicita al operador de Bazaar un canal de revisión; todavía no se ha enviado ni publicado.",
        retryable: false,
      },
    };
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
  if(!options || !uuid(options.submissionId) || !/^(?:[a-f0-9]{64}|[A-Za-z0-9_-]{43})$/.test(options.submissionToken))return failure("INVALID_SUBMISSION","UUID submissionId and 32-byte submissionToken required.");
  const digest=canonicalCardHash({card:shape.card,control:{method:claim.method,domain:claimedDomain}});
  return safe(()=>transaction(async(reviewQueue,state)=>{
  const existing=state.records.find(r=>r.submission.submissionId===options.submissionId);
  if(existing)return existing.digest===digest && tokenMatches(options.submissionToken,existing.tokenHash)?{ok:true as const,value:clone(reviewQueue.get(options.submissionId)!)}:failure("SUBMISSION_CONFLICT","Submission identity conflict.");
  if ([...reviewQueue.values()].some((entry) => entry.card.id === shape.card.id && !["rejected", "expired"].includes(entry.status))) {
    return { ok: false, error: { code: "DUPLICATE_SUBMISSION", message: "Ya existe una revisión activa para esta Service Card.", retryable: false, field: "card.id" } };
  }

  const now = new Date();
  const challengeId = randomUUID();
  const challengeValue = randomBytes(18).toString("base64url");
  const control: ControlChallenge = {
    method: claim.method as ControlProofMethod,
    domain: claimedDomain,
    challengeId,
    expectedRecord: `stellar-bazaar-verification=${challengeValue}`,
    ...(claim.method === "http-well-known" ? { verificationPath: "/.well-known/stellar-bazaar-provider.txt" } : {}),
    status: "pending",
  };
  const submission: ProviderSubmission = {
    version: SELF_LISTING_VERSION,
    submissionId: options.submissionId,
    card: shape.card,
    status: "awaiting-control-proof",
    publiclyActive: false,
    submittedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SUBMISSION_TTL_MS).toISOString(),
    conformance: outcomes,
    control,
  };
  state.records.push({submission,tokenHash:hash(options.submissionToken),digest});
  reviewQueue.set(submission.submissionId, submission);
  return { ok: true as const, value: clone(submission) };
  }));
}

export async function getSubmissionStatus(submissionId:string,submissionToken?:string){return safe(()=>transaction((queue,state)=>{const r=state.records.find(r=>r.submission.submissionId===submissionId);if(!r || typeof submissionToken!=="string" || !tokenMatches(submissionToken,r.tokenHash))return failure("SUBMISSION_NOT_FOUND","Submission access denied.");expireOldSubmissions(queue);const s=queue.get(submissionId)!;return {ok:true as const,value:{version:s.version,submissionId:s.submissionId,status:s.status,publiclyActive:s.publiclyActive,submittedAt:s.submittedAt,updatedAt:s.updatedAt,expiresAt:s.expiresAt,serviceCardId:s.card.id,control:clone(s.control),...(s.review?{review:{decision:s.review.decision,reasons:clone(s.review.reasons),reviewedAt:s.review.reviewedAt}}:{})}};},false));}
export async function getSubmissionForOperator(id:string,expire=true):Promise<SelfListingResult<ProviderSubmission>>{return safe(()=>transaction(q=>{const s=q.get(id);return s?{ok:true,value:clone(s)}:failure("SUBMISSION_NOT_FOUND","Submission unknown.");},expire));}
/** One read per catalog request; no expiry mutation and no per-service Redis reads. */
export async function getMarketReviewSnapshot(ids: readonly string[]): Promise<SelfListingResult<ProviderSubmission[]>> {
  const wanted = new Set(ids);
  return safe(() => transaction(queue => ({ ok: true as const, value: [...queue.values()].filter(s => wanted.has(s.submissionId)).map(clone) }), false));
}
export async function recordControlProofResult(
  submissionId: string,
  result: { challengeId: string; domain: string; verified: boolean; observedAt?:string;source?:string;challengeHash?:string;cardHash?:string },
): Promise<SelfListingResult<ProviderSubmission>> {
  return safe(()=>transaction((reviewQueue)=>{
  const submission = reviewQueue.get(submissionId);
  if (!submission) return { ok: false, error: { code: "SUBMISSION_NOT_FOUND", message: "Submission desconocida.", retryable: false } };
  if (submission.status !== "awaiting-control-proof") {
    return { ok: false, error: { code: "INVALID_TRANSITION", message: "La submission no espera prueba de control.", retryable: false } };
  }
  if (result.challengeId !== submission.control.challengeId || normalizeDomain(result.domain) !== submission.control.domain) {
    return { ok: false, error: { code: "CONTROL_PROOF_MISMATCH", message: "La evidencia no corresponde al challenge y dominio fijados.", retryable: false } };
  }
  if (result.verified && !validEvidence(submission,result)) return failure("CONTROL_PROOF_MISMATCH","Verified proof requires current evidence bound to the challenge and card.");
  const now = new Date().toISOString();
  const next: ProviderSubmission = {
    ...submission,
    status: result.verified ? "pending-manual-review" : "rejected",
    updatedAt: now,
    control: { ...submission.control, status: result.verified ? "verified" : "failed", evidence:{observedAt:result.observedAt,source:result.source,challengeHash:result.challengeHash,cardHash:result.cardHash} },
    ...(result.verified ? {} : { review: { decision: "reject", reviewerId: "control-proof-verifier", reasons: ["Control proof failed."], reviewedAt: now } }),
  };
  reviewQueue.set(submissionId, next);
  return { ok: true, value: clone(next) };
  }));
}

export async function recordManualReview(
  submissionId: string,
  review: { decision: "approve" | "reject"; reviewerId: string; reasons: string[] },
): Promise<SelfListingResult<ProviderSubmission>> {
  return safe(()=>transaction((reviewQueue)=>{
  const submission = reviewQueue.get(submissionId);
  if (!submission) return { ok: false, error: { code: "SUBMISSION_NOT_FOUND", message: "Submission desconocida.", retryable: false } };
  if (submission.status !== "pending-manual-review" || submission.control.status !== "verified") {
    return { ok: false, error: { code: "INVALID_TRANSITION", message: "Se requiere prueba de control verificada antes de revisión manual.", retryable: false } };
  }
  if (!review || !["approve","reject"].includes(review.decision) || typeof review.reviewerId!=="string" || !Array.isArray(review.reasons) || review.reasons.some(r=>typeof r!=="string" || !r.trim())) return failure("INVALID_SUBMISSION","Invalid review.");
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
  }));
}

export async function stageApprovedSubmission(submissionId: string): Promise<SelfListingResult<ProviderSubmission>> {
  return safe(()=>transaction((reviewQueue)=>{
  const submission = reviewQueue.get(submissionId);
  if (!submission) return { ok: false, error: { code: "SUBMISSION_NOT_FOUND", message: "Submission desconocida.", retryable: false } };
  if (submission.status !== "approved-for-staging" || submission.control.status !== "verified" || submission.review?.decision !== "approve") {
    return { ok: false, error: { code: "INVALID_TRANSITION", message: "Sólo una revisión aprobada puede pasar al staging no público.", retryable: false } };
  }
  const next: ProviderSubmission = { ...submission, status: "staged-not-public", publiclyActive: false, updatedAt: new Date().toISOString() };
  reviewQueue.set(submissionId, next);

  return { ok: true, value: clone(next) };
  }));
}

export async function listManualReviewQueue():Promise<ProviderSubmission[]>{return transaction(q=>[...q.values()].map(clone));}
export async function listProviderSubmissionsForOperator(page = 1, pageSize = 20): Promise<SelfListingResult<{submissions:ProviderSubmission[];page:number;pageSize:number;total:number;totalPages:number}>> {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) return failure("INVALID_SUBMISSION", "Invalid review pagination.");
  return safe(() => transaction(queue => {
    const submissions = [...queue.values()].sort((a,b) => b.submittedAt.localeCompare(a.submittedAt) || a.submissionId.localeCompare(b.submissionId));
    return {ok:true as const,value:{submissions:submissions.slice((page-1)*pageSize,page*pageSize).map(clone),page,pageSize,total:submissions.length,totalPages:Math.ceil(submissions.length/pageSize)}};
  }));
}
export async function listStagedNotPublic():Promise<ProviderSubmission[]>{return transaction(q=>[...q.values()].filter(s=>s.status==="staged-not-public").map(clone));}
export async function resetSelfListingStateForTests(){injectedStore=createMemoryReviewStoreForTests(validateReviewState);}
export async function useFileReviewStoreForTests(){injectedStore=undefined;}
export async function setReviewStoreForTests(value:ProviderReviewStore<ProviderSubmission>|undefined){injectedStore=value;}
export async function beginActivation(id:string,marker:{intentId:string;cardHash:string}):Promise<SelfListingResult<{submission:ProviderSubmission;started:boolean}>>{return safe<{submission:ProviderSubmission;started:boolean}>(()=>transaction(q=>{const s=q.get(id);if(!s)return failure("SUBMISSION_NOT_FOUND","Submission unknown.");if(s.activation)return {ok:true,value:{submission:clone(s),started:false}};if(s.status!=="staged-not-public" || Date.parse(s.expiresAt)<=Date.now() || !uuid(marker.intentId) || marker.cardHash!==canonicalCardHash(s.card))return failure("INVALID_TRANSITION","Current approved staged card required.");s.activation={...marker,startedAt:new Date().toISOString()};s.status="activation-pending";s.updatedAt=new Date().toISOString();return {ok:true,value:{submission:clone(s),started:true}};}));}
export async function finishActivation(id:string,receipt:{intentId:string;cardHash:string;entryHash:string}):Promise<SelfListingResult<ProviderSubmission>>{return safe(()=>transaction(q=>{const s=q.get(id);if(!s?.activation || !["activation-pending","activation-uncertain","activated"].includes(s.status) || s.activation.intentId!==receipt.intentId || s.activation.cardHash!==receipt.cardHash || !hex(receipt.entryHash) || receipt.entryHash!==receipt.cardHash || (s.activation.entryHash && s.activation.entryHash!==receipt.entryHash))return failure("INVALID_TRANSITION","Receipt does not match durable intent.");s.activation.entryHash=receipt.entryHash;delete s.activation.error;s.status="activated";s.publiclyActive=true;s.updatedAt=new Date().toISOString();return {ok:true,value:clone(s)};}));}
export async function markActivationUncertain(id:string,error:string):Promise<SelfListingResult<ProviderSubmission>>{return safe(()=>transaction(q=>{const s=q.get(id);if(!s?.activation || !["activation-pending","activation-uncertain"].includes(s.status))return failure("INVALID_TRANSITION","No pending activation.");s.status="activation-uncertain";s.activation.error=error.slice(0,500);s.updatedAt=new Date().toISOString();return {ok:true,value:clone(s)};}));}
