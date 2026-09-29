import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export interface ReviewRecord<T> { submission: T; tokenHash: string; digest: string }
export interface ReviewState<T> { version: 1; records: Array<ReviewRecord<T>> }
export interface ProviderReviewStore<T> { transact<R>(operation: (state: ReviewState<T>) => R | Promise<R>): Promise<R> }
export class ReviewStoreError extends Error {}
export function createFileReviewStore<T>(directory: string, validate: (value: unknown) => asserts value is ReviewState<T>): ProviderReviewStore<T> {
  if (!isAbsolute(directory)) throw new ReviewStoreError("Review directory must be an explicit absolute private path.");
  const root = resolve(directory);
  return { async transact<R>(operation: (state: ReviewState<T>) => R | Promise<R>): Promise<R> {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const lockPath = join(root, "review.lock");
    const lock = await open(lockPath, "wx", 0o600).catch(() => { throw new ReviewStoreError("Review store locked or unavailable; operator intervention may be required."); });
    const path = join(root, "review.json");
    const temporary = join(root, `review.${randomUUID()}.tmp`);
    try {
      let state: ReviewState<T>;
      try { state = JSON.parse(await readFile(path, "utf8")); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") state = { version: 1, records: [] }; else throw error; }
      validate(state);
      const before = JSON.stringify(state);
      const result = await operation(state);
      validate(state);
      if (JSON.stringify(state) === before) return structuredClone(result);
      const file = await open(temporary, "wx", 0o600);
      try { await file.writeFile(JSON.stringify(state)); await file.sync(); } finally { await file.close(); }
      await rename(temporary, path);
      return structuredClone(result);
    } finally {
      await unlink(temporary).catch(() => {});
      await lock.close();
      await unlink(lockPath);
    }
  } };
}
/** Tests must explicitly inject this; runtime never falls back to memory. */
export function createMemoryReviewStoreForTests<T>(validate: (value: unknown) => asserts value is ReviewState<T>): ProviderReviewStore<T> {
  let state: ReviewState<T> = { version: 1, records: [] };
  let tail = Promise.resolve();
  return { transact<R>(operation: (state: ReviewState<T>) => R | Promise<R>): Promise<R> {
    const task = tail.then(async () => { const draft = structuredClone(state); const result = await operation(draft); validate(draft); state = draft; return structuredClone(result); });
    tail = task.then(() => {}, () => {});
    return task;
  } };
}
