import { measuredHandler } from '../../../lib/acceptance-meter.ts';
import { createHistoryHandlers } from "../../../lib/operation-history-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createHistoryHandlers();
export const GET = measuredHandler(handlers.GET);
export const POST = measuredHandler(handlers.POST);
