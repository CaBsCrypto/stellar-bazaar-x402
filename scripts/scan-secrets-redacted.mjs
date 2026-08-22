import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const stellarSeedPattern = /S[A-Z2-7]{55}/;
const sensitiveNames = new Set([
  "STELLAR_X402_FACILITATOR_API_KEY",
  "X402_PAYER_SECRET",
  "X402_SELLER_SECRET",
  "BAZAAR_PROVIDER_SECRET",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_TOKEN",
]);

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function walk(path) {
  if (!existsSync(path)) return [];
  const files = [];
  for (const entry of readdirSync(path)) {
    const child = join(path, entry);
    const stat = statSync(child);
    if (stat.isDirectory()) files.push(...walk(child));
    else files.push(child);
  }
  return files;
}

const sourceFiles = git(["ls-files", "--cached", "--others", "--exclude-standard"])
  .split(/\r?\n/)
  .filter(Boolean);
const currentSeedFiles = sourceFiles.filter((file) => stellarSeedPattern.test(readText(file)));

const localSecrets = new Map();
for (const envFile of [".env.local", ".env.x402.local"]) {
  for (const line of readText(envFile).split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (sensitiveNames.has(name) && value.length >= 8) localSecrets.set(name, value);
  }
}

const buildFiles = walk(".next");
const trackedExactLeakLabels = [];
const buildExactLeakLabels = [];
for (const [name, value] of localSecrets) {
  if (sourceFiles.some((file) => readText(file).includes(value))) trackedExactLeakLabels.push(name);
  if (buildFiles.some((file) => readText(file).includes(value))) buildExactLeakLabels.push(name);
}

const historicalAffectedCommits = [];
const commits = git(["rev-list", "--all", "--", "examples/python-agent-langchain.py"])
  .split(/\r?\n/)
  .filter(Boolean);
for (const commit of commits) {
  const content = (() => {
    try {
      return git(["show", `${commit}:examples/python-agent-langchain.py`]);
    } catch {
      return "";
    }
  })();
  if (/S[A-Z2-7]{55}/.test(content)) historicalAffectedCommits.push(commit);
}

const ok = currentSeedFiles.length === 0
  && trackedExactLeakLabels.length === 0
  && buildExactLeakLabels.length === 0;

console.log(JSON.stringify({
  ok,
  redacted: true,
  current: {
    stellarSeedMatchCount: currentSeedFiles.length,
    files: currentSeedFiles,
    trackedExactSecretLabels: trackedExactLeakLabels,
  },
  build: { exactSecretLabels: buildExactLeakLabels },
  history: {
    affectedCommitCount: historicalAffectedCommits.length,
    affectedCommits: historicalAffectedCommits,
    note: "Known history is reported but not rewritten by this branch.",
  },
}, null, 2));

if (!ok) process.exitCode = 1;
