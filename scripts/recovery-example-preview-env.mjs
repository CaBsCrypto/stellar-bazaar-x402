/** Inspect only public settings and Secret references. Never copy inherited
 * values into deployment overrides or return credentials in a receipt. */
const legacy=Object.freeze({
 BAZAAR_TEXT_SELLER_MODE:'on-demand',
 BAZAAR_TEXT_SELLER_SERVICE_ID:'guionista-bazaar-pilot-text-funded-v1',
 BAZAAR_TEXT_SELLER_CARD_HASH:'c1714ebdf43c10b14016906919f00db4fcedb784a72df0de6e9579edf0195bbf',
 BAZAAR_TEXT_SELLER_OWNER_FINGERPRINT:'2c6ec593b58c964271ab06e2f9c38e2c0e3ab8fc8275c7cc4f44568ef073c873',
 BAZAAR_TEXT_SELLER_WAKE_URL:'https://ai-video-scriptwriter-dfdvx8vg0.vercel.app/api/bazaar/seller/tick',
});
const legacySecrets=['BAZAAR_TEXT_SELLER_WAKE_TOKEN','BAZAAR_TEXT_SELLER_WAKE_PROTECTION'];
const absent=new Set(['BAZAAR_FREE_DEMO_ADMISSION_UNTIL','BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES','BAZAAR_TEXT_SELLER_RECOVERY_SLOT_OPERATION_ID','X402_PAYER_SECRET','BAZAAR_WORKSPACE_INVITE_HASHES_JSON','BAZAAR_WORKSPACE_ISOLATED_OWNERS_JSON','BAZAAR_WORKSPACE_ISOLATED_RELAY_ORIGIN']);
const disabled=new Set(['X402_ENABLE_LOCAL_PAYER','BAZAAR_ACCEPTANCE_X402','BAZAAR_ACCEPTANCE_SALE','BAZAAR_ACCEPTANCE_METER','BAZAAR_OPERATIONAL_METER','BAZAAR_OPERATIONAL_BUDGET']);
const enabled=new Set(['BAZAAR_ROUTE_BOUNDARY']);
const fail=code=>{throw Error(code);};
export function validateInheritedPreviewRows(rows,stage='bazaar'){
 if(!['bazaar','provider'].includes(stage)||!Array.isArray(rows)||rows.length>1000)fail('EXAMPLE_PREVIEW_ENV_ROWS_REQUIRED');
 const selected=[];
 for(const row of rows){
  if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.key!=='string'||!row.key||!Array.isArray(row.target))fail('EXAMPLE_PREVIEW_ENV_ROW_INVALID');
  if(!row.target.includes('preview'))continue;
  if(row.gitBranch!==undefined&&row.gitBranch!==null||row.customEnvironmentIds!==undefined&&(!Array.isArray(row.customEnvironmentIds)||row.customEnvironmentIds.length))fail('EXAMPLE_PREVIEW_BRANCH_ENV_FORBIDDEN');
  selected.push(row);
 }
 const values=new Map();for(const row of selected){if(values.has(row.key))fail('EXAMPLE_PREVIEW_DUPLICATE_ENV');values.set(row.key,row);}
 for(const [key,row]of values){
  if(absent.has(key)||key.startsWith('BAZAAR_WORKSPACE_ISOLATED_'))fail('EXAMPLE_PREVIEW_UNSAFE_INHERITED_ENV');
  if(disabled.has(key)&&row.value!=='false'||enabled.has(key)&&row.value!=='true')fail('EXAMPLE_PREVIEW_UNSAFE_INHERITED_FLAG');
 }
 const legacyKeys=[...Object.keys(legacy),...legacySecrets],present=legacyKeys.filter(key=>values.has(key));
 if(present.length){
  if(stage!=='bazaar'||present.length!==legacyKeys.length)fail('EXAMPLE_PREVIEW_LEGACY_BINDING_INCOMPLETE');
  for(const [key,value]of Object.entries(legacy))if(values.get(key).value!==value)fail('EXAMPLE_PREVIEW_LEGACY_BINDING_CHANGED');
  for(const key of legacySecrets){const row=values.get(key);if(!['sensitive','secret'].includes(row.type)||typeof row.id!=='string'||!row.id||row.id.length>128)fail('EXAMPLE_PREVIEW_LEGACY_SECRET_REFERENCE_REQUIRED');}
 }
 return {status:'PASS_INHERITED_PREVIEW_ENVIRONMENT',stage,previewRows:selected.length,branchScopedRows:0,dangerousSettingsAbsent:true,legacyBinding:present.length?'exact-reviewed-binding-preserved':'absent',legacySecretReferences:present.length?legacySecrets.length:0,secretValuesRead:0,projectEnvWrites:0};
}
