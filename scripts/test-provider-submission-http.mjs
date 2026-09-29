import assert from 'node:assert/strict';
import { localProviderReviewRequest, readBoundedSubmission, submissionAccess } from '../lib/provider-submission-http.ts';

// Pure request tests: no credentials, storage, providers or network.
const previousVercel = process.env.VERCEL;
try {
  delete process.env.VERCEL;
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const origin = `http://${host}:3253`;
    assert.equal(localProviderReviewRequest(new Request(origin)), true);
    assert.equal(localProviderReviewRequest(new Request(origin, {headers:{origin}})), true);
    assert.equal(localProviderReviewRequest(new Request(origin, {headers:{origin:'https://other.example'}})), false);
  }
  assert.equal(localProviderReviewRequest(new Request('https://bazaar.example')), false);
  process.env.VERCEL = '1';
  assert.equal(localProviderReviewRequest(new Request('http://localhost:3253')), false);
  delete process.env.VERCEL;

  const request = (body, headers = {}) => new Request('http://localhost:3253', {
    method:'POST', body, headers, ...(body instanceof ReadableStream ? {duplex:'half'} : {}),
  });
  assert.deepEqual(await readBoundedSubmission(request('{"ok":true}')), {ok:true});
  await assert.rejects(readBoundedSubmission(request('{')), SyntaxError);
  await assert.rejects(readBoundedSubmission(request(null)), /MALFORMED_JSON/);
  await assert.rejects(readBoundedSubmission(request('{}', {'content-length':'32769'})), /PAYLOAD_TOO_LARGE/);
  // Count UTF-8 bytes, not characters, and enforce the bound without content-length.
  await assert.rejects(readBoundedSubmission(request(JSON.stringify('é'.repeat(17000)))), /PAYLOAD_TOO_LARGE/);
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(32769)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(readBoundedSubmission(request(stream)), /PAYLOAD_TOO_LARGE/);
  assert.equal(cancelled, true);
  assert.equal(submissionAccess(new Request('http://localhost')), '');
  assert.equal(submissionAccess(new Request('http://localhost', {headers:{authorization:'Basic ignored'}})), '');
  assert.equal(submissionAccess(new Request('http://localhost', {headers:{authorization:'Bearer synthetic-only'}})), 'synthetic-only');
  console.log('PASS loopback/origin/deployment gate, bounded UTF-8 stream cancellation, malformed JSON and access header; no network or storage.');
} finally {
  if (previousVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = previousVercel;
}
