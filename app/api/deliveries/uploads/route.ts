import { createDeliverableHandlers } from "../../../../lib/deliverable-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createDeliverableHandlers().upload;
