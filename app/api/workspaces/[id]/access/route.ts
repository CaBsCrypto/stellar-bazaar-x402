import { createWorkspaceHandlers } from "../../../../../lib/workspace-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return createWorkspaceHandlers().access(request, (await context.params).id); }
