import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseServiceCardShape } from "../lib/service-card-schema.ts";
import { MCP_TOOLS } from '../lib/mcp-tool-contract.ts';
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const guide = read("public/PROVIDER_ONBOARDING.md");
const example = JSON.parse(guide.match(/```json\s*([\s\S]*?)```/)[1]);
assert.equal(parseServiceCardShape(example).ok, true, 'Published minimum example must satisfy the actual card schema');
const llms = read("public/llms.txt");
const card = read("components/AgentDirectConnectCard.tsx");
for (const tool of MCP_TOOLS) assert(llms.includes(tool), `Missing documented MCP tool: ${tool}`);
assert(llms.includes("/PROVIDER_ONBOARDING.md en el mismo origen"));
assert(!llms.includes("Consulta docs/PROVIDER_ONBOARDING.md"));
const seller = card.split("const sellerPrompt =")[1].split("const getBuyerText")[0];
assert(seller.includes("${origin}/skills/seller/SKILL.md"));
for (const boundary of ["INTAKE_DISABLED", "24 horas", "expiresAt", "submissionId", "verificationPath", "staged-not-public", "no es autopublicación", "secreto compartido", "no requiere crear una cuenta", "no existe" ]) {
  assert(guide.toLowerCase().includes(boundary.toLowerCase()), `Missing seller boundary: ${boundary}`);
}
assert(guide.includes('`{"card": TU_MANIFEST_JSON}`'));
assert(guide.includes("scripts/prepare-provider-review.mjs ruta/mi-service-card.json ruta/paquete-nuevo"));
assert(guide.includes("no realiza solicitudes de red"));
assert(seller.includes("const files ="), "SDK snippet must define its files");
assert(seller.includes("npm run bazaar-cli -- validate"));
console.log("PASS seller guide links, real MCP tool surface, validation contract, local packet and operator boundaries.");
