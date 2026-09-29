import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseServiceCardShape } from "../lib/service-card-schema.ts";
import { validateServiceCard } from "../lib/discovery.ts";
import { canonicalizeServiceCard, computeCanonicalServiceCardHash } from "../lib/canonical-service-card.ts";

// Reject credentials before schema parsing, which otherwise strips unknown keys.
function assertNoCredentials(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (/secret|password|credential|authorization|private.?key|seed.?phrase|mnemonic|api.?key|provider.?key|access.?token|refresh.?token/i.test(key)) {
      throw new Error("SECRET_FIELD_REJECTED: remove credential fields from the input card.");
    }
    assertNoCredentials(nested);
  }
}

export async function prepareProviderReview(inputPath, outputPath) {
  const raw = JSON.parse(await readFile(resolve(inputPath), "utf8"));
  assertNoCredentials(raw);
  const parsed = parseServiceCardShape(raw);
  if (!parsed.ok) throw new Error(`INVALID_CARD: ${parsed.issues.map((issue) => issue.field).join(", ")}`);
  const outcomes = validateServiceCard(parsed.card);
  const failed = outcomes.filter((outcome) => outcome.status === "fail");
  if (failed.length) throw new Error(`CONFORMANCE_FAILED: ${failed.map((outcome) => outcome.rule).join(", ")}`);
  const serviceUrl = new URL(parsed.card.url);
  if (serviceUrl.username || serviceUrl.password || serviceUrl.search || serviceUrl.hash) {
    throw new Error("UNSAFE_SERVICE_URL: remove credentials, query parameters, and fragments.");
  }
  const card = canonicalizeServiceCard(parsed.card);
  const hash = computeCanonicalServiceCardHash(parsed.card);
  const packet = {
    version: "bazaar.provider-review-packet/v1",
    status: "prepared-locally",
    publiclyActive: false,
    submitted: false,
    serviceCardId: card.id,
    serviceOrigin: serviceUrl.origin,
    cardHash: { algorithm: "sha256", scope: "canonical-service-card", value: hash },
    conformance: { status: "passed", outcomes },
    controlProof: { status: "pending", domain: serviceUrl.hostname, challengeIssued: false, evidence: [] },
    manualReview: { status: "pending", evidence: [], decision: null },
    indexing: { status: "not-indexed" },
  };
  const destination = resolve(outputPath);
  try {
    await lstat(destination);
    throw new Error("OUTPUT_EXISTS: choose a new output directory.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(dirname(destination), { recursive: true });
  const temporary = await mkdtemp(resolve(dirname(destination), `.${basename(destination)}-pending-`));
  try {
    await writeFile(resolve(temporary, "service-card.json"), `${JSON.stringify(card)}\n`, { flag: "wx" });
    await writeFile(resolve(temporary, "review-packet.json"), `${JSON.stringify(packet, null, 2)}\n`, { flag: "wx" });
    await writeFile(resolve(temporary, "REVIEW.md"), [
      "# Provider review packet", "",
      "Prepared locally only. No submission, control verification, approval, or publication has occurred.", "",
      `Canonical card SHA-256: ${hash}`, "",
      "- [x] Service Card shape and deterministic conformance validated locally.",
      "- [ ] Obtain a real submission challenge through enabled intake or the operator's manual process.",
      "- [ ] Publish the issued DNS TXT or HTTP well-known challenge for the exact service hostname.",
      "- [ ] Operator verifies domain control and records evidence; this packet supplies no proof.",
      "- [ ] Operator reviews the card and records an explicit decision and reasons.",
      "- [ ] Operator separately authorizes and performs durable registry ingest, then checks discovery.", "",
      "The local pilot preserves submissions in a configured file store; public intake is disabled and staging does not publish a service.",
      "Keep this packet while intake is disabled. Never include provider keys or other credentials.", "",
    ].join("\n"), { flag: "wx" });
    // Publish the complete local directory only after all packet files are written.
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return { status: packet.status, publiclyActive: false, submitted: false, outputDirectory: destination, cardHash: hash };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args.some((arg) => arg.startsWith("-"))) {
    console.error("Usage: node scripts/prepare-provider-review.mjs <local-card.json> <new-output-directory>");
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(await prepareProviderReview(args[0], args[1]), null, 2)); }
    catch (error) { console.error(error instanceof SyntaxError ? "INVALID_JSON: input must be a JSON Service Card." : error.message); process.exitCode = 1; }
  }
}
