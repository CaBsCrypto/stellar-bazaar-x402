import { createActivityHandlers } from "../../../lib/activity-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createActivityHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
