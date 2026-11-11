import { measuredHandler } from '../../../lib/acceptance-meter.ts';
import { createWorkspaceHandlers } from "../../../lib/workspace-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = measuredHandler(createWorkspaceHandlers().POST);
