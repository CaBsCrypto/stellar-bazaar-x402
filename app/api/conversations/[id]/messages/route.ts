import { measuredHandler } from '../../../../../lib/acceptance-meter.ts';
import { createWorkspaceChatHandlers } from '../../../../../lib/workspace-chat-http.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handlers = createWorkspaceChatHandlers();
type Context = { params: Promise<{id:string}> };
async function handleGET(request:Request, context:Context) { return handlers.messagesGET(request,(await context.params).id); }
async function handlePOST(request:Request, context:Context) { return handlers.messagesPOST(request,(await context.params).id); }

export const GET = measuredHandler(handleGET);

export const POST = measuredHandler(handlePOST);
