// Compose existing, bounded public receipts locally. No network, Redis,
// credentials, production mutation, payment, or frozen-source imports.
import {createHash} from 'node:crypto';
import {readFile,lstat,open} from 'node:fs/promises';
import {resolve,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

export const FINAL_EXECUTION_PATHS=Object.freeze({
 bazaar:'docs/evidence/on-demand-v3-production-bazaar-deployment-2026-10-11.json',
 provider:'docs/evidence/on-demand-v3-production-provider-deployment-2026-10-11.json',
 native:'docs/evidence/on-demand-production-v3-storage-inventory-2026-10-12.json',
 nativeRaw:'docs/evidence/on-demand-production-v3-storage-inventory-2026-10-12.previous-66ebe11033879ec3854d8ae9ab8d18916f416ba1bd35c5c78fb0e3885b46e134.json',
 seller:'docs/evidence/on-demand-production-v3-seller-storage-2026-10-12.json',
 drainAttestation:'docs/evidence/on-demand-production-v3-native-drain-attestation-2026-10-12.json',
 protection:'docs/evidence/on-demand-v3-production-public-protection-2026-10-12.json',
 public:'docs/evidence/on-demand-v3-production-public-acceptance-2026-10-12.json',
 qrDecoded:'docs/evidence/on-demand-v3-production-qr-decoded-2026-10-12.json',
 serviceSvg:'docs/evidence/on-demand-v3-production-service-qr-2026-10-12.svg',
 generalSvg:'docs/evidence/on-demand-v3-production-general-qr-2026-10-12.svg',
 capacity:'.vercel/on-demand-production-v3-free-capacity-receipt.json',
 model:'docs/evidence/on-demand-free-capacity-plan-v2-2026-10-11.json',
 preview:'docs/evidence/on-demand-v2-preview-budget-read-2026-10-12.json',
 metadata:'docs/evidence/on-demand-v3-cron-host-metadata-correction-local-2026-10-12.json',
 screenshot:'docs/evidence/on-demand-v3-production-service-full-2026-10-12.jpg',
 viewportScreenshot:'docs/evidence/on-demand-v3-production-service-browser-2026-10-12.jpg',
 json:'docs/evidence/on-demand-production-v3-final-execution-2026-10-12.json',
 markdown:'docs/evidence/on-demand-production-v3-final-execution-2026-10-12.md',
});
const P=FINAL_EXECUTION_PATHS,sha=v=>createHash('sha256').update(v).digest('hex');
const fail=c=>{throw Error(c);},hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const releasePlan='5d7ef135f78cf9be801d6b7b58bd49eb305749f161eaaf3b18ee527c5d576266';
const initPlan='537047eb1fb6fe2624e23ed87aad133b4aadec7872d29ff8802ee61955de18fa';
const review='9f536603152df78703f01002d7f6c861ea313364d9d781e09d3583e1d1d6c636';
const source={bazaar:'034f25235cbbcc89f8f7e51633e93b372e7f531c2cf191f9b114920052b40c52',provider:'9f5b26c7a8ccfbf39c2420f99a938228677927bd1f51ddb825d5bf1c048ae232'};
const deployments={bazaar:'dpl_14sk88QGZ9A7UfatU2uQ2i95rYai',provider:'dpl_59zNf8MCvktnzTgci3eppUriS2Un'};
const origin='https://bazaar.browns.studio',service='guionista-bazaar-production-text-v1';
const cardHash='fa0890b56563deb08a983fb6e75d020a6105babc0b4bd3a6b834f4468897cefc';
const caps={public:115000,authenticated:90000,recovery:105000,background:50000};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const noEffects=(v,fields)=>{if(fields.some(k=>v[k]!==0))fail('REAL_RECEIPTS_MUST_NOT_INCLUDE_NEW_EFFECTS');};

export function finalExecutionPlan(){return {status:'PREPARED_LOCAL_FINAL_COMPOSER_NOT_EXECUTED',inputs:P,releasePlanHash:releasePlan,reviewHash:review,sourceDigests:source,networkRequests:0,redisCommands:0,cloudWrites:0,newPayments:0,paidAcceptanceClaimed:false,templateInputs:0};}

/** Synthetic fixtures may call this pure function. Execution loads only the
 * fixed real receipt paths above; templates are never accepted as results. */
export function composeFinalExecution(records,assembledAt=new Date().toISOString()){
 if(!stamp(assembledAt))fail('LOCAL_ASSEMBLY_TIMESTAMP_REQUIRED');
 const doc=k=>{const r=records[k];if(!r||!hex(r.sha256)||!r.document||typeof r.document!=='object')fail('BOUND_REAL_RECEIPT_REQUIRED');return r.document;};
 for(const kind of ['bazaar','provider']){
  const d=doc(kind);if(d.status!=='CANONICAL_ON_DEMAND_PRODUCTION_READY_ACCEPTANCE_PENDING'||d.kind!==kind||d.planHash!==releasePlan||d.reviewHash!==review||d.sourceDigest!==source[kind]||d.deploymentId!==deployments[kind]||d.readyState!=='READY'||d.target!=='production'||d.canonicalOrigin!==(kind==='bazaar'?origin:'https://ai-video-scriptwriter.vercel.app')||d.productionPublished!==true||d.generalPurchasesEnabled!==false||d.externalAcceptanceValidated!==false||!same(d.crons,kind==='bazaar'?[{path:'/api/market/guardian/tick',schedule:'0 * * * *'}]:[]))fail('EXACT_RESTRICTED_READY_SOURCES_REQUIRED');
  noEffects(d,['newPayments']);
 }
 const n=doc('native'),raw=doc('nativeRaw'),s=doc('seller'),a=doc('drainAttestation');
 if(n.status!=='PASS_PRODUCTION_STORAGE_INITIALIZED'||n.planHash!==initPlan||n.reviewHash!==review||n.sourceDigest!==source.bazaar||n.initialized!==true||n.commandLedgerReset!==false||n.legacyWritersDrained!==true||n.mutatedKeys!==1||n.pendingOperations!==0||n.budgetLedgerState!=='absent'||n.contentOrPaymentControlsChanged!==false)fail('EXACT_NONRESET_NATIVE_SEED_REQUIRED');
 if(raw.status!==n.status||raw.planHash!==n.planHash||raw.sourceDigest!==n.sourceDigest||raw.mutatedKeys!==n.mutatedKeys||raw.observedAt!==n.observedAt||s.status!=='PASS_EXISTING_SCOPED_PRODUCTION_SELLER_STORAGE'||s.initialized!==true||s.maximumBytes!==10000000||s.headroomReady!==true||s.primaryRedisTransferred!==false||s.nativeOrProviderContentChanged!==false||s.planHash!==initPlan||s.reviewHash!==review)fail('EXACT_ORIGINAL_NATIVE_AND_SCOPED_SELLER_SEEDS_REQUIRED');
 noEffects(n,['payments']);noEffects(s,['providerExecutions','payments']);
 if(a.status!=='PASS_REAL_INIT_DRAIN_ATTESTATION_COMPOSED'||a.planHash!==initPlan||a.reviewHash!==review||a.sourceDigest!==source.bazaar||a.rawEvidenceSha256!==records.nativeRaw.sha256||a.capacityReceiptSha256!==records.capacity?.sha256||a.legacyWritersDrained!==true||a.minimumActualSafeDrainedSeconds!==305||a.actualDrainedSeconds<305)fail('REAL_INITIALIZATION_DRAIN_BINDING_REQUIRED');
 const protection=doc('protection');if(protection.status!=='PASS_PRODUCTION_PUBLIC_PROTECTION_READBACK'||protection.planHash!==releasePlan||protection.reviewHash!==review||protection.bazaarSourceDigest!==source.bazaar||protection.providerSourceDigest!==source.provider||protection.bothQuarantinesActive!==true||protection.temporaryMaintenanceRemoved!==true||protection.originalSsoPreserved!==true||protection.publicConditionGroups!==22||protection.canonicalAliasesMatchReadySources!==true||protection.cronInvocationProven!==false||!stamp(protection.observedAt)||protection.guardianScheduleVerified!=='0 * * * *'||!same(protection.providerSchedules,[]))fail('REAL_PUBLIC_PROTECTION_READBACK_REQUIRED');
 for(const kind of ['bazaar','provider'])if(protection.projects?.[kind]?.deploymentId!==deployments[kind]||protection.projects[kind].sourceDigest!==source[kind])fail('READBACK_MUST_BIND_EXACT_READY_DEPLOYMENTS');
 noEffects(protection,['newPayments','newOrders','providerExecutions']);
 const pub=doc('public');if(pub.status!=='PASS_ANONYMOUS_PUBLIC_DISCOVERY_QR_DECODE_PENDING'||pub.planHash!==releasePlan||!same(pub.sourceDigests,source)||pub.origin!==origin||pub.bazaarDeploymentId!==deployments.bazaar||pub.providerDeploymentId!==deployments.provider||pub.anonymousClient!==true||pub.protectionBypassUsed!==false||pub.independentOperatorEgressValidated!==false||pub.paidFlowValidated!==false||!stamp(pub.observedAt)||!Array.isArray(pub.checks)||pub.requests!==12||pub.conservativeTransferBytes>1200000000||pub.service?.id!==service||pub.service.cardHash!==cardHash||pub.service.network!=='stellar:testnet'||pub.service.amount!=='0.01')fail('REAL_ANONYMOUS_PUBLIC_ACCEPTANCE_REQUIRED');
 noEffects(pub,['newAccounts','newOrders','newPayments','providerExecutions','providerTicks','readinessInvocations']);
 for(const k of ['PUBLIC_OPEN','PUBLIC_CATALOGO','ANONYMOUS_PURCHASES_RESTRICTED','EXACT_REVIEWED_TESTNET_SERVICE','PUBLIC_SEARCH_FINDS_SAME_SERVICE','PUBLIC_SERVICE_LINK_AND_CONTINUITY','EXACT_UNCHANGED_35_MCP_TOOLS','RESTRICTED_PURCHASES_TEXT_ONLY_PRODUCTION_GUARDIAN','CONTINUOUS_ON_DEMAND_NO_ANONYMOUS_WAKE','EXACT_360K_COMMAND_CONFIGURATION','NO_ADMISSION_DEADLINE'])if(!pub.checks.includes(k))fail('REAL_PUBLIC_REQUIRED_CHECKS_MISSING');
 const qr=doc('qrDecoded');if(qr.status!=='PASS_LOCAL_DECODING_CAPTURED_PRODUCTION_QRS'||qr.planHash!==releasePlan||!same(qr.sourceDigests,source)||!same(qr.deploymentIds,deployments)||qr.captureEvidence!==P.public||qr.captureEvidenceSha256!==records.public.sha256||qr.checks!==2||qr.networkRequests!==0||!Array.isArray(qr.results)||qr.results.length!==2||qr.paidFlowValidated!==false)fail('REAL_QR_DECODING_BINDING_REQUIRED');
 noEffects(qr,['newAccounts','newOrders','newPayments','providerExecutions']);
 for(const kind of ['service','general']){const result=qr.results.find(r=>r.kind===kind),capture=pub.qr?.[kind],svg=records[kind+'Svg'];if(!result||!svg||!hex(svg.sha256)||result.path!==P[kind+'Svg']||result.sha256!==svg.sha256||capture?.sha256!==svg.sha256||capture.path!==result.path||result.decodedDestination!==(kind==='service'?origin+'/resources/'+service:origin+'/demo')||capture.expectedDestination!==result.decodedDestination)fail('CAPTURED_SVG_HASH_AND_DESTINATION_REQUIRED');}
 const capacity=doc('capacity'),model=doc('model'),preview=doc('preview'),metadata=doc('metadata');
 if(capacity.status!=='CONFIRMED_FREE_CAPACITY_FOR_PRODUCTION'||capacity.upstashPlan!=='Free'||capacity.monthlyCommandLimit!==500000||capacity.applicationCommandBudget!==360000||!same(capacity.commandCaps,caps)||capacity.commandsUsed!==80000||capacity.sharedAndDeniedMargin!==50000||capacity.initializationCommandReserve!==3500||capacity.counterRegressionIsNotReset!==true)fail('APPROVED_360K_FREE_CAPACITY_REQUIRED');
 const total=capacity.applicationCommandBudget+capacity.commandsUsed+capacity.sharedAndDeniedMargin+capacity.initializationCommandReserve;if(total!==493500)fail('FREE_CAPACITY_ARITHMETIC_CHANGED');
 const flow=model.workflows?.newBuyerCompleteTextDemo;if(model.status!=='PASS_LOCAL_CAPACITY_MODEL_REQUIRES_ROLLOUT_REVIEW'||model.transferLimitBytes!==8000000000||flow?.reservation?.transferBytes!==2644169472||flow.maximumCompleteWorkloadsIfNothingElseRuns!==3||flow.holdAwareConservativeCompleteFlowCount!==1||preview.status!=='PASS_READ_ONLY_PREVIEW_BUDGET'||preview.transferReservedBytes!==7133724928||preview.pendingHeldOperations!==0||preview.redisWrites!==0)fail('CONSERVATIVE_TRANSFER_LIMITATIONS_REQUIRED');
 if(metadata.status!=='PASS_LOCAL_EXACT_CRON_HOST_METADATA_CORRECTION'||metadata.approvedPlanHash!==releasePlan||metadata.approvedReviewHash!==review||!same(metadata.sourcePins,source)||metadata.cronMetadataChecks!==19||metadata.publicReadbackFixtureChecks!==38||metadata.runtimeSourcesUntouched!==true)fail('EXACT_METADATA_ONLY_CORRECTION_REQUIRED');
 const reference=k=>({path:P[k],sha256:records[k].sha256,...(records[k].mediaType?{mediaType:records[k].mediaType}:{})});
 const evidence=Object.fromEntries(Object.keys(P).filter(k=>records[k]&&k!=='screenshot').map(k=>[k,reference(k)]));
 const screenshot=records.screenshot?reference('screenshot'):null;
 return {version:1,documentType:'actual-production-execution-evidence',status:'PASS_RESTRICTED_PRODUCTION_PUBLIC_DISCOVERY_PAID_ACCEPTANCE_PENDING',assembledAtUtc:assembledAt,assemblyIsLocalOnly:true,releasePlanHash:releasePlan,initializationPlanHash:initPlan,reviewHash:review,sourceDigests:source,
  confirmed:{productionReady:{bazaar:{id:deployments.bazaar,origin,sourceDigest:source.bazaar},provider:{id:deployments.provider,origin:'https://ai-video-scriptwriter.vercel.app',sourceDigest:source.provider}},nativeSeed:{initializedOnce:true,observedAt:n.observedAt,mutatedKeys:1,commandLedgerReset:false,pendingOperationsAtSeed:0,legacyWritersDrainedSeconds:a.actualDrainedSeconds},sellerSeed:{initializedOnce:true,observedAt:s.observedAt,scopedAccessPreserved:s.scopedAccessPreserved,primaryRedisTransferred:false,headroomReadyAtSeed:true},publicProtection:{observedAt:protection.observedAt,publicConditionGroups:22,temporaryMaintenanceRemoved:true,bothQuarantinesActive:true,originalSsoPreserved:true,canonicalAliasesMatchReadySources:true},publicDiscovery:{observedAt:pub.observedAt,checks:pub.checks.length,checkNames:pub.checks,requests:12,anonymousClient:true,bypassUsed:false,conservativeTransferBytes:pub.conservativeTransferBytes,conservativeCommands:pub.conservativeCommands,receivedBodyBytes:pub.receivedBodyBytes,service:{id:service,cardHash,amount:'0.01',network:'stellar:testnet',availabilityReadyAtObservation:pub.service.availabilityReady},qrDecoded:qr.results.map(v=>({kind:v.kind,destination:v.decodedDestination,sha256:v.sha256}))},schedule:{guardianConfigured:'0 * * * *',providerCron:[],authenticatedInvocationProven:false},metadataCorrection:{localNormalizerFixtures:19,localPublicReadbackFixtures:38,runtimeOrSourceReleaseChanged:false}},
  remaining:{newProductionBuyerOnboardingValidated:false,externalProviderPublicationValidated:false,sellerReadinessTodayValidated:false,realTestnetPurchaseValidated:false,paidTextDeliveryValidated:false,privateLinkAndHistoryAfterRealPaymentValidated:false,paidRecoveryValidated:false,independentTeamEgressValidated:false,generalPurchasesEnabled:false,generalOpeningAuthorized:false,newTransactionRequiresSeparateAuthorization:true,guardianAuthenticatedInvocationValidated:false},
  currentValidationEffects:{newAccounts:0,newOrders:0,newPayments:0,providerExecutions:0,providerTicks:0,readinessInvocations:0},
  capacity:{applicationCommands:360000,profiles:caps,priorUpperCommands:80000,sharedMarginCommands:50000,setupAllowanceCommands:3500,totalCommandEnvelope:total,freeCommandLimit:500000,commandEnvelopeHeadroom:500000-total,rollingWindowDays:31,logicalTransferCeilingBytes:8000000000,nativeStorageCeilingBytes:200000000,newBuyerCompleteDemoConservativeBytes:flow.reservation.transferBytes,completeDemosIfNoOtherTrafficTheoretical:3,holdAwareConservativeCount:1,previewIsolatedLogicalReservationBytes:preview.transferReservedBytes,previewIsNotPhysicalTransferOrCreditForProduction:true},
  limitations:['Public application requests originated from the operator computer without a protection bypass; an independent team has not validated access.','READY, seed headroom and configured cron are not proof of seller execution, payment, delivery, or a real guardian invocation.','Production purchases remain restricted to the acceptance account; a new Testnet purchase and general opening require their separate authorizations.','Capacity figures are conservative logical reservations, not physical transfer, an invoice, or guaranteed visitor throughput.','The theoretical 200 registrations/day and 50 deliveries/day are abuse ceilings; transfer reservations substantially reduce effective complete purchase capacity.','The 7.133 GB Preview reservation stays in its isolated ledger; it is not reset, moved to production, or treated as a provider quota reset.'],
  evidence,screenshot,compositionEffects:{networkRequests:0,redisCommands:0,cloudWrites:0,newPayments:0,sourceChanges:0,templateInputs:0}};
}

export function executionMarkdown(r){
 const link=k=>`[${k}](${r.evidence[k].path.split('/').pop()})`,c=r.confirmed;
 return `Bazaar y el proveedor de texto están publicados en producción con compras restringidas a la cuenta de aceptación. El acceso público al catálogo, buscador, ficha, QR y MCP pasó la comprobación anónima. La compra y entrega reales todavía están pendientes.

| Validación observada | Resultado |
| --- | --- |
| Producción | Bazaar \`${c.productionReady.bazaar.id}\`; proveedor \`${c.productionReady.provider.id}\`, ambos READY |
| Persistencia | Semillas realizadas una vez, sin reiniciar el presupuesto; drenaje anterior de ${c.nativeSeed.legacyWritersDrainedSeconds} segundos |
| Protección | ${c.publicProtection.publicConditionGroups} grupos públicos, SSO conservado, mantenimiento temporal retirado y hosts antiguos en cuarentena |
| Descubrimiento | ${c.publicDiscovery.checks} comprobaciones, ${c.publicDiscovery.requests} solicitudes anónimas, cero cuentas, órdenes, pagos o ejecuciones |
| QR | General → ${origin}/demo; servicio → ${origin}/resources/${service}; ambos decodificados localmente |
| Programación | Guardián cada hora; proveedor sin cron. Invocación real del guardián aún no demostrada |

Conecta el agente a [MCP](${origin}/api/mcp) y consulta [el servicio](${origin}/resources/${service}). El precio revisado es **0,01 USDC de Stellar Testnet**. Abrir el QR o el enlace no autoriza una compra.

Fuentes congeladas: Bazaar \`${source.bazaar}\`; proveedor \`${source.provider}\`. La corrección del host en metadatos del cron pasó 19 fixtures y 38 comprobaciones locales; no cambió las fuentes del producto.

Upstash continúa en Free. El presupuesto preparado suma **493.500 de 500.000 comandos**: 360.000 para la aplicación, 80.000 previos, 50.000 de margen compartido y 3.500 de inicialización. La transferencia lógica está limitada a 8 GB: un comprador nuevo con demo completa reserva aproximadamente **2,644 GB**, máximo teórico de **3 recorridos por 31 días** si no hay otro tráfico, o **1** con reservas pendientes. No representa consumo físico ni capacidad garantizada. Preview conserva sus 7,133 GB de reservas aisladas.

Falta comprobar disponibilidad alojada actual, una compra nueva autorizada, entrega, enlace privado, historial y recuperación. También falta una prueba desde un equipo independiente: las solicitudes públicas observadas procedieron de esta máquina, sin bypass. Las compras generales siguen cerradas.

Evidencias: ${link('bazaar')}, ${link('provider')}, ${link('native')}, ${link('seller')}, ${link('protection')}, ${link('public')}, ${link('qrDecoded')}. Los hashes completos están en el [registro JSON](${P.json.split('/').pop()}).
${r.screenshot?`\n![Ficha de servicio observada](./${r.screenshot.path.split('/').pop()})\n`:''}`;
}

async function bounded(root,path){const target=resolve(root,path),r=relative(root,target);if(!r||r==='..'||r.startsWith('..'+sep))fail('FIXED_OWN_EVIDENCE_PATH_REQUIRED');const info=await lstat(target);if(!info.isFile()||info.isSymbolicLink()||info.size>4000000)fail('PLAIN_BOUNDED_EVIDENCE_REQUIRED');return readFile(target);}
async function saveExclusive(root,path,bytes){const f=await open(resolve(root,path),'wx',0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}}
export async function composeLocalFinalExecution(root=process.cwd()){
 const keys=Object.keys(P).filter(k=>!['json','markdown','screenshot','viewportScreenshot'].includes(k)),records={};
 await Promise.all(keys.map(async k=>{const bytes=await bounded(root,P[k]);records[k]={sha256:sha(bytes),document:k.endsWith('Svg')?null:JSON.parse(bytes)};}));
 for(const key of ['screenshot','viewportScreenshot'])try{const image=await bounded(root,P[key]);if(!image.subarray(0,3).equals(Buffer.from([255,216,255]))||!image.subarray(-2).equals(Buffer.from([255,217])))fail('REAL_JPEG_SCREENSHOT_REQUIRED');records[key]={sha256:sha(image),document:null,mediaType:'image/jpeg'};}catch(e){if(e.code!=='ENOENT')throw e;}
 const existing=await Promise.all([P.json,P.markdown].map(async path=>{try{return await bounded(root,path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}));
 const assembled=existing[0]?JSON.parse(existing[0]).assembledAtUtc:new Date().toISOString(),report=composeFinalExecution(records,assembled),json=JSON.stringify(report,null,2)+'\n',markdown=executionMarkdown(report);
 if(existing.some(Boolean)){if(!existing.every(Boolean)||!existing[0].equals(Buffer.from(json))||!existing[1].equals(Buffer.from(markdown)))fail('EXISTING_FINAL_EVIDENCE_REQUIRES_EXACT_SAME_INPUTS');return {status:'EXISTING_IDENTICAL_FINAL_EVIDENCE_PRESERVED',json:P.json,markdown:P.markdown,sha256:sha(json),networkRequests:0,cloudWrites:0};}
 await saveExclusive(root,P.json,json);await saveExclusive(root,P.markdown,markdown);return {status:report.status,json:P.json,markdown:P.markdown,sha256:sha(json),markdownSha256:sha(markdown),networkRequests:0,cloudWrites:0,newPayments:0};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)try{const [action='check',...args]=process.argv.slice(2);if(args.length||!['check','compose'].includes(action))fail('EXACT_LOCAL_COMPOSER_ARGUMENTS_REQUIRED');console.log(JSON.stringify(action==='check'?finalExecutionPlan():await composeLocalFinalExecution()));}catch(e){console.error(JSON.stringify({status:'UNCONFIRMED_FINAL_COMPOSITION',code:/^[A-Z0-9_]{3,100}$/.test(e.message??'')?e.message:'LOCAL_FINAL_COMPOSITION_UNCONFIRMED',networkRequests:0,cloudWrites:0,newPayments:0}));process.exitCode=1;}
