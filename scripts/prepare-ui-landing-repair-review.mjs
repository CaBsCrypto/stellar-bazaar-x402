import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const sha = value => createHash('sha256').update(value).digest('hex');
const paths = [
  'docs/evidence/ui-landing-repair-source-2026-10-13.json',
  'docs/evidence/ui-landing-repair-build-v3-2026-10-13.json',
  'docs/evidence/ui-landing-repair-browser-local-2026-10-13.json',
  'docs/evidence/ui-landing-assets-waf-local-2026-10-13.json',
  'docs/release/ui-landing-repair-review-2026-10-13.md',
  'scripts/prepare-ui-landing-assets-waf.mjs',
  'scripts/test-demo-routes.mjs', 'scripts/test-demo-qr-boundary.mjs',
  'docs/evidence/ui-landing-repair-desktop-2026-10-13.jpg',
  'docs/evidence/ui-landing-repair-mobile-2026-10-13.jpg',
];
const bytes = await Promise.all(paths.map(path => readFile(resolve(root, path))));
const [source, build, ui, waf] = bytes.slice(0, 4).map(v => JSON.parse(v));
const digest = '40e9459b6906a085982a869c7633d055360cfa71048512113fa22379db861ca5';
if ([source, build, ui].some(v => v.sourceDigest !== digest) || source.fileCount !== 344 || source.changedPaths.join(',') !== 'app/page.tsx,lib/pilot-route-policy.ts' || build.status !== 'PASS_UI_LANDING_REPAIR_BUILD' || ui.status !== 'PASS_LOCAL_UI_RENDER_AND_INTERACTION_NOT_PRODUCTION_ACCEPTANCE' || ui.productionPublished !== false || sha(bytes[5]) !== 'ed106ad3ccda8fa1d14c6b3742e7c3d6f278396686021d4ac8c71e4a37860383') throw Error('EXACT_LOCAL_UI_REPAIR_EVIDENCE_REQUIRED');
for (const row of source.files) if (sha(await readFile(resolve(root, source.sourceDirectory, row.path))) !== row.sha256) throw Error('FROZEN_UI_REPAIR_CHANGED');
const record = {
  version: 1, status: 'PREPARED_UI_ONLY_PUBLICATION_REQUIRES_APPROVAL', preparedAt: new Date().toISOString(),
  sourceDigest: digest, parentSourceDigest: source.parentSourceDigest,
  currentDeploymentBaseline: 'dpl_2kx2wwhZHpXSXeDQc96qCc83H3tY',
  projectId: 'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3', teamId: 'team_XjolcoWJ9V9yamVnCdpC7EMY',
  canonicalOrigin: 'https://bazaar.browns.studio', changedRuntimePaths: source.changedPaths,
  evidencePins: paths.map((path, i) => ({ path, sha256: sha(bytes[i]) })),
  maximumStagedProductionVersions: 1, maximumPromotions: 1, conditionalPromotionOnly: true,
  newPublicAccess: { methods: ['GET', 'HEAD'], paths: ['/demo-deliveries/afiche-orbita.png', '/demo-deliveries/afiche-pulso.png', '/demo-deliveries/clip-demostracion.mp4', '/demo-deliveries/subtitulos.vtt'], entirePrefixAllowed: false },
  security: {
    originalWafHash: 'b80bf3ca1bd90fbba00d4bcda9c76478d6664cb7ec9acbf76f219289fb4ac69c',
    assetsOnlyExpectedWafHash: '1f6f64a8e7e2d6360f67d1ad69783b521cce5a946b53c505b4177aa02796dc27',
    assetChangedRegexValues: 8, preserveAllOtherPublicAndPrivateRules: true,
    actualStagingHostOnlyAfterVerifiedDeployment: true, temporaryStageAccess: 'existing operator IP only, with SSO retained',
    combinedPhaseFingerprintsMustBeDerivedAndReadBack: true, obsoleteWritersRemainIsolated: true,
  },
  preserved: { upstashPlan: 'Free', projectEnvironmentReferences: true, budgets: true, admissionAndBuyerAllowlist: true, allConsumptionAndHolds: true, originalOrder: '31c97193-be74-4b9d-b0a3-f3890b0a41e8', providerDeployment: 'dpl_59zNf8MCvktnzTgci3eppUriS2Un', existingHourlyGuardianDefinition: source.crons },
  freshGatesBeforeEffects: ['Human approval of this exact UI-only package.', 'Current canonical target, immutable source, project references and security still match the baseline.', 'Derive concrete combined WAF phase from the verified staged hostname; do not reuse an assets-only or former phase fingerprint.', 'Hosted build, UI and effective existing configuration pass before promotion.', 'Canonical UI readback passes; otherwise retain or restore the old target without changing quotas or reservations.'],
  noAuthorityFor: ['Budget increase to 9.9 GB or any other limit change', 'New native seller or new scoped credential', 'New provider deployment', 'New accounts, orders, signatures or payments', 'New cron or change of schedule', 'General purchase opening'],
  applicationPerformed: false, productionPublished: false, firewallChanged: false, newPayments: 0,
  limitations: ['Local storage and catalog data are deliberately unavailable; GPU acceptance does not prove payments/history or physical mobile performance.', 'Later budget/example candidates must include this UI repair before another production promotion.'],
};
const path = 'docs/release/ui-landing-repair-review-2026-10-13.json';
const output = Buffer.from(JSON.stringify(record, null, 2) + '\n');
await writeFile(resolve(root, path), output, { flag: 'wx' });
console.log(JSON.stringify({ status: record.status, path, sha256: sha(output), sourceDigest: digest, filesVerified: source.files.length, cloudWrites: 0 }));
