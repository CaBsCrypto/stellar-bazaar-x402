import { measuredHandler } from '../../../lib/acceptance-meter.ts';
import { createDeliverableHandlers } from "../../../lib/deliverable-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createDeliverableHandlers();
export const GET = measuredHandler(handlers.GET);
export const POST = measuredHandler(handlers.POST);
