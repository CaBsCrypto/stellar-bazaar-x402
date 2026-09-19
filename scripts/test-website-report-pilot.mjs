import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import {
  writePrivateJSON,
  readPrivateJSON,
  acquirePilotLock,
  markPaymentAttempt,
  releaseDeadPilotLock,
} from "./lib/private-pilot-state.mjs";
const root = mkdtempSync(join(tmpdir(), "website-pilot-guard-")),
  file = join(root, "run.json");
try {
  writePrivateJSON(file, { operationId: "test", paymentAttempted: false });
  const release = acquirePilotLock(root);
  assert.throws(() => acquirePilotLock(root), /PILOT_BUSY/);
  release();
  const state = readPrivateJSON(file);
  markPaymentAttempt(file, state);
  assert.equal(readPrivateJSON(file).paymentAttempted, true);
  assert.throws(() => markPaymentAttempt(file, state), /PAYMENT_ALREADY/);
  assert.throws(
    () =>
      markPaymentAttempt(file, {
        operationId: "test",
        paymentAttempted: false,
      }),
    /PAYMENT_ALREADY/,
  );
  writePrivateJSON(file, {
    operationId: "concurrent",
    paymentAttempted: false,
  });
  const moduleUrl = new URL("./lib/private-pilot-state.mjs", import.meta.url)
    .href;
  const child = () =>
    new Promise((done, reject) => {
      const code = `import {acquirePilotLock,markPaymentAttempt,readPrivateJSON} from ${JSON.stringify(moduleUrl)};try{const release=acquirePilotLock(process.env.QA_DIR);try{const s=readPrivateJSON(process.env.QA_FILE);markPaymentAttempt(process.env.QA_FILE,s);console.log('CLAIMED');}finally{release();}}catch{console.log('DENIED');}`;
      let output = "";
      const p = spawn(process.execPath, ["--input-type=module", "-e", code], {
        env: { ...process.env, QA_DIR: root, QA_FILE: file },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      p.stdout.on("data", (d) => (output += d));
      p.on("error", reject);
      p.on("exit", () => done(output.trim()));
    });
  const results = await Promise.all(Array.from({ length: 8 }, child));
  assert.equal(results.filter((x) => x === "CLAIMED").length, 1);
  assert.equal(readPrivateJSON(file).paymentAttempted, true);
  const activeRelease = acquirePilotLock(root);
  assert.throws(() => releaseDeadPilotLock(root), /STILL_ACTIVE/);
  activeRelease();
  await new Promise((done, reject) => {
    const p = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {acquirePilotLock} from ${JSON.stringify(moduleUrl)};acquirePilotLock(process.env.QA_DIR);`,
      ],
      {
        env: { ...process.env, QA_DIR: root },
        windowsHide: true,
        stdio: "ignore",
      },
    );
    p.on("error", reject);
    p.on("exit", done);
  });
  assert.equal(releaseDeadPilotLock(root), true);
  assert.equal(readPrivateJSON(file).paymentAttempted, true);
  const storedLock = acquirePilotLock(root);
  storedLock();
  console.log(
    "Pilot recovery guard: durable attempt marker, restart refusal, cross-process lock and one claim across eight concurrent processes PASS. No payment or network.",
  );
} finally {
  if (!resolve(root).startsWith(resolve(tmpdir()) + sep))
    throw Error("QA_PATH_OUTSIDE_TEMP");
  rmSync(root, { recursive: true, force: true });
}
