// Public local handoff only; never opens a private profile or launches a child.
import {readFile,writeFile} from 'node:fs/promises';
import {sha} from './recovery-example-budget2-preview-lib.mjs';
const before=await readFile('docs/release/recovery-example-budget-preview-execution-contract-2026-10-13.json','utf8');
const replaced=before.replaceAll('recovery-example-budget-preview','recovery-example-budget2-preview').replaceAll('example-budget.vercel.app','example-budget2.vercel.app').replaceAll('example-text-wire/v1','example-text-wire/v2');
const value=JSON.parse(replaced);
value.status='PREPARED_BUDGET_V2_ROOT_SEQUENCE_PENDING_FINAL_PINS';
value.sourcePrerequisite='Root must freeze and build the final v2 candidate. The target builder verifies that the frozen budget runtime supports example-text-wire/v2. Initial hold pins must be finalized in the new hold reader before any private read.';
value.existingPrivateInputs.preserved.push('.vercel/recovery-example-budget-preview-profile.dpapi');
value.oldBudgetV1AcceptancePreserved=true;
value.commandBudget={public:115000,authenticated:90000,recovery:105000,background:50000};
value.commandBudgetTotal=360000;
value.sourceDigest=null;value.initialReservation=null;
value.steps.find(step=>step.number===17).gate='Blocked until reviewed v2 source and numeric reservation pins are fixed; the reader currently fails before any private profile or Redis GET. Then require one scoped GET before/after same-order recovery and no reserve growth/reset.';
value.finalPinsRequiredBeforeExecution=['v2 source digest/manifest/build and their hashes','last accepted v1 encrypted profile byte hash supplied in public descriptor','v2 initial recovery/background/transfer reservation; never copy v1 as a default','current owned Production metadata and restored WAF baselines'];
const names=['scripts/recovery-example-budget2-preview-lib.mjs','scripts/prepare-recovery-example-budget2-preview-target.mjs','scripts/recovery-example-budget2-preview-hold-read.mjs',
 '.vercel/recovery-example-budget2-preview-setup.mjs','.vercel/recovery-example-budget2-preview-private.ps1','.vercel/recovery-example-budget2-preview-deploy.mjs','.vercel/recovery-example-budget2-preview-acceptance.mjs','.vercel/recovery-example-budget2-preview-storage.mjs','.vercel/recovery-example-budget2-preview-qr.mjs','.vercel/recovery-example-budget2-preview-waf.mjs'];
value.helpers=Object.fromEntries(await Promise.all(names.map(async path=>[path,sha(await readFile(path))])));
const path='docs/release/recovery-example-budget2-preview-execution-contract-2026-10-13.json';
await writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({status:value.status,path,helperCount:names.length,sourceAndInitialReservationPinsPending:true,networkRequests:0,dpapiReads:0,cloudWrites:0,payments:0}));
