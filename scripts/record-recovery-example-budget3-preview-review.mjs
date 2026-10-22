import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {V3_PREVIEW as C} from './recovery-example-budget3-preview-contract.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),save=(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const evidence=[
 'docs/evidence/recovery-example-budget3-bazaar-source-2026-10-13.json',
 'docs/evidence/recovery-example-budget3-bazaar-build-2026-10-13.json',
 'docs/evidence/recovery-example-budget3-production-bazaar-source-2026-10-13.json',
 'docs/evidence/recovery-example-budget3-production-bazaar-build-2026-10-13.json',
 'docs/evidence/recovery-example-budget-v3-proof-classification-local-2026-10-13.json',
 'docs/evidence/example-budget-v3-metadata-complete-ui-local-2026-10-13.json',
 'docs/evidence/recovery-example-budget2-preview-review-2026-10-13.json',
 'docs/evidence/recovery-example-budget2-preview-run-2026-10-13.json',
 'docs/evidence/recovery-example-budget2-preview-recover-2026-10-13.json',
 'docs/evidence/recovery-example-native-recovery-local-v3-2026-10-13.json',
 'docs/evidence/recovery-example-budget3-final-old-holds-after-2026-10-13.json',
 'docs/evidence/recovery-example-budget2-current-production-metadata-read-2026-10-13.json',
];
const pins=[];for(const path of evidence){const b=await readFile(path),v=JSON.parse(b);pins.push({path,sha256:sha(b),status:v.status});}
const helperPaths=['scripts/recovery-example-budget3-preview-contract.mjs','scripts/test-recovery-example-budget3-preview-contract.mjs','.vercel/recovery-example-budget3-preview-replacement.mjs','.vercel/recovery-example-budget3-preview-acceptance.mjs','.vercel/recovery-example-budget3-preview-waf.mjs'];
const helperPins=[];for(const path of helperPaths)helperPins.push({path,sha256:sha(await readFile(path))});
const plan={version:1,status:'PREPARED_PENDING_SUPPLEMENTAL_PREVIEW_SOURCE_APPROVAL',sourceDigest:C.sourceDigest,productionCandidateSourceDigest:C.productionSourceDigest,maximumNewDeployments:1,maximumNewOrders:0,maximumNewAccounts:0,maximumNewCredentials:0,providerDeployment:C.providerDeployment,providerSourceDigest:C.providerSourceDigest,oldBazaarPreviewDeployment:C.oldDeployment,sameSyntheticFamily:C.familyFingerprint,sameUnpaidOperation:C.operationFingerprint,hosts:{bazaar:'stellar-bazaar-x402-example-budget2.vercel.app',provider:'ai-video-scriptwriter-example-budget2.vercel.app'},credentials:'Reuse only existing native three-prefix Preview access, Preview authentication headers, and two existing synthetic account accesses. No root token or local financial signer deployed.',deployment:'One cronless Bazaar replacement Preview; switch only its existing protected Preview alias after READY; provider and both production targets remain unchanged.',waf:'Fresh rebase only the two existing temporary Preview host exceptions, preserve project SSO and every other rule; restore after acceptance, refuse overwrite if baseline changed.',acceptance:'Initialize/tools/list, static metadata, skills/catalog, service/QR, human and agent identity/query history, and recovery of the existing unpaid V2 order. No creation, claim, delivery, payment verification or settlement endpoint.',limits:'Existing synthetic ledger cap/configuration/old holds stay unchanged. Only private runtime request profile v3 differs. Up to45 HTTP calls,2MB HTTP responses,15k conservative Redis commands,100MB real Redis bodies; stop on uncertain result.',evidencePins:pins,helperPins,productionPublished:false,productionLimitsChanged:false,productionReservationsChanged:false,cronActivated:false,payments:0,signatures:0,providerExecutions:0,limitations:['V2 hosted antecedent created the unpaid order; this replacement validates V3 metadata/identity/history and old-order compatibility, not V3 new order admission or a real payment.','Production bootstrap adapters/secret bindings, backend access proof and final fresh capacity gate require separate acceptance before joint publication.','A9.9GB proposed internal cap is not yet applied and its finite one-order forecast is not unlimited traffic or incidents.']};
const path='docs/release/recovery-example-budget3-preview-replacement-plan-2026-10-13.json';await save(path,plan);
console.log(JSON.stringify({status:plan.status,path,sha256:sha(await readFile(path)),sources:[C.sourceDigest,C.productionSourceDigest],evidencePins:pins.length,helperPins:helperPins.length,networkRequests:0,payments:0}));
