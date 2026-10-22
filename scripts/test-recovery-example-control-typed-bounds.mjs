import assert from 'node:assert/strict';
import {captureExampleBudgetCommandCatalog} from './prepare-example-budget-command-catalog.mjs';
import {deriveExampleControlTypedBounds,CONTROL_TYPED_CAPS} from './recovery-example-control-typed-bounds.mjs';
const catalog=await captureExampleBudgetCommandCatalog(),result=deriveExampleControlTypedBounds(catalog);let checks=0;
const check=(value,expected)=>{assert.deepEqual(value,expected);checks++;};
check(result.families.metadata.total.restRequests,5);check(result.families.metadata.total.commandsUpper,23);check(result.families.identity.total.restRequests,10);check(result.families.identity.total.commandsUpper,47);check(result.families.capacity.total.restRequests,17);check(result.families.capacity.total.commandsUpper,67);check(result.families.capacityWithLegacyIndexBootstrap.total.restRequests,21);check(result.families.capacityWithLegacyIndexBootstrap.total.commandsUpper,84);
for(const [family,mib]of Object.entries({metadata:10,identity:20,capacity:28,capacityWithLegacyIndexBootstrap:32})){assert.ok(result.families[family].total.combinedUpperBytes<=mib*1048576,'Source-typed '+family+' bound must fit proposed analytical envelope.');checks++;}
check(result.model.storageLedgerRawTransported,false);check(CONTROL_TYPED_CAPS.index,512);
for(const family of Object.values(result.families)){check(family.total.combinedUpperBytes,family.total.outboundUpperBytes+family.total.inboundUpperBytes);check(family.rows.filter(row=>row.label==='continuous-free-command-debit').length,1);}
const forged={...catalog,localScriptFixtures:catalog.localScriptFixtures.map(row=>row.category==='workspace-read'?{...row,argCount:1}:row)};assert.throws(()=>deriveExampleControlTypedBounds(forged),/TYPED_CONTROL_ARGUMENT_POSITION_MISMATCH/);checks++;
console.log(JSON.stringify({status:'PASS_LOCAL_SOURCE_TYPED_CONTROL_MATRIX',checks,totals:Object.fromEntries(Object.entries(result.families).map(([key,row])=>[key,row.total])),networkRequests:0,ledgerWrites:0,payments:0,limitsChanged:false}));
