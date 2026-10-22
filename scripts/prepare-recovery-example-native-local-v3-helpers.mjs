// Pure local preparation of a NEW real-Redis / synthetic-financial test realm.
// Does not read a private profile, run a child, generate an ACL or contact Redis.
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),fail=code=>{throw Error(code);};
const sourcePaths=['scripts/recovery-example-budget-local-v2-access.mjs','scripts/recovery-example-native-local-measurement-v2.mjs','.vercel/recovery-example-budget-local-v2-private.ps1'];
const destination=path=>path.replaceAll('local-v2','local-v3').replaceAll('measurement-v2','measurement-v3');
export function nativeLocalV3HelperSource(path,input){
 if(!sourcePaths.includes(path)||typeof input!=='string'||input.length>200000)fail('V3_EXACT_LOCAL_ANCESTOR_HELPER_REQUIRED');
 let out=input.replaceAll('LOCAL_V2','LOCAL_V3').replaceAll('V2','V3').replaceAll('local-v2','local-v3').replaceAll('measurement-v2','measurement-v3')
   .replaceAll('new-v2','new-v3').replaceAll('fresh-only-v2','fresh-only-v3').replaceAll('fresh-only-v3','fresh-only-v3')
   .replaceAll('measurement/v2','measurement/v3').replaceAll('budget_local_v2_','budget_local_v3_').replaceAll('example-text-wire/v1','example-text-wire/v2');
 if(path.endsWith('-access.mjs')){
   // The original v1 ancestor list and paths must stay literal; only NEW paths change.
   out=out.replace("export const PRESERVED_LOCAL_V1_ARTIFACTS=Object.freeze(","const RETAINED_V1_ARTIFACTS=Object.freeze(");
   const marker="const tokenShape=";
   const extra="export const PRESERVED_LOCAL_V1_ARTIFACTS=Object.freeze([...RETAINED_V1_ARTIFACTS,"+
    JSON.stringify('.vercel/recovery-example-budget-local-v2-profile.dpapi')+','+
    JSON.stringify('.vercel/recovery-example-budget-preview-profile.dpapi')+','+
    JSON.stringify('scripts/recovery-example-budget-local-v2-access.mjs')+','+
    JSON.stringify('scripts/recovery-example-native-local-measurement-v2.mjs')+','+
    JSON.stringify('.vercel/recovery-example-budget-local-v2-private.ps1')+','+
    JSON.stringify('.vercel/recovery-example-budget-local-v2-measurement-intent.json')+','+
    JSON.stringify('.vercel/recovery-example-native-local-measurement-new-v2-intent.json')+','+
    JSON.stringify('docs/evidence/recovery-example-native-local-measurement-new-v2-2026-10-13.json')+','+
    JSON.stringify('.vercel/recovery-example-native-claim-local-v2-intent.json')+','+
    JSON.stringify('docs/evidence/recovery-example-native-claim-local-v2-2026-10-13.json')+','+
    JSON.stringify('.vercel/recovery-example-native-delivery-local-v2-intent.json')+','+
    JSON.stringify('docs/evidence/recovery-example-native-delivery-local-v2-2026-10-13.json')+','+
    JSON.stringify('docs/evidence/recovery-example-budget-preview-run-2026-10-12.json')+"]);\n"+
    "export const RETAINED_V2_FAMILY='4ced0e9f4779fe0eb84558877e13ead8f49d9e4cc8ed588788bab031fb87b782';\n"+
    "export const RETAINED_BUDGET_V1_FAMILY='a88ea26a7afe4fccedf5507aebca483bf879c252fa046705269ffcb466297dd9';\n";
   out=out.replace(marker,extra+marker)
     .replaceAll('v2Prefixes','v3Prefixes').replaceAll('v2Journal','v3Journal')
     .replaceAll('version:2','version:3').replaceAll('j.version!==2','j.version!==3')
     .replace('boundArtifact(PRESERVED_LOCAL_V1_ARTIFACTS.at(-1))','boundArtifact(RETAINED_V1_ARTIFACTS.at(-1))')
     .replaceAll('forbiddenFamilyFingerprints.length!==3','forbiddenFamilyFingerprints.length!==5')
     .replaceAll('new Set(profile.forbiddenFamilyFingerprints).size!==3','new Set(profile.forbiddenFamilyFingerprints).size!==5')
     .replace("profile.forbiddenFamilyFingerprints[2]!==LOCAL_V3.failedLocalFamilyFingerprint","profile.forbiddenFamilyFingerprints[2]!==LOCAL_V3.failedLocalFamilyFingerprint||profile.forbiddenFamilyFingerprints[3]!==RETAINED_V2_FAMILY||profile.forbiddenFamilyFingerprints[4]!==RETAINED_BUDGET_V1_FAMILY")
     .replace('LOCAL_V3.failedLocalFamilyFingerprint]};validateV3Profile','LOCAL_V3.failedLocalFamilyFingerprint,RETAINED_V2_FAMILY,RETAINED_BUDGET_V1_FAMILY]};validateV3Profile')
     .replace('forbiddenNamespaceCount:3','forbiddenNamespaceCount:5')
     .replaceAll('},180000);','},320000);');
   const gate="await originalJournalUnchanged();return {previousPreviewFamilyFingerprint:old.familyFingerprint,preservedArtifacts};";
   out=out.replace(gate,"const retainedV2=JSON.parse(await boundArtifact('docs/evidence/recovery-example-native-delivery-local-v2-2026-10-13.json')),budgetV1=JSON.parse(await boundArtifact('docs/evidence/recovery-example-budget-preview-native-2026-10-12.json'));if(retainedV2.status!=='PASS_EXISTING_LOCAL_V2_NATIVE_DELIVERY'||retainedV2.familyFingerprint!==RETAINED_V2_FAMILY||retainedV2.providerExecutions!==1||retainedV2.realPayments!==0||budgetV1.status!=='PASS_REAL_ISOLATED_NATIVE_SETUP'||budgetV1.familyFingerprint!==RETAINED_BUDGET_V1_FAMILY)fail('V3_RETAINED_LOCAL_V2_AND_BUDGET_V1_REQUIRED');"+gate);
 }else if(path.endsWith('.ps1'))out=out.replace('WaitForExit(240000)','WaitForExit(420000)');
 else{
   out=out.replaceAll('forbiddenFamilyFingerprints.length!==3','forbiddenFamilyFingerprints.length!==5')
     .replaceAll('new Set(value.forbiddenFamilyFingerprints).size!==3','new Set(value.forbiddenFamilyFingerprints).size!==5')
     .replace("!value.forbiddenFamilyFingerprints.includes('76c199f9e1bc478f8203864d06da460a31725f3f9e896687b5dae8d80ea401fd')","!value.forbiddenFamilyFingerprints.includes('76c199f9e1bc478f8203864d06da460a31725f3f9e896687b5dae8d80ea401fd')||!value.forbiddenFamilyFingerprints.includes('4ced0e9f4779fe0eb84558877e13ead8f49d9e4cc8ed588788bab031fb87b782')||!value.forbiddenFamilyFingerprints.includes('a88ea26a7afe4fccedf5507aebca483bf879c252fa046705269ffcb466297dd9')");
 }
 if(!out.includes(path.endsWith('.ps1')?'local-v3':'measurement/v3'))fail('V3_EXACT_NEW_HELPER_PURPOSE_REQUIRED');
 return out;
}
const records=[],outputs=[];
for(const path of sourcePaths){const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>200000)fail('V3_PLAIN_LOCAL_ANCESTOR_REQUIRED');const before=await readFile(path),after=Buffer.from(nativeLocalV3HelperSource(path,before.toString('utf8'))),target=destination(path);records.push({ancestor:path,ancestorSha256:sha(before),target,sha256:sha(after),bytes:after.length});outputs.push({target,bytes:after});}
const [action,flag,pin]=process.argv.slice(2),base={version:1,status:'PREPARED_LOCAL_V3_HELPER_TEMPLATES_NOT_EXECUTED',purpose:'bazaar-recovery-example-native-local-measurement/v3',budgetVersion:'example-text-wire/v2',forbiddenFamilyCount:5,localChildTimeoutMs:320000,localWrapperTimeoutMs:420000,records,finalRootSourceAndPinsRequired:true,networkRequests:0,dpapiReads:0,profilesCreated:0,aclWrites:0,payments:0,productionPublished:false};
const plan={...base,planHash:sha(JSON.stringify(base))};
if(action==='inspect'&&process.argv.length===3)console.log(JSON.stringify(plan));
else if(action==='prepare'&&process.argv.length===5&&flag==='--approved-plan'&&pin===plan.planHash){const manifest='docs/evidence/recovery-example-native-local-v3-helper-template-2026-10-13.json';for(const path of [...outputs.map(r=>r.target),manifest]){try{await lstat(path);fail('V3_FRESH_HELPER_ARTIFACT_REQUIRED');}catch(e){if(e.code!=='ENOENT')throw e;}}for(const row of outputs)await writeFile(row.target,row.bytes,{flag:'wx',mode:0o600});await writeFile(manifest,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({...plan,records:records.length,manifest}));}
else fail('V3_LOCAL_TEMPLATE_ACTION_REQUIRED');
