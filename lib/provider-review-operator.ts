import { createHash, randomUUID } from "node:crypto";
import { resolveTxt as systemResolveTxt, lookup as systemLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { computeCanonicalServiceCardHash } from "./canonical-service-card.ts";
import * as review from "./provider-self-listing.ts";
import { createService, getServiceById, registryMutationConfigured } from "./service-ingest.ts";
import type { ServiceCard } from "./types.ts";
import {meteredExternal} from './acceptance-meter.ts';

type Entry = { id: string; hash: string; card: ServiceCard };
export interface OperatorRegistry {
  configured(): boolean;
  create(card: ServiceCard): Promise<{ ok: true; entry: Entry } | { ok: false; error: { code: string } }>;
  read(id: string): Promise<Entry | undefined>;
}
export const administrativeRegistry: OperatorRegistry = {
  configured: registryMutationConfigured,
  create: (card) => createService(card, process.env.BAZAAR_PROVIDER_SECRET),
  read: getServiceById,
};
function fail(code: string): never { throw new Error(code); }
function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) fail(result.error.code);
  return result.value;
}

function publicIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99)))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}
type HttpTarget = { hostname: string; address: string; path: string; timeoutMs: number; maxBytes: number; onBytes?:(bytes:number)=>void };
function proofHeaders(hostname:string):Record<string,string>|undefined {
  const target=process.env.BAZAAR_PROVIDER_PREVIEW_HOST,secret=process.env.BAZAAR_PROVIDER_PREVIEW_BYPASS;
  if(!target||hostname!==target)return undefined;
  if(!/^[a-z0-9-]+\.vercel\.app$/.test(target)||!secret||!/^[A-Za-z0-9_-]{16,256}$/.test(secret))fail('PROVIDER_PREVIEW_AUTH_UNAVAILABLE');
  return {'x-vercel-protection-bypass':secret};
}
async function pinnedHttps(target: HttpTarget): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest({ hostname: target.hostname, servername: target.hostname, port: 443,
      path: target.path, method: "GET", agent: false, family: 4,
      headers:proofHeaders(target.hostname),
      lookup: (_hostname, _options, callback) => callback(null, target.address, 4),
    }, (response) => {
      if (response.statusCode !== 200) { response.destroy(); reject(new Error("HTTP_PROOF_STATUS")); return; }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        target.onBytes?.(bytes);
        if (bytes > target.maxBytes) { response.destroy(); reject(new Error("HTTP_PROOF_TOO_LARGE")); }
        else chunks.push(chunk);
      });
      response.on("end", () => resolve({ status: response.statusCode!, body: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", reject);
    });
    const timer = setTimeout(() => request.destroy(new Error("HTTP_PROOF_TIMEOUT")), target.timeoutMs);
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
    request.end();
  });
}

export async function verifySubmissionHttp(id: string, options: {
  lookup?: (hostname: string) => Promise<Array<{address: string; family: number}>>;
  transport?: (target: HttpTarget) => Promise<{status: number; body: string}>;
  timeoutMs?: number;
} = {}) {
  const submission = unwrap(await review.getSubmissionForOperator(id));
  if (submission.status !== "awaiting-control-proof" || Date.parse(submission.expiresAt) <= Date.now()) fail("INVALID_TRANSITION");
  if (submission.control.method !== "http-well-known") fail("CONTROL_PROOF_METHOD_MISMATCH");
  const url = new URL(submission.card.url);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password || url.search || url.hash
    || hostname !== submission.control.domain || submission.control.verificationPath !== "/.well-known/stellar-bazaar-provider.txt") fail("UNSAFE_PROOF_URL");
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) fail("INVALID_TIMEOUT");
  const deadline=Date.now()+timeoutMs;
  const bounded=async<T>(operation:()=>Promise<T>):Promise<T>=>{
    const remaining=deadline-Date.now();if(remaining<=0)fail('HTTP_PROOF_TIMEOUT');
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([operation(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('HTTP_PROOF_TIMEOUT')),remaining);})]);}
    finally{clearTimeout(timer);}
  };
  const addresses = await meteredExternal('proof-dns',()=>bounded(()=> (options.lookup ?? ((host) => systemLookup(host, { all: true })))(hostname)));
  if (!addresses.length || addresses.length > 32 || addresses.some((value) => value.family !== 4 || !publicIpv4(value.address))) fail("UNSAFE_PROOF_ADDRESS");
  const remaining=deadline-Date.now();if(remaining<=0)fail('HTTP_PROOF_TIMEOUT');
  // The real transport settles on its own remaining deadline before the meter logs.
  let proofBytes=0;
  const target:HttpTarget={hostname,address:addresses[0].address,path:'/.well-known/stellar-bazaar-provider.txt',timeoutMs:remaining,maxBytes:4096,onBytes:bytes=>{proofBytes=bytes;}};
  const response = await meteredExternal('proof-http',async()=>{
    const value=await(options.transport?bounded(()=>options.transport!(target)):pinnedHttps(target));
    proofBytes=Buffer.byteLength(value.body);return value;
  },undefined,()=>({outboundBytes:0,inboundBytes:proofBytes}));
    if (response.status !== 200) fail("HTTP_PROOF_STATUS");
    if (typeof response.body !== "string" || Buffer.byteLength(response.body) > 4096) fail("HTTP_PROOF_TOO_LARGE");
    if (response.body !== submission.control.expectedRecord) fail("CONTROL_PROOF_MISMATCH");
  return unwrap(await review.recordControlProofResult(id, {
    challengeId: submission.control.challengeId, domain: hostname, verified: true,
    challengeHash: createHash("sha256").update(submission.control.expectedRecord).digest("hex"),
    cardHash: computeCanonicalServiceCardHash(submission.card), observedAt: new Date().toISOString(), source: "http-well-known",
  }));
}

