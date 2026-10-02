import { measuredHandler } from '../../../lib/acceptance-meter.ts';
import { createActivityHandlers } from "../../../lib/activity-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createActivityHandlers();
export const GET = measuredHandler(handlers.GET);
export const POST = measuredHandler(handlers.POST);
