import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const manifest = JSON.parse((await readFile('docs/evidence/sprint-marketplace/vercel-preview-dry.json', 'utf8')).replace(/^\uFEFF/, ''));
const allowedRoot = new Set(['.gitattributes', '.vercelignore', 'LICENSE', 'next-env.d.ts', 'package.json', 'package-lock.json', 'proxy.ts', 'tsconfig.json', 'vercel.json']);
const fingerprints = [], findings = [];
for (const file of manifest.files) {
  assert.ok(/^(app|lib|components|public|styles)\//.test(file.path) || allowedRoot.has(file.path), 'Unnecessary upload file: ' + file.path);
  const content = await readFile(file.path); assert.equal(content.length, file.size);
  assert.equal(createHash('sha1').update(content).digest('hex'), file.sha, 'Upload input changed');
  fingerprints.push({ path: file.path, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') });
  if (/\.(ts|tsx|js|json|md|txt|html|css)$/.test(file.path)) {
    const text = content.toString('utf8');
    for (const [kind, pattern] of Object.entries({ privateKey: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, stellarSeed: /\bS[A-Z2-7]{55}\b/, githubToken: /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}\b/, jwt: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/, privateAcceptanceMarker: /bazaar-native-network-private-/ })) if (pattern.test(text)) findings.push({ path: file.path, kind });
  }
}
assert.deepEqual(findings, [], 'Potential sensitive content in upload');
const report = { ok: true, projectId: 'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3', teamId: 'team_XjolcoWJ9V9yamVnCdpC7EMY', target: 'preview', phase: 'marketplace-closed-candidate', fileCount: fingerprints.length, totalBytes: fingerprints.reduce((sum, file) => sum + file.bytes, 0), payloadFingerprint: createHash('sha256').update(JSON.stringify(fingerprints)).digest('hex'), excluded: ['docs', 'scripts', 'examples', 'contracts', 'Git', 'env files', 'builds', 'dependencies', 'local evidence'], sensitivePatternFindings: findings, limitation: 'Pattern scan cannot prove absence of every possible confidential value; upload is restricted to application source and intentionally public assets authorized for this project', files: fingerprints };
await writeFile('docs/evidence/sprint-marketplace/vercel-preview-upload-audit.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, files: undefined }));

