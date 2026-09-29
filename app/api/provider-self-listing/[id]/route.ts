import { NextResponse } from "next/server";
import { getSubmissionStatus } from "@/lib/provider-self-listing";
import { localProviderReviewRequest, submissionAccess } from "@/lib/provider-submission-http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers={"Cache-Control":"private, no-store"};
  if (!localProviderReviewRequest(request)) return NextResponse.json({ok:false,error:{code:"INTAKE_DISABLED"}},{status:503,headers});
  const {id}=await context.params;
  const result = await getSubmissionStatus(id, submissionAccess(request));
  if (!result.ok) return NextResponse.json({ ok: false, error: { ...result.error, stage: "discover" } }, { status: /STORAGE|STORE|BUSY/.test(result.error.code)?503:401,headers });
  return NextResponse.json({ ok: true, submission: result.value }, { headers });
}
