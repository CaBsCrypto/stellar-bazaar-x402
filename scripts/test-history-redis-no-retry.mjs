import assert from 'node:assert/strict';
import { configuredHistoryStore } from '../lib/operation-history-store.ts';
import { configuredActivityStore } from '../lib/activity-store.ts';
import { configuredDeliverableStore } from '../lib/deliverable-store.ts';

// Exercise the installed SDK through all three real factories. No remote request.
const keys = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
const prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
let calls = 0;
try {
  process.env.UPSTASH_REDIS_REST_URL = 'https://synthetic.invalid';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'synthetic-no-value';
  globalThis.fetch = async () => { calls++; throw new Error('Synthetic lost response'); };
  for (const read of [
    () => configuredHistoryStore().list('synthetic-owner'),
    () => configuredActivityStore().all('synthetic-owner'),
    () => configuredDeliverableStore().list('synthetic-owner', 'synthetic-operation'),
  ]) {
    const before = calls;
    await assert.rejects(read);
    assert.equal(calls - before, 1, 'SDK must not retry a failed request');
  }
  console.log('PASS three configured history stores: one SDK attempt each after lost response, no network.');
} finally {
  globalThis.fetch = originalFetch;
  for (const key of keys) {
    if (prior[key] === undefined) delete process.env[key];
    else process.env[key] = prior[key];
  }
}
