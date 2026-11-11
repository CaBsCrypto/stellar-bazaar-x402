import { NextRequest } from "next/server";
import { POST as submit } from "../app/api/provider-self-listing/route";
import { GET as status } from "../app/api/provider-self-listing/[id]/route";

// Reuse native handlers. Preserve trusted incoming context; do not fetch an external URL.
export function providerMcpContext(incoming: Request) {
  function request(path: string, body?: unknown) {
    const headers = new Headers();
    for (const name of ["authorization", "origin", "x-forwarded-for"]) {
      const value = incoming.headers.get(name); if (value !== null) headers.set(name, value);
    }
    const json = body === undefined ? undefined : JSON.stringify(body);
    if (json !== undefined) { headers.set("content-type", "application/json"); headers.set("content-length", String(Buffer.byteLength(json))); }
    return new NextRequest(new URL(path, incoming.url), { method: json === undefined ? "GET" : "POST", headers, ...(json === undefined ? {} : { body: json }) });
  }
  async function envelope(response: Response) {
    const wait = response.headers.get("retry-after");
    return { ok: response.ok, status: response.status, body: await response.json(),
      ...(wait && /^\d+$/.test(wait) ? { retryAfter: Number(wait) } : {}) };
  }
  return {
    submit: async (body: unknown) => envelope(await submit(request("/api/provider-self-listing", body))),
    status: async (submissionId: string) => envelope(await status(request(`/api/provider-self-listing/${encodeURIComponent(submissionId)}`), { params: Promise.resolve({ id: submissionId }) })),
  };
}
