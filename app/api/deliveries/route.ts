import { createDeliverableHandlers } from "../../../lib/deliverable-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createDeliverableHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
