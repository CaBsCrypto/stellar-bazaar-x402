import { POST as ingestPost } from "../publisher/ingest/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { ingestPost as POST };
