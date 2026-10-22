// Local evidence aggregation only; no credentials, network or release action.
import {readFile,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=v=>createHash('sha256').update(v).digest('hex');
const source='3c3fe5ad3dc886e770c5aec1e1cee2762686558036c3bf55ec310899a35173ed';
const deployment='dpl_2kx2wwhZHpXSXeDQc96qCc83H3tY';
const paths={approval:'docs/evidence/payment-recovery-acceptance-user-publication-approval-2026-10-12.json',ready:'docs/evidence/payment-recovery-acceptance-production-deployment-2026-10-12.json',privateSupported:'docs/evidence/payment-recovery-acceptance-private-supported-observation-2026-10-12.json',publicWaf:'docs/evidence/payment-recovery-acceptance-production-public-waf-2026-10-12.json',drain:'docs/evidence/payment-recovery-acceptance-old-writer-drain-complete-2026-10-12.json',client:'docs/evidence/payment-recovery-acceptance-postpromotion-acceptance-2026-10-12.json',qr:'docs/evidence/payment-recovery-acceptance-postpromotion-qr-decoded-2026-10-12.json',browser:'docs/evidence/payment-recovery-acceptance-public-catalog-browser-2026-10-12.json',budget:'docs/evidence/payment-recovery-acceptance-postpublication-budget-read-2026-10-12.json',physicalQuota:'docs/evidence/payment-recovery-acceptance-upstash-free-ui-2026-10-12.json'};
const records={},evidence=[];
for(const[k,path]of Object.entries(paths)){const raw=await readFile(path);records[k]=JSON.parse(raw);evidence.push({kind:k,path,sha256:sha(raw),status:records[k].status});}
if(records.ready.sourceDigest!==source||records.ready.deploymentId!==deployment||records.ready.canonicalAssigned!==true||records.ready.generalPurchasesEnabled!==false||records.privateSupported.status!=='PASS_PRIVATE_RECOVERY_ACCEPTANCE_SUPPORTED_CHECK'||records.privateSupported.requests!==1||records.privateSupported.credentialValidated!==false||records.publicWaf.status!=='PASS_PAYMENT_RECOVERY_ACCEPTANCE_CANONICAL_PUBLIC_WAF'||records.publicWaf.deploymentId!==deployment||records.drain.oldWriterDrainComplete!==true||records.client.status!=='PASS_NONFINANCIAL_RECOVERY_ACCEPTANCE_MEMBERSHIP_QR_DECODE_PENDING'||records.client.requests!==7||records.client.runtimeMembershipProven!==true||records.client.originalFinancialJournalUnchanged!==true||records.qr.status!=='PASS_LOCAL_RECOVERY_ACCEPTANCE_PUBLICATION_QR_DECODE'||records.qr.checks!==2||records.budget.sourceDigest!==source||records.budget.deploymentId!==deployment||records.budget.budget.originalOperationHoldPresent!==true||records.budget.budget.transferLimitBytes!==8500000000)throw Error('EXACT_REAL_PUBLICATION_EVIDENCE_REQUIRED');
const report='docs/release/payment-recovery-acceptance-publication-results-2026-10-12.md';
const summary={version:1,status:'PASS_RESTRICTED_PUBLICATION_NONFINANCIAL_ACCEPTANCE_FINANCIAL_CAPACITY_BLOCKED',compiledAt:new Date().toISOString(),sourceDigest:source,sourceManifestSha256:records.ready.sourceManifestSha256,deploymentId:deployment,canonicalOrigin:'https://bazaar.browns.studio',productionPublished:true,conditionalPrivateCheckPassed:true,controlledCanonicalRequests:7,controlledCanonicalChecks:records.client.checks.length,qrDecoded:true,qrDestinationChecks:2,runtimeMembershipProven:true,generalPurchasesEnabled:false,upstashPlan:'Free',providerUnchanged:true,guardianDefinition:records.ready.guardianDefinition,guardianDefinitionUnchanged:true,oldWriterDrainComplete:true,originalFinancialJournalUnchanged:true,originalPaymentStillUncertain:true,paidFlowValidated:false,deliveryValidated:false,privateHistoryValidatedThisPublication:false,financialAcceptanceBlocked:true,capacity:{observedAt:records.budget.observedAt,currentTransferLimitBytes:8500000000,accountedTransferBytes:records.budget.budget.accountedTransferBytes,remainingTransferBytes:records.budget.budget.remainingTransferBytes,estimatedRemainingFinancialRouteBytes:records.budget.futureFinancialEstimate.estimatedRemainingFinancialRouteBytes,estimatedShortfallBytes:records.budget.futureFinancialEstimate.estimatedShortfallBytes,estimateIsFiniteNotAdmission:true,physicalQuotaObservationBeforePublication:true,physicalBytesAreNotConservativeCharges:true},newAccounts:0,newOrders:0,newPayments:0,signatures:0,settlements:0,providerExecutions:0,newKeys:0,projectEnvironmentWrites:0,quotaResets:0,plansContracted:0,evidence,report};
const md=`# Bazaar publicado: validación restringida y bloqueo financiero pendiente

Publicado el candidato **3c3fe5ad** en [Bazaar](https://bazaar.browns.studio). El paquete autorizado está aplicado y sus pruebas de acceso pasaron. **Todavía no está aceptado el recorrido pago → entrega → historial. Las compras generales siguen cerradas.**

Fuente completa: \`${source}\`; manifiesto \`${records.ready.sourceManifestSha256}\`; versión \`${deployment}\`. Se creó una sola versión privada y se envió una sola promoción, tras comprobar los controles privados. La respuesta local de promoción fue incierta; la asignación efectiva se confirmó por lecturas de alias, target de producción y cron, sin repetirla.

## Validación alojada

| Comprobación | Resultado |
|---|---|
| Configuración, alias, referencias sensibles y proveedor | PASS; proveedor conservado |
| Consulta privada protegida a /supported | HTTP 200, Stellar Testnet anunciado; no prueba autenticación de pagos |
| Firewall | Tres fases aplicadas; 22 grupos públicos conservados; versiones antiguas bloqueadas |
| MCP externo desde el dominio canónico | initialize y tools/list correctos; 35 herramientas actuales |
| Dos cuentas existentes | La cuenta de aceptación anuncia compras habilitadas; la otra anuncia admisión restringida |
| Configuración efectiva | 8,5 GB, ventana continua de 31 días, Testnet, vendedor bajo demanda, altas y presentación de servicios habilitadas, archivos privados apagados |
| Catálogo y buscador | Ficha activa y revisada de Guion breve algorítmico, 0,01 USDC Testnet |
| QR general y del servicio | Ambos capturados del dominio y decodificados independientemente: /demo y /resources/guionista-bazaar-production-text-v1 |
| Navegador | Catálogo actualizado accesible; muestra compras pausadas para el público |
| Solicitudes del despliegue anterior | 80 segundos requeridos según límites reales; 186 segundos transcurridos al emitir el comprobante |

El cliente de comprobación hizo **7 solicitudes y 22 controles**, sin crear órdenes ni despertar al proveedor. La visita adicional del navegador se registra por separado. Las lecturas autenticadas pueden escribir contadores e historial de consultas ordinario; no modificaron el estado financiero. La cuota conservadora de esas siete solicitudes es 374.865.920 bytes, no 130 MB; la evidencia de corrección conserva los antecedentes. Las pruebas locales y sus dobles Redis no se presentan como una transacción alojada.

## Capacidad después de comprobar la publicación

La lectura real de las ${records.budget.observedAt} conserva el consumo y el hold original. De 8.500.000.000 bytes internos hay **${records.budget.budget.accountedTransferBytes.toLocaleString('en-US')} contabilizados** y **${records.budget.budget.remainingTransferBytes.toLocaleString('en-US')} disponibles**. La estimación finita del recorrido financiero pendiente requiere **${records.budget.futureFinancialEstimate.estimatedRemainingFinancialRouteBytes.toLocaleString('en-US')} bytes**: faltan **${records.budget.futureFinancialEstimate.estimatedShortfallBytes.toLocaleString('en-US')} bytes** bajo esta proyección. No se admitió otra orden, redujo una reserva ni reinició una ventana.

Estas son reservas y cargos conservadores del control de capacidad, **no transferencia física facturada**. La observación anterior a la publicación mostraba Upstash Free, 36.949 comandos, 64 MB físicos, 227 KB y US$0.00. No se contrató un plan ni cambió el presupuesto de Vercel. Esa observación física no es una medición nueva posterior ni elimina el bloqueo lógico.

## Lo que sigue pendiente

1. Resolver el margen conservador del recorrido pendiente con una propuesta comprobada, preservando los consumos y el hold original. No aumentar el techo aprobado de 8,5 GB sin revisión y autorización nuevas.
2. Obtener autorización separada para una compra nueva de 0,01 USDC Testnet, GD45…UWMU → GAHV…DJ2C, máximo patrocinado de 0,1 XLM. Sólo después de confirmar margen y disponibilidad real se podrá crear y firmar esa orden.
3. Comprobar transacción, una ejecución, texto, integridad, enlace privado, historial y recuperación. La publicación no valida ninguno de esos resultados financieros.
4. Revisar la capacidad y configuración para compradores generales antes de abrirlas. Quitar la allowlist actual falla cerrado: la excepción de 8,5 GB y la plaza adicional están limitadas a una cuenta.

El pedido **31c97193-be74-4b9d-b0a3-f3890b0a41e8** permanece incierto, con su diario cifrado sin cambios. No se reenvió su firmado, liquidó, adoptó un hash, liberó su reserva ni ejecutó al proveedor. Recuperarlo requiere una prueba positiva; ausencia de una transacción en el escaneo anterior no prueba impago.

[Comprobante completo](../evidence/payment-recovery-acceptance-publication-results-2026-10-12.json). [Cliente alojado](../evidence/payment-recovery-acceptance-postpromotion-acceptance-2026-10-12.json). [QR decodificados](../evidence/payment-recovery-acceptance-postpromotion-qr-decoded-2026-10-12.json). [Saldo posterior](../evidence/payment-recovery-acceptance-postpublication-budget-read-2026-10-12.json).
`;
async function save(path,value){const h=await open(path,'wx',0o600);try{await h.writeFile(value);await h.sync();}finally{await h.close();}}
await save(report,md);await save('docs/evidence/payment-recovery-acceptance-publication-results-2026-10-12.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({status:summary.status,report,productionPublished:true,newPayments:0,financialAcceptanceBlocked:true,estimatedShortfallBytes:summary.capacity.estimatedShortfallBytes}));
