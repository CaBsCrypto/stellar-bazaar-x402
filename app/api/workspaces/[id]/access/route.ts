import { measuredHandler } from '../../../../../lib/acceptance-meter.ts';
import { createWorkspaceHandlers } from "../../../../../lib/workspace-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handlePOST(request: Request, context: { params: Promise<{ id: string }> }) { return createWorkspaceHandlers().access(request, (await context.params).id); }

export const POST = measuredHandler(handlePOST);
