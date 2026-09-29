/** File-backed review is a local pilot, never a deployment storage fallback. */
export function localProviderReviewRequest(request: Request): boolean {
  const url = new URL(request.url);
  return !process.env.VERCEL && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    && (!request.headers.get("origin") || request.headers.get("origin") === url.origin);
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