/** Network access occurs only when this explicit operator operation is called. */
export async function verifySubmissionDns(id: string, options: {
  resolveTxt?: (hostname: string) => Promise<string[][]>; timeoutMs?: number;
} = {}) {
  const submission = unwrap(await review.getSubmissionForOperator(id));
  if (submission.status !== "awaiting-control-proof" || Date.parse(submission.expiresAt) <= Date.now()) fail("INVALID_TRANSITION");
  if (submission.control.method !== "dns-txt") fail("HTTP_PROOF_VERIFIER_NOT_CONFIGURED");
  const hostname = new URL(submission.card.url).hostname.toLowerCase().replace(/\.$/, "");
  if (hostname !== submission.control.domain) fail("DOMAIN_CONTROL_MISMATCH");
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) fail("INVALID_TIMEOUT");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let records: string[][];
  try {
    records = await meteredExternal('proof-dns',()=>Promise.race([
      (options.resolveTxt ?? systemResolveTxt)(hostname),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("DNS_PROOF_TIMEOUT")), timeoutMs); }),
    ]));
  } catch { fail("DNS_PROOF_UNAVAILABLE"); }
  finally { clearTimeout(timer); }
  if (!Array.isArray(records) || records.length > 100 || records.some((record) =>
    !Array.isArray(record) || record.length > 100 || record.some((chunk) => typeof chunk !== "string" || Buffer.byteLength(chunk) > 255)
    || record.join("").length > 4096)) fail("DNS_PROOF_RESPONSE_TOO_LARGE");
  if (!records.some((record) => record.join("") === submission.control.expectedRecord)) fail("CONTROL_PROOF_MISMATCH");
  return unwrap(await review.recordControlProofResult(id, {
    challengeId: submission.control.challengeId, domain: hostname, verified: true,
    challengeHash: createHash("sha256").update(submission.control.expectedRecord).digest("hex"),
    cardHash: computeCanonicalServiceCardHash(submission.card), observedAt: new Date().toISOString(), source: "dns-txt",
  }));
}

function matchingEntry(entry: Entry | undefined, card: ServiceCard, hash: string): boolean {
  return Boolean(entry && entry.id === card.id && entry.card.id === card.id && entry.hash === hash
    && computeCanonicalServiceCardHash(entry.card) === hash);
}

export async function activateSubmission(id: string, registry: OperatorRegistry = administrativeRegistry) {
  if (!registry.configured()) fail("SERVICE_NOT_CONFIGURED");
  const submission = unwrap(await review.getSubmissionForOperator(id));
  const cardHash = computeCanonicalServiceCardHash(submission.card);
  // The durable marker is committed before invoking any registry side effect.
  const begun = unwrap(await review.beginActivation(id, { intentId: randomUUID(), cardHash }));
  if (!begun.started) fail("ACTIVATION_REQUIRES_RECOVERY");
  try {
    const result = await registry.create(begun.submission.card);
    if (!result.ok) fail(result.error.code);
    if (!matchingEntry(result.entry, begun.submission.card, cardHash)) fail("REGISTRY_EVIDENCE_MISMATCH");
    return unwrap(await review.finishActivation(id, {
      intentId: begun.submission.activation!.intentId, cardHash, entryHash: result.entry.hash,
    }));
  } catch {
    // Do not leak backend errors or retry an operation with an unknown outcome.
    await review.markActivationUncertain(id, "Registry outcome requires explicit recovery.");
    fail("ACTIVATION_UNCERTAIN");
  }
}

export async function recoverSubmissionActivation(id: string, registry: OperatorRegistry = administrativeRegistry) {
  if (!registry.configured()) fail("SERVICE_NOT_CONFIGURED");
  const submission = unwrap(await review.getSubmissionForOperator(id));
  const activation = submission.activation;
  if (!activation || !["activation-pending", "activation-uncertain", "activated"].includes(submission.status)) fail("INVALID_TRANSITION");
  const cardHash = computeCanonicalServiceCardHash(submission.card);
  if (activation.cardHash !== cardHash) fail("REGISTRY_EVIDENCE_MISMATCH");
  const entry = await registry.read(submission.card.id);
  if (!matchingEntry(entry, submission.card, cardHash)) fail("REGISTRY_EVIDENCE_MISMATCH");
  if (submission.status === "activated") return submission;
  return unwrap(await review.finishActivation(id, { intentId: activation.intentId, cardHash, entryHash: entry!.hash }));
}
