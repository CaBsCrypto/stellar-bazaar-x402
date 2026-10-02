import { measuredHandler } from '../../../lib/acceptance-meter.ts';
import { createWorkspaceChatHandlers } from '../../../lib/workspace-chat-http.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handlers = createWorkspaceChatHandlers();
export const GET = measuredHandler(handlers.tasksGET);
export const POST = measuredHandler(handlers.tasksPOST);
