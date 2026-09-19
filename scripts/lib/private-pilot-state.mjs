import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  fsyncSync,
  renameSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
export function selectedEnv(file, keys) {
  const output = {};
  if (existsSync(file))
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && keys.includes(match[1]))
        output[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  for (const key of keys)
    if (process.env[key] !== undefined) output[key] = process.env[key];
  return output;
}
export function writePrivateJSON(file, value) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + "." + randomUUID() + ".tmp";
  const fd = openSync(temp, "wx", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, file);
}
export function readPrivateJSON(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
export function acquirePilotLock(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, "execution.lock");
  let fd;
  try {
    fd = openSync(file, "wx", 0o600);
  } catch {
    throw Error("PILOT_BUSY_OR_INTERRUPTED_USE_STORAGE_RECOVERY");
  }
  writeFileSync(
    fd,
    JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
  );
  fsyncSync(fd);
  closeSync(fd);
  return () => unlinkSync(file);
}
export function markPaymentAttempt(file, state) {
  if (state.paymentAttempted || state.result)
    throw Error("PAYMENT_ALREADY_ATTEMPTED_USE_RECOVERY_OR_STORE");
  const current = readPrivateJSON(file);
  if (
    current.operationId !== state.operationId ||
    current.paymentAttempted ||
    current.result
  )
    throw Error("PAYMENT_ALREADY_ATTEMPTED_USE_RECOVERY_OR_STORE");
  state.paymentAttempted = true;
  state.status = "payment-uncertain";
  state.attemptedAt = new Date().toISOString();
  writePrivateJSON(file, state);
}
// Only storage/recovery may clear a dead process lock. Never reset the durable payment marker.
export function releaseDeadPilotLock(directory) {
  const file = join(directory, "execution.lock");
  if (!existsSync(file)) return false;
  const guard = join(directory, "lock-inspection.lock");
  let fd;
  try {
    fd = openSync(guard, "wx", 0o600);
  } catch {
    throw Error("LOCK_INSPECTION_BUSY");
  }
  try {
    if (!existsSync(file)) return false;
    const previous = readPrivateJSON(file);
    if (!Number.isSafeInteger(previous.pid) || previous.pid < 1)
      throw Error("INVALID_LOCK_REQUIRES_INSPECTION");
    let alive = true;
    try {
      process.kill(previous.pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") alive = false;
      else throw Error("LOCK_PROCESS_STATUS_UNKNOWN");
    }
    if (alive) throw Error("PILOT_PROCESS_STILL_ACTIVE");
    unlinkSync(file);
    return true;
  } finally {
    closeSync(fd);
    unlinkSync(guard);
  }
}
