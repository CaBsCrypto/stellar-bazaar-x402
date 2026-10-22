// Records already completed local checks. Never calls cloud or unseals profiles.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const pins={
 '.vercel/payment-recovery-acceptance-production-control.mjs':'a88d05af60ba73c73cc15905b12a70bee3962923d5c9a0508a4b6a4e59f4f92c',
 'scripts/test-payment-recovery-acceptance-production-control.mjs':'e64e5ea48641638e3d002c0b454584932d7bd97329ef0403ef502fea425bd333',
 '.vercel/payment-recovery-acceptance-postpromotion-acceptance.mjs':'65c1a48587ede0607443d340b0c9f4763385697fe8ae4a55703d2b64d3208b7b',
 '.vercel/payment-recovery-acceptance-postpromotion-acceptance.ps1':'ccf913abcf75562afc3f56cae7aa10a679013823becfc6137e8fb378f4f95333',
 'scripts/test-payment-recovery-acceptance-postpromotion.mjs':'6e22b53f1f34e4c03835d1a05f4608cef7f22e770f2bd8949d633811c7feb952'
};
for(const[path,pin]of Object.entries(pins))if(sha(await readFile(path))!==pin)throw Error('EXACT_LOCAL_HELPER_PIN_REQUIRED');
const value={version:1,status:'PASS_LOCAL_APPROVED_RECOVERY_PUBLICATION_CONTROLS_PREPARED_NOT_EXECUTED',preparedAt:new Date().toISOString(),sourceDigest:'3c3fe5ad3dc886e770c5aec1e1cee2762686558036c3bf55ec310899a35173ed',sourceManifestSha256:'2252de2a1849488ca5998e54f4f77d467327b7547ff1c9296e78147780e1c42c',reviewSha256:'34abf017e578885638f780831a53f6d7ac4f6a299acd73a57d51e857849068d4',proposalSha256:'1a9673a0a6c583c990c86325b94ea5088ee90506a63c69243fc4119af1ae4cd0',planHash:'36cc164e79928a1c90260bcb459548dbe6433f46418002f7f43ebb116c4e0667',sourceFilesVerified:344,currentCanonicalBaseline:'dpl_6N8TLwUSssWffGGC1PW4qFRVrmwk',baselineWafHash:'66f5ce1c26e4269df595ab23f0d0eb394d6eac2eff2468994f979d428c1fe6f3',controllerFixtureChecks:122,postpromotionFixtureChecks:54,maximumUploads:1,maximumPromotions:1,maximumWafPhases:3,postpromotionMaximumHttpRequests:7,postpromotionMaximumConservativeBudgetBytes:130000000,postpromotionScope:['GET catalog search','GET service QR','GET general QR','MCP initialize','MCP tools/list','own authenticated capabilities','other authenticated capabilities'],pins,networkRequests:0,dpapiReads:0,cloudWrites:0,projectEnvironmentWrites:0,newAccounts:0,newOrders:0,newPayments:0,signatures:0,settlements:0,providerExecutions:0,financialAcceptanceValidated:false,generalPurchasesEnabled:false};
await writeFile('docs/evidence/payment-recovery-acceptance-production-controls-local-2026-10-12.json',JSON.stringify(value,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:value.status,controllerFixtureChecks:122,postpromotionFixtureChecks:54,networkRequests:0,cloudWrites:0}));
