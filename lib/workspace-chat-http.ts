import { z } from 'zod';
import { configuredWorkspaceStore } from './workspace-store.ts';
import { authenticateWorkspaceRequest, assertWorkspaceRequest, parseWorkspaceBody, workspaceHeaders, workspaceFailure } from './workspace-http.ts';
import { WorkspaceError } from './workspace-types.ts';

const id = z.string().uuid();
const create = z.object({ conversationId: id, title: z.string().min(1).max(120).refine(v => v.trim().length > 0) }).strict();
const message = z.object({ messageId: id, taskId: id, text: z.string().min(1).max(2000).refine(v => v.trim().length > 0) }).strict();
const claim = z.object({ taskId: id, attemptId: id }).strict();
const response = z.object({ attemptId: id, messageId: id, text: z.string().min(1).max(2000).refine(v => v.trim().length > 0), operationId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/).optional() }).strict();

export function createWorkspaceChatHandlers(deps: {
  authenticate?: typeof authenticateWorkspaceRequest;
  store?: typeof configuredWorkspaceStore;
} = {}) {
  const authenticate = deps.authenticate ?? authenticateWorkspaceRequest;
  const store = deps.store ?? configuredWorkspaceStore;
  async function run(request: Request, action: 'conversations'|'messages'|'tasks'|'response', resourceId?: string) {
    try {
      assertWorkspaceRequest(request);
      if (new URL(request.url).search) throw new WorkspaceError('INVALID_QUERY', 400);
      const write = request.method === 'POST';
      const principal = await authenticate(request, action === 'tasks' || action === 'response' ? 'agent' : write ? 'human' : undefined);
      if (!['human','agent'].includes(principal.role)) throw new WorkspaceError('FORBIDDEN', 403);
      if (resourceId !== undefined) id.parse(resourceId);
      const db = store().forPrincipal(principal);
      if (action === 'conversations') {
        if (!write) return Response.json({ conversations: await db.listConversations(principal.ownerId) }, { headers: workspaceHeaders });
        const saved = await db.createConversation(principal.ownerId, await parseWorkspaceBody(request, create));
        return Response.json(saved, { status: saved.created ? 201 : 200, headers: workspaceHeaders });
      }
      if (action === 'messages') {
        if (!resourceId) throw new WorkspaceError('INVALID_REQUEST',400);
        if (!write) {
          const conversation = await db.getConversation(principal.ownerId, resourceId);
          if (!conversation) throw new WorkspaceError('CONVERSATION_NOT_FOUND',404);
          return Response.json({ conversation }, { headers: workspaceHeaders });
        }
        const saved = await db.sendHumanMessage(principal.ownerId, { conversationId: resourceId, ...await parseWorkspaceBody(request,message) });
        return Response.json(saved, { status: saved.created ? 201 : 200, headers: workspaceHeaders });
      }
      if (action === 'tasks') {
        if (!write) return Response.json({ tasks: await db.listAgentTasks(principal.ownerId) }, { headers: workspaceHeaders });
        const saved = await db.claimTask(principal.ownerId, { ...await parseWorkspaceBody(request,claim), agentId: principal.agentId });
        return Response.json(saved, { status: saved.created ? 201 : 200, headers: workspaceHeaders });
      }
      if (!resourceId || !write) throw new WorkspaceError('INVALID_REQUEST',400);
      const saved = await db.respondToTask(principal.ownerId, { taskId: resourceId, ...await parseWorkspaceBody(request,response) });
      return Response.json(saved, { status: saved.created ? 201 : 200, headers: workspaceHeaders });
    } catch (error) { return workspaceFailure(error); }
  }
  return {
    conversationsGET: (r: Request) => run(r,'conversations'), conversationsPOST: (r: Request) => run(r,'conversations'),
    messagesGET: (r: Request,id: string) => run(r,'messages',id), messagesPOST: (r: Request,id: string) => run(r,'messages',id),
    tasksGET: (r: Request) => run(r,'tasks'), tasksPOST: (r: Request) => run(r,'tasks'),
    responsePOST: (r: Request,id: string) => run(r,'response',id),
  };
}

