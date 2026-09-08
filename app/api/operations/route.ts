import { createHistoryHandlers } from "../../../lib/operation-history-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createHistoryHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
