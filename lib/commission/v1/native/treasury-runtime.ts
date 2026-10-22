import {authenticateWorkspaceRequest} from '../../../workspace-http.ts';
import {marketDiagnosticOperatorMatches} from '../../../market-operator-diagnostic-origin.ts';
import {configuredNativeTreasuryComponents} from './treasury-composition.ts';
import {createTreasuryHttpHandlers} from './treasury-http.mjs';
const disabled=createTreasuryHttpHandlers({authenticate:authenticateWorkspaceRequest,operatorMatches:marketDiagnosticOperatorMatches});
export const treasuryNativeHandlers={
 GET(request:Request){return handlers().GET(request);},
 POST(request:Request){return handlers().POST(request);},
};
function handlers(){if(process.env.BAZAAR_ENABLE_MARKETPLACE!=='true'||process.env.BAZAAR_SPLIT_TREASURY_BINDING_ENABLED!=='true')return disabled;try{return createTreasuryHttpHandlers({authenticate:authenticateWorkspaceRequest,operatorMatches:marketDiagnosticOperatorMatches,store:configuredNativeTreasuryComponents().store,enabled:true});}catch{return disabled;}}
/** Flags describe configuration only. They never prove a current native role,
 * receiving capacity, seller acceptance, router/provider readiness or payment. */
export function treasuryNativeReadiness(){return {configurationOnly:true,metadataEndpointConfigured:process.env.BAZAAR_ENABLE_MARKETPLACE==='true'&&process.env.BAZAAR_SPLIT_TREASURY_BINDING_ENABLED==='true',chainReaderConfigured:process.env.BAZAAR_TREASURY_CHAIN_READS_ENABLED==='true',treasuryRoleObserved:false,financialActionsEnabled:false,commissionEnabled:false,nativeFinancialActionReady:false};}
