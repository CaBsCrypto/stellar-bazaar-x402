import { z } from "zod";

export const workspaceIdSchema = z.string().uuid();
export const workspaceIdentifierSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/);
export const workspaceHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const workspaceTextSchema = z.string().min(1).max(2000).refine(v => v.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v));
export const createWorkspaceSchema = z.object({ creationId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i), humanAccessHash: workspaceHashSchema, agentAccessHash: workspaceHashSchema }).strict();
export const workspaceAccessSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rotate"), role: z.enum(["human", "agent"]), accessHash: workspaceHashSchema, expectedGeneration: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1) }).strict(),
  z.object({ action: z.literal("revoke"), expectedGeneration: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1) }).strict(),
]);
export type WorkspaceRole = "human" | "agent" | "bootstrap";
export type WorkspacePrincipal = { purpose?:'treasury-controls'; ownerId: string; workspaceId: string; agentId: string; role: WorkspaceRole; generation: number };
export type WorkspaceMessage = { messageId: string; conversationId: string; taskId: string; actor: "human" | "agent"; text: string; recordedAt: string; operationId?: string };
export type WorkspaceConversation = { conversationId: string; title: string; createdAt: string; messages: WorkspaceMessage[]; tasks?: WorkspaceTask[] };
export type WorkspaceTask = { taskId: string; conversationId: string; humanMessageId: string; text: string; status: "pending" | "claimed" | "responded" | "uncertain"; createdAt: string; attemptId?: string; agentId?: string; responseMessageId?: string; operationId?: string };
export class WorkspaceError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfter?: number;
  constructor(code: string, status = 503, retryAfter?: number) { super(code); this.code = code; this.status = status; this.retryAfter = retryAfter; }
}
export const WORKSPACE_LIMITS = Object.freeze({ dailyCreations: 50, hourlyCreationsPerIp: 50, demoDailyCreations: 200, demoHourlyCreationsPerIp: 200, demoRequestsPerMinute: 60, demoIngressPerMinute: 120, contentRetentionMs: 7 * 86400000, replayMarkers: 1000, ownerBytes: 128 * 1024, globalBytes: 12 * 1024 * 1024, registryBytes: 1024 * 1024, requestsPerMinute: 120 });
export const marketPermissionChangeSchema = z.object({ changeId: z.string().uuid(), expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1), allowServiceSubmission: z.boolean() }).strict();
