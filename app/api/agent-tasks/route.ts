import { createWorkspaceChatHandlers } from '../../../lib/workspace-chat-http.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handlers = createWorkspaceChatHandlers();
export const GET = handlers.tasksGET;
export const POST = handlers.tasksPOST;
