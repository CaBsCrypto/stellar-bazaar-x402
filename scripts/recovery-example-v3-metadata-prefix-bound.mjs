// LOCAL analytical prefix proof. Exact native scripts and the real response
// allocator are used, but no Lua, HTTP, wallet or ledger command is executed.
import {exampleBudgetRedisResponseAllocation} from '../lib/example-budget-response-allocation.ts';
import {exampleBudgetCommandWeight} from '../lib/example-budget-command-weight.ts';
import {deriveExampleControlTypedBounds} from './recovery-example-control-typed-bounds.mjs';
const MiB=1048576,keyPrefix='bazaar-workspace:pilot-'+'a'.repeat(32),tag='{pilot-'+'a'.repeat(32)+'}';
const registry=keyPrefix+':'+tag+':registry',ownerNone=keyPrefix+':'+tag+':owner:none',marker=keyPrefix+':'+tag+':initialized',maintenance=keyPrefix+':'+tag+':maintenance',storage=keyPrefix+':'+tag+':continuous-free-storage:v1',budget=keyPrefix+':'+tag+':continuous-free-budget:v1';
function commandForRow(catalog,row){
 if(row.category==='GET')return ['GET',maintenance];
 const script=catalog.localScriptFixtures.find(value=>value.category===row.category);if(!script)throw Error('EXACT_METADATA_NATIVE_SCRIPT_REQUIRED');
 const keys=row.category==='workspace-read'?[registry,ownerNone,marker]:row.category==='continuous-budget'?[budget]:row.category==='workspace-cas-storage'?[registry,ownerNone,marker,maintenance,storage]:undefined;
 if(!keys||keys.length!==script.keyCount)throw Error('METADATA_TYPED_KEY_POSITION_MISMATCH');
 // Only descriptor/allocator shape is used here. The strings stand for each
 // independently bounded argument, not runnable or valid ledger mutation data.
 return ['EVAL',script.script,keys.length,...keys,...row.argsRawCaps.map(()=>'' )];
}
export function deriveV3MetadataPrefixBound(catalog){
 const model=deriveExampleControlTypedBounds(catalog),rows=model.families.metadata.rows,guardBytes=8.5*MiB;
 let out=0,inc=0,commands=0;
 const prefixes=rows.map(row=>{
  const command=commandForRow(catalog,row),allocation=exampleBudgetRedisResponseAllocation(command),weight=exampleBudgetCommandWeight(command);
  if(weight!==row.commandsUpper||row.inboundUpperBytes>allocation)throw Error('METADATA_ACTUAL_ALLOCATOR_UNDERBOUND');
  out+=row.outboundUpperBytes;commands+=weight;
  const preflightCombinedUpperBytes=out+inc+allocation,preflightMarginBytes=guardBytes-preflightCombinedUpperBytes;
  inc+=row.inboundUpperBytes;
  return {label:row.label,category:row.category,requests:rows.indexOf(row)+1,commandsUpper:commands,requestUpperBytes:row.outboundUpperBytes,responseUpperBytes:row.inboundUpperBytes,actualNextResponseAllocation:allocation,cumulativeOutboundUpperBytes:out,cumulativePriorInboundUpperBytes:inc-row.inboundUpperBytes,preflightCombinedUpperBytes,preflightMarginBytes,afterResponseCombinedUpperBytes:out+inc,fitsBeforeEffect:preflightMarginBytes>=0};
 });
 return {version:1,status:'OFFLINE_EXACT_METADATA_PREFIX_BOUND_ONLY',guardBytes,totalCombinedSourceUpperBytes:out+inc,maximumPreflightCombinedUpperBytes:Math.max(...prefixes.map(value=>value.preflightCombinedUpperBytes)),minimumPreflightMarginBytes:Math.min(...prefixes.map(value=>value.preflightMarginBytes)),maximumNativeRequests:5,maximumNativeCommands:commands,prefixes,allPrefixesFit:prefixes.every(value=>value.fitsBeforeEffect),eligibleSources:{authenticatedTransport:['initialize','notifications/initialized','tools/list','GET /api/mcp','HEAD /api/mcp'],anonymousStaticTools:['get_bazaar_capabilities','list_workflow_bundles','get_workflow_bundle','validate_service_card'],staticAuthenticatedValidationOnly:['validate_service_card'],authenticatedObservedQueriesExcluded:true,skillsCatalogExcluded:true},importantConditions:['Every authenticated metadata credential proof reads owner:none, not an owner document. The allocator still conservatively includes its128KiB phantom owner.','The preflight sums every prior reply at its typed maximum plus the ACTUAL allocator for the next response, not just final bytes.','get_bazaar_skills loads a native catalog and must receive catalog pricing, not cheap static metadata.','Only anonymous static capabilities are included; authenticated capabilities retain their observer and allowlist check.','Unknown or changed Lua hashes remain unavailable before effects.','No V1/V2 price or old hold may be resized by this V3 proposal.'],networkRequests:0,redisWrites:0,payments:0,limitsChanged:false};
}
