# Open workspace implementation contract

Local candidate only. Existing accounts, submissions and payments are unchanged. No external writes are authorized by this document.

## Identity and storage (specialist 1)

- `POST /api/workspaces`: strict body `{creationId: UUIDv4, humanAccessHash: sha256, agentAccessHash: sha256}`; bootstrap secret is Authorization Bearer, not an argument. Assign a fresh server owner/workspace and one stable authenticated agent. Persist only hashes. Replay authenticates bootstrap first; changed hashes conflict. No client owner or scopes.
- `POST /api/workspaces/[id]/access`: bootstrap-authenticated `{action: 'rotate', role: 'human'|'agent', accessHash, expectedGeneration}` or `{action:'revoke',expectedGeneration}`. Generation CAS; retain revoked intent tombstone permanently. Replaying creation never restores rotated/revoked credentials.
- Prefix `bazaar-workspace:local-test|preview|production`, explicit `BAZAAR_WORKSPACE_BACKEND=redis|file`. Redis credentials exclusively `BAZAAR_WORKSPACE_REDIS_REST_URL/TOKEN`; no history/review aliases. All atomic Redis keys share an environment hash tag. File backend only loopback and never on Vercel; tests isolate its directory.
- Feature flag `BAZAAR_ENABLE_OPEN_WORKSPACES`, default false. Anonymous defaults: 50 new workspaces/day globally, 50/hour per trusted IP (shared event Wi-Fi allowed); maximum 100 workspaces retained; 128 KiB data/owner and 12 MiB globally. Bounded input and shared request limits; no silent quota upgrade. These are beta limits, not proof of provider capacity.
- Export `requireWorkspacePrincipal(authorization, role?: 'human'|'agent'|'bootstrap') -> Promise<WorkspacePrincipal>` and `configuredWorkspaceStore()` from server-only modules. Principal contains server-derived `ownerId,workspaceId,agentId,role,generation`. Human may read history and send its messages, agent may read history/respond/record; bootstrap only access administration. Never map human to legacy history write.
- Preserve synchronous legacy authenticateHistory for its existing callers/tests; add an async history resolver used by native routes, retaining least privilege. Registry/hash/owner collisions with legacy accounts reject. Workspace principals use isolated operation/activity adapters with the same handler schemas; no external file uploads or paid reports for anonymous beta.
- Store interface for chat specialist: `listConversations(ownerId)`, `getConversation(ownerId,id)`, `createConversation(ownerId,{conversationId,title})`, `sendHumanMessage(ownerId,{conversationId,messageId,taskId,text})`, `listAgentTasks(ownerId)`, `claimTask(ownerId,{taskId,attemptId,agentId})`, `respondToTask(ownerId,{taskId,attemptId,messageId,text,operationId?})`. Store assigns actor, receipt time, statuses; frozen body digest idempotence, altered body conflict. Claim never expires/reexecutes automatically. Response validates linked operation belongs to this owner. Statuses pending/claimed/responded/uncertain.

## Chat (specialist 2)

- Native endpoints `GET/POST /api/conversations`, `GET/POST /api/conversations/[id]/messages`, `GET/POST /api/agent-tasks`, `POST /api/agent-tasks/[id]/response`, all owner/scopes derived from bearer.
- Human POST messages body `{messageId,taskId,text}`, max 2000 chars; create body `{conversationId,title}`. Agent task claim body `{taskId,attemptId}`; response body `{attemptId,messageId,text,operationId?}`. No body owner/actor/agentId authority. `agentId` passed to store comes from authenticated principal.
- Chat route captures `/agent-chat#token=...` then removes token. Memory only, manual refresh, real queued state, cancel pending requests and remove data/draft on lock. Open history using same human access in memory/fragment, never persist token to browser storage. Read legacy links remain read-only.
- Empty entry: instructions to run the private terminal helper to create a space (coordinator supplies helper). No fake answers, polling, LLM, payment, file upload or public activation.
- Native route helpers propagate private no-store, strict body, origin checks, size/rate limits. UI tests use synthetic data only.

## MCP, helpers, guides (coordinator)

- Add tools `create_bazaar_workspace`, `list_bazaar_agent_tasks`, `claim_bazaar_agent_task`, `respond_bazaar_agent_task`, `record_bazaar_activity`, `record_bazaar_operation`. Reuse native handlers, per-request bearer context. Tools never take raw tokens/owner/actor as arguments. Existing provider credential remains independent per submission.
- Private helper prepares UUID, independent 32-byte bootstrap/human/agent tokens and hashes outside repo before create; modes prepare/create/tasks/claim/respond/record/recover/access. Root recovery packet never used as agent transport. Accepted receipt is immutable and separate from later status/error responses. No automatic retry or financial effects.
- Canonical tool metadata for MCP health/capabilities/OpenAPI/docs/tests, canonical three role skills/prompts. Explicit requirements and qualified evidence.

## Review (specialist 3)

Independent authorship/review, no historical credentials or external writes. Test role isolation, server owner allocation, atomics, reboot/concurrency, incomplete/corrupt state, creation uncertainty, credential rotation/revocation and preservation of legacy. Test chat-task-response-operation recovery and provider submission separation. Local Redis protocol doubles plus file-backed multi-process HTTP are distinct evidence. Actual Upstash requires a fresh approved budget.
