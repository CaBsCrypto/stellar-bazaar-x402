import { resolve, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import * as review from "../lib/provider-self-listing.ts";
import { verifySubmissionDns, verifySubmissionHttp, activateSubmission, recoverSubmissionActivation } from "../lib/provider-review-operator.ts";

export async function runProviderReviewOperator(args, dependencies = {}) {
  const options = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith("--")) { positional.push(args[i]); continue; }
    const key = args[i].slice(2);
    if (!["review-dir", "operator", "reason", "decision"].includes(key) || !args[i + 1] || args[i + 1].startsWith("--") || options[key]) throw new Error("INVALID_ARGUMENTS");
    options[key] = args[++i];
  }
  const [command, id] = positional;
  if (positional.length !== 2 || !["inspect", "verify-dns", "verify-http", "review", "stage", "activate", "recover"].includes(command)) throw new Error("INVALID_ARGUMENTS");
  if (!options["review-dir"] || !isAbsolute(options["review-dir"]) || process.env.VERCEL) throw new Error("LOCAL_REVIEW_DIRECTORY_REQUIRED");
  process.env.BAZAAR_PROVIDER_REVIEW_DIR = resolve(options["review-dir"]);
  let result;
  if (command === "inspect") result = await review.getSubmissionForOperator(id);
  if (command === "verify-dns") return verifySubmissionDns(id, { resolveTxt: dependencies.resolveTxt });
  if (command === "verify-http") return verifySubmissionHttp(id, { lookup: dependencies.lookup, transport: dependencies.transport });
  if (command === "review") {
    if (!["approve", "reject"].includes(options.decision) || !options.operator?.trim() || !options.reason?.trim()) throw new Error("EXPLICIT_REVIEW_REQUIRED");
    result = await review.recordManualReview(id, { decision: options.decision, reviewerId: options.operator, reasons: [options.reason] });
  }
  if (command === "stage") result = await review.stageApprovedSubmission(id);
  if (command === "activate") return activateSubmission(id, dependencies.registry);
  if (command === "recover") return recoverSubmissionActivation(id, dependencies.registry);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await runProviderReviewOperator(process.argv.slice(2)), null, 2)); }
  catch (error) {
    console.error(/^[A-Z_]+$/.test(error.message) ? error.message : "OPERATOR_OPERATION_FAILED");
    process.exitCode = 1;
  }
}
