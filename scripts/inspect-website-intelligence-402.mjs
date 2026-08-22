import { readFileSync } from "node:fs";
import { expectedWebsiteIntelligenceCard, inspectWebsiteIntelligenceChallenge } from "../lib/website-intelligence-buyer.ts";

const file = ".env.website-intelligence-x402.local";
for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
  const index = line.indexOf("=");
  if (index > 0 && !line.startsWith("#") && !process.env[line.slice(0, index)]) process.env[line.slice(0, index)] = line.slice(index + 1);
}
if (process.env.WI_X402_ALLOW_SETTLEMENT === "true") throw new Error("SETTLEMENT_DISABLED_IN_INSPECTION_HARNESS");
if (!process.env.WI_X402_SELLER_ADDRESS) throw new Error("WI_X402_SELLER_ADDRESS_REQUIRED");
const card = expectedWebsiteIntelligenceCard(process.env.WI_X402_SELLER_ADDRESS);
const requirement = await inspectWebsiteIntelligenceChallenge(card.endpoint.url, { url: "https://example.org", language: "es" }, card);
console.log(JSON.stringify({ ok: true, inspectionOnly: true, network: requirement.network, scheme: requirement.scheme, atomicAmount: requirement.amount, paymentAttempted: false }));
