import { NextResponse } from "next/server";
import { getSubmissionStatus } from "@/lib/provider-self-listing";

export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return context.params.then(({ id }) => {
    const result = getSubmissionStatus(id);
    if (!result.ok) return NextResponse.json({ ok: false, error: { ...result.error, stage: "discover" } }, { status: 404 });
    return NextResponse.json({ ok: true, submission: result.value }, { headers: { "Cache-Control": "no-store" } });
  });
}
