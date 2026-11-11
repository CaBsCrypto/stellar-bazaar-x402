import { measuredHandler } from '../../../../../lib/acceptance-meter.ts';
import { createWorkspaceChatHandlers } from '../../../../../lib/workspace-chat-http.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handlers = createWorkspaceChatHandlers();
async function handlePOST(request:Request, context:{params:Promise<{id:string}>}) { return handlers.responsePOST(request,(await context.params).id); }

export const POST = measuredHandler(handlePOST);
