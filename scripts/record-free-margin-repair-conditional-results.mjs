// Append-only observed outcome of the user's conditional 9.25 GB authorization.
import {readFile,open,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=v=>createHash('sha256').update(v).digest('hex');
const paths={predeploy:'docs/evidence/free-margin-repair-production-budget-predeploy-2026-10-12.json',promotion:'docs/evidence/free-margin-repair-production-budget-promotion-2026-10-12.json',staged:'docs/evidence/free-margin-repair-production-staged-2026-10-12.json',supported:'docs/evidence/free-margin-repair-private-supported-observation-2026-10-12.json',restored:'docs/evidence/free-margin-repair-production-abort-waf-restored-2026-10-12.json',marketIndex:'docs/evidence/free-margin-repair-guardian-index-read-2026-10-12.json',alternatives:'docs/evidence/free-margin-repair-blocked-next-options-local-2026-10-12.json'};
const r={},evidence=[];for(const [kind,path]of Object.entries(paths)){const b=await readFile(path);r[kind]=JSON.parse(b);evidence.push({kind,path,sha256:sha(b),status:r[kind].status});}
try{await lstat('.vercel/free-margin-repair-production-promote-intent.json');throw Error('UNEXPECTED_PROMOTION_INTENT');}catch(e){if(e.code!=='ENOENT')throw e;}
const journalPath='.vercel/on-demand-production-purchase-31c97193-be74-4b9d-b0a3-f3890b0a41e8.journal.dpapi';
const journalUnchanged=sha(await readFile(journalPath))==='97efd58199da7499b40f0b0b889ddbd7844f91fab0fedb8351e9b9881c530cfb';
if(!journalUnchanged||r.predeploy.status!=='PASS_READ_ONLY_FREE_MARGIN_REPAIR_PRODUCTION_BUDGET'||r.promotion.status!=='BLOCKED_READ_ONLY_FREE_MARGIN_REPAIR_PRODUCTION_BUDGET'||r.promotion.projectedMarginBytes!==-20460416||r.promotion.originalHoldConservationProven!==true||r.restored.status!=='PASS_EXACT_CONDITIONAL_PUBLICATION_ABORT_WAF_RESTORED'||r.restored.activeProtectionsHash!=='b80bf3ca1bd90fbba00d4bcda9c76478d6664cb7ec9acbf76f219289fb4ac69c'||r.restored.canonicalDeploymentId!=='dpl_2kx2wwhZHpXSXeDQc96qCc83H3tY'||r.restored.unpromotedHostnameBlocked!==true||r.supported.status!=='PASS_PRIVATE_FREE_MARGIN_REPAIR_SUPPORTED_CHECK')throw Error('EXACT_CONDITIONAL_ABORT_OUTCOME_REQUIRED');
const deltaBytes=r.promotion.budget.committedTransferBytes-r.predeploy.budget.committedTransferBytes,deltaCommands=r.promotion.budget.totalCommittedCommands-r.predeploy.budget.totalCommittedCommands;
if(deltaBytes!==64040960||deltaCommands!==1120||r.predeploy.budget.reservedTransferBytes!==1421972480||r.promotion.budget.reservedTransferBytes!==1421972480)throw Error('PRESERVED_HOLD_AND_OBSERVED_CONSUMPTION_REQUIRED');
const receipt={version:1,status:'VALIDATED_CONDITIONAL_PUBLICATION_NOT_PROMOTED_INITIAL_PROTECTIONS_RESTORED',sourceCandidate:r.staged.sourceDigest,unpromotedDeploymentId:r.staged.deploymentId,canonicalDeploymentId:r.restored.canonicalDeploymentId,canonicalSourceDigest:r.promotion.sourceDigest,currentTransferCapBytes:8500000000,proposed925AppliedToCanonical:false,upstashPlan:'Free',quotaWindowReset:false,consumptionReset:false,originalReservationBytes:1421972480,originalReservationsPreserved:true,recordedMaintenanceBytes:deltaBytes,recordedMaintenanceCommands:deltaCommands,projectedDeficitAt925Bytes:20460416,restoreProtectionsHash:r.restored.activeProtectionsHash,newPrivateHostBlocked:true,providerDeploymentId:r.restored.providerDeploymentId,providerChanged:false,existingHourlyGuardianUnchanged:true,generalPurchasesEnabled:false,projectEnvironmentWrites:0,newKeys:0,plansContracted:0,uploads:1,promotions:0,newOrders:0,newPayments:0,signatures:0,providerExecutions:0,originalFinancialJournalUnchanged:true,privateProtocolCheckPassed:true,facilitatorCredentialValidated:false,paidFlowValidated:false,observedMarketIndex:{initialized:r.marketIndex.indexInitialized,reconciliationDue:r.marketIndex.reconciliationDue,deliveryDue:r.marketIndex.deliveryDue,operatorAttention:r.marketIndex.operatorAttention,marketIdleAtObservation:r.marketIndex.marketIdleAtObservation,fullGuardianIdleProven:false,paymentOutcomeProven:false},alternative950:{proposedOnly:true,authorized:false,applied:false,remainingAfterApprovedFiniteCaseBytes:229539584,remainingAfterOneAdditionalFullGuardianBytes:165498624,physicalHeadroomBytes:500000000,newCandidateReviewAndFreshCapacityRequired:true},evidence,recordedAt:new Date().toISOString()};
const doc=`# Resultado de la autorización condicionada de 9,25 GB

**No se promovió el candidato. El dominio público conserva 8,5 GB, Upstash Free y las compras restringidas.** La condición de margen suficiente dejó de cumplirse antes de la promoción. Se restauró el firewall original y se bloqueó el host de la versión privada nueva.

## Lo que pasó y se comprobó

| Lectura | Fecha UTC | Contabilizado, incluidas reservas | Margen proyectado a 9,25 GB |
|---|---|---:|---:|
| Antes de subir | ${r.predeploy.observedAt} | 7.363.282.432 bytes | +43.580.544 bytes |
| Antes de promover | ${r.promotion.observedAt} | 7.427.323.392 bytes | **−20.460.416 bytes** |

Durante la preparación se contabilizaron **64.040.960 bytes y 1.120 comandos adicionales de mantenimiento**, coincidentes con una pasada completa del guardián. Son cargos conservadores del presupuesto interno; no una factura de 64 MB de transferencia medida. Ninguno se descontó o borró. La reserva original sigue en **1.421.972.480 bytes**, con los mismos 9.984 comandos de recuperación y 4.000 de trabajo en segundo plano.

Con la última lectura, el techo de 9,25 GB dejaría 1.822.676.608 bytes frente a los 1.843.137.024 necesarios para el recorrido aprobado. El control guardó el bloqueo y no se ejecutó promoción, firma, nueva orden, pago ni trabajo del proveedor. El pago original 31c97193 sigue incierto y conserva su reserva; este bloqueo no demuestra que esté impagado y no se vuelve a pagar.

El candidato **a8bb78b6**, despliegue privado **${r.staged.deploymentId}**, pasó la compilación remota y la lectura protegida del facilitador devolvió HTTP 200 / Stellar Testnet. Esa lectura anuncia el protocolo; **no prueba la credencial de pago ni acepta una compra o entrega**. El host privado permanece bloqueado después de cerrar la preparación.

La restauración se confirmó a las **${r.restored.observedAt}** mediante lectura de la configuración activa, dominio, proyectos y referencias de secretos. El hash de las protecciones vuelve exactamente a **b80bf3ca1bd90fbba00d4bcda9c76478d6664cb7ec9acbf76f219289fb4ac69c**: 22 grupos públicos, referencias al host vigente y tres hosts permitidos en el perímetro. El proveedor y el guardián horario conservan sus versiones y definición; no se pausaron proyectos ni contrataron planes.

## Pruebas y alcance

- Fuente congelada: un archivo modificado, 343 idénticos; compilación local, TypeScript y compilación alojada correctos.
- Controles locales de publicación (146), cuota (122), reglas (1.652 + 63), cliente de lectura con SDK real (65), restauración (77) e índice (38): PASS. Son validaciones locales; la promoción bloqueada es evidencia real del despliegue.
- Dos lecturas reales de presupuesto con dos GET cada una, sin EVAL, SCAN, TTL o escrituras. Se conservaron todos los contadores y reservas.
- Un GET real del índice del mercado: inicializado, sin reconciliación, entrega o caducidad pendiente, con atención del operador. Eso no demuestra reposo de todo el guardián ni el resultado del pago original. No se ejecutó un tick manual.
- El archivo cifrado del pago original conserva exactamente su hash. No se consultó el estado completo de órdenes ni se adoptó una transacción.

## Alternativas calculadas, sin aplicar

El mínimo aritmético para el mismo caso intacto sería **9.270.460.416 bytes**, que no incluye tráfico adicional. Reutilizar una lectura de capacidades ahorraría 33.816.576 bytes, pero dejaría sólo 13.356.160 bytes y no cubriría otra pasada completa del guardián.

Una propuesta de **9,5 GB internos** dejaría **229.539.584 bytes** después del caso aprobado, o **165.498.624 bytes** después de otra pasada completa. Mantendría 500 MB fuera del presupuesto interno respecto de los 10 GB físicos de Free. **No está autorizada, implementada en este candidato ni aplicada.** Necesita un candidato y revisión nuevos, más una lectura fresca. Tampoco garantiza capacidad frente a tráfico arbitrario ni permite abrir compras generales.

[Bloqueo real](../evidence/free-margin-repair-production-budget-promotion-2026-10-12.json). [Restauración real](../evidence/free-margin-repair-production-abort-waf-restored-2026-10-12.json). [Índice leído](../evidence/free-margin-repair-guardian-index-read-2026-10-12.json). [Alternativas locales](../evidence/free-margin-repair-blocked-next-options-local-2026-10-12.json).
`;
async function save(path,v){const f=await open(path,'wx',0o600);try{await f.writeFile(typeof v==='string'?v:JSON.stringify(v,null,2)+'\n');}finally{await f.close();}}
await save('docs/evidence/free-margin-repair-conditional-application-results-2026-10-12.json',receipt);
await save('docs/release/free-margin-repair-conditional-application-results-2026-10-12.md',doc);
console.log(JSON.stringify({status:receipt.status,currentTransferCapBytes:receipt.currentTransferCapBytes,projectedDeficitAt925Bytes:20460416,originalReservationsPreserved:true,promotions:0,newOrders:0,newPayments:0,firewallRestored:true,report:'docs/release/free-margin-repair-conditional-application-results-2026-10-12.md'}));
