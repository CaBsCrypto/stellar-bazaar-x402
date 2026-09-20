import assert from "node:assert/strict";
import { generateHistoryKeypair, authenticateHistory } from "../lib/operation-history-auth.ts";
import { formatHumanHistoryUrl } from "../lib/operation-history-client.ts";
import { BazaarAgentClient } from "../lib/bazaar-agent-client.ts";

console.log("Starting agent chat & magic link flow verification...");

// 1. Verify keypair generation
const keypair = generateHistoryKeypair("agent-session-123");
assert(keypair.readToken.startsWith("bz_read_"), "Read token must have bz_read_ prefix");
assert(keypair.writeToken.startsWith("bz_write_"), "Write token must have bz_write_ prefix");
assert.equal(keypair.ownerId, "agent-session-123", "Owner ID should match requested session");

// 2. Verify authentication
const readPrincipal = authenticateHistory(`Bearer ${keypair.readToken}`, false);
assert.equal(readPrincipal.permission, "read", "Permission should be read");

const writePrincipal = authenticateHistory(`Bearer ${keypair.writeToken}`, true);
assert.equal(writePrincipal.permission, "write", "Permission should be write");

// 3. Verify magic link formatting
const sampleBaseUrl = "http://localhost:3000";
const magicLink = formatHumanHistoryUrl(sampleBaseUrl, keypair.readToken);
assert.equal(magicLink, `${sampleBaseUrl}/history#token=${encodeURIComponent(keypair.readToken)}`);
assert(!magicLink.includes("?token="), "Token must be in hash fragment (#token=) for zero-knowledge privacy");

// 4. Verify agent client helper
const client = new BazaarAgentClient({
  baseUrl: sampleBaseUrl,
  history: {
    readToken: keypair.readToken,
    writeToken: keypair.writeToken,
    agentId: "agent-assistant-v1",
    taskId: "task-audit-001",
    taskTitle: "Auditoría web para el usuario",
  },
});

const generatedLink = client.getHumanHistoryLink();
assert.equal(generatedLink, magicLink, "Agent client getHumanHistoryLink should return identical magic URL");

console.log("All agent chat & magic link assertions passed successfully! (100% Zero-Knowledge & Isolated)");
