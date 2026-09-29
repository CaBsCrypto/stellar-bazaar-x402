import { NextResponse } from "next/server";
import { getSubmissionStatus } from "@/lib/provider-self-listing";
import { providerReviewRequestAllowed, submissionAccess } from "@/lib/provider-submission-http";
import { reviewSharedConfigured } from "@/lib/provider-review-runtime";
import { limitReviewRequest } from "@/lib/provider-review-limits";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers={"Cache-Control":"private, no-store"};
  if (!providerReviewRequestAllowed(request)) return NextResponse.json({ok:false,error:{code:"INTAKE_DISABLED"}},{status:503,headers});
  if(reviewSharedConfigured()){const limit=await limitReviewRequest(request,submissionAccess(request));if(!limit.ok)return NextResponse.json({ok:false,error:{code:limit.code}},{status:limit.status,headers:{...headers,'Retry-After':String(limit.retryAfter)}});}
  const {id}=await context.params;
  const result = await getSubmissionStatus(id, submissionAccess(request));
  if (!result.ok) return NextResponse.json({ ok: false, error: { ...result.error, stage: "discover" } }, { status: /STORAGE|STORE|BUSY/.test(result.error.code)?503:401,headers });
  return NextResponse.json({ ok: true, submission: result.value }, { headers });
}
