import { createWorkspaceChatHandlers } from '../../../../../lib/workspace-chat-http.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handlers = createWorkspaceChatHandlers();
type Context = { params: Promise<{id:string}> };
export async function GET(request:Request, context:Context) { return handlers.messagesGET(request,(await context.params).id); }
export async function POST(request:Request, context:Context) { return handlers.messagesPOST(request,(await context.params).id); }
