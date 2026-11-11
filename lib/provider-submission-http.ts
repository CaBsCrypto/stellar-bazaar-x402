import { reviewSharedConfigured } from "./provider-review-runtime.ts";
/** File-backed review is a local pilot, never a deployment storage fallback. */
export function localProviderReviewRequest(request: Request): boolean {
  const url = new URL(request.url);
  return !process.env.VERCEL && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    && (!request.headers.get("origin") || request.headers.get("origin") === url.origin);
}

export function publicProviderReviewConfigured():boolean {
  if(process.env.VERCEL!=="1"||process.env.BAZAAR_ENABLE_PUBLIC_PROVIDER_REVIEW!=="true"||!reviewSharedConfigured()||!process.env.BAZAAR_REVIEW_RATE_SECRET||process.env.BAZAAR_REVIEW_RATE_SECRET.length<32)return false;
  try{const u=new URL(process.env.NEXT_PUBLIC_APP_URL??'');return u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash;}catch{return false;}
}
export function providerReviewRequestAllowed(request:Request):boolean {
  if(localProviderReviewRequest(request))return true;
  if(process.env.VERCEL!=="1"||!publicProviderReviewConfigured())return false;
  try {
    const configured=new URL(process.env.NEXT_PUBLIC_APP_URL??'');
    const url=new URL(request.url);
    return configured.protocol==='https:'&&!configured.username&&!configured.password&&configured.pathname==='/'&&!configured.search&&!configured.hash
      &&url.origin===configured.origin&&(!request.headers.get('origin')||request.headers.get('origin')===configured.origin);
  }catch{return false;}
}

export function submissionAccess(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export async function readBoundedSubmission(request: Request, limit = 32 * 1024): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > limit) throw new Error("PAYLOAD_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("MALFORMED_JSON");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("PAYLOAD_TOO_LARGE"); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
