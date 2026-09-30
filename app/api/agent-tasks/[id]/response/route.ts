import { createWorkspaceChatHandlers } from '../../../../../lib/workspace-chat-http.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handlers = createWorkspaceChatHandlers();
export async function POST(request:Request, context:{params:Promise<{id:string}>}) { return handlers.responsePOST(request,(await context.params).id); }
