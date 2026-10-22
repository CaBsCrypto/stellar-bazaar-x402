// Local-only review; no publication, configuration write, signing or payment.
import {readFile,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=v=>createHash('sha256').update(v).digest('hex');
const paths={source:'docs/evidence/free-margin-repair-bazaar-source-2026-10-12.json',build:'docs/evidence/free-margin-repair-bazaar-build-2026-10-12.json',config:'docs/evidence/free-margin-repair-configuration-local-2026-10-12.json',native:'docs/evidence/free-margin-repair-native-migration-local-2026-10-12.json',cold:'docs/evidence/provider59-cold-callback-and-response-bound-local-2026-10-12.json',fallback:'docs/evidence/provider59-finite-global-fallback-local-2026-10-12.json',projection:'docs/evidence/payment-recovery-925-cold-financial-projection-local-2026-10-12.json',fresh:'docs/evidence/free-margin-repair-fresh-budget-read-2026-10-12.json',physical:'docs/evidence/free-margin-repair-upstash-free-ui-2026-10-12.json'};
const r={},evidence=[];for(const[k,path]of Object.entries(paths)){const b=await readFile(path);r[k]=JSON.parse(b);evidence.push({kind:k,path,sha256:sha(b),status:r[k].status});}
const source='a8bb78b65a796d253b29008f364210353d40def48427c6da7d3afbd0fb85adf4',manifestSha='f5ff37632d61f6d97c6399c3f172f6c426af3855797f83f241731315ae6878ad';
if(r.source.sourceDigest!==source||r.source.fileCount!==344||JSON.stringify(r.source.changedPaths)!=='["lib/continuous-free-budget.ts"]'||evidence.find(v=>v.kind==='source').sha256!==manifestSha||r.build.sourceDigest!==source||r.build.exitCode!==0||r.config.sourceDigest!==source||r.config.checks!==441||r.native.sourceDigest!==source||r.native.assertionsPassed!==40||r.fresh.sourceDigest!=='3c3fe5ad3dc886e770c5aec1e1cee2762686558036c3bf55ec310899a35173ed'||r.fresh.budget.transferLimitBytes!==8500000000||r.fresh.budget.originalOperationHoldPresent!==true||r.fresh.proposedRepairProjection.robustFiniteRouteBytes!==1843137024||r.fresh.proposedRepairProjection.proposedMarginBytes<0||r.physical.plan!=='Free'||r.physical.physicalTransferLimitBytes!==10000000000||r.fallback.marginAfterPeakBytes!==43580544||evidence.some(v=>v.kind!=='source'&&!v.status.startsWith('PASS_')))throw Error('EXACT_SUCCESSFUL_MARGIN_REVIEW_EVIDENCE_REQUIRED');
const proposal={version:1,status:'PREPARED_FOR_USER_REVIEW_NOT_APPLIED',sourceDigest:source,sourceManifest:paths.source,sourceManifestSha256:manifestSha,sourceDirectory:r.source.sourceDirectory,baseSourceDigest:r.source.parentSourceDigest,fileCount:344,changedPaths:r.source.changedPaths,build:paths.build,buildSha256:evidence.find(v=>v.kind==='build').sha256,currentDeploymentId:'dpl_2kx2wwhZHpXSXeDQc96qCc83H3tY',currentSourceDigest:r.source.parentSourceDigest,currentWafProtectionsHash:'b80bf3ca1bd90fbba00d4bcda9c76478d6664cb7ec9acbf76f219289fb4ac69c',currentTransferCapBytes:8500000000,proposedTransferCapBytes:9250000000,proposedImmutableOverride:{BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES:'9250000000'},defaultTransferCapBytes:8000000000,preserveExisting8Point5Configuration:true,upstashPlan:'Free',physicalQuotaBytes:10000000000,unassignedPhysicalHeadroomBytes:750000000,commandBudgetBytesIndependent:true,productionCommandLimit:360000,conservativeSharedCommandMaximum:490000,physicalCommandLimit:500000,configurationId:r.fresh.budget.configurationId,rollingWindowDays:31,storageLimitBytes:200000000,retentionDays:7,scopedNewTextHoldBytes:900000000,originalReservedBytes:r.fresh.budget.reservedTransferBytes,originalHeldOperations:r.fresh.budget.heldOperationCount,oldHoldChanged:false,consumptionReset:false,quotaWindowReset:false,scope:'existing one-account acceptance cohort and reviewed text service',generalPurchasesEnabled:false,newFinancialAuthorizationRequired:true,providerDeploymentId:'dpl_59zNf8MCvktnzTgci3eppUriS2Un',providerSourceDigest:'9f5b26c7a8ccfbf39c2420f99a938228677927bd1f51ddb825d5bf1c048ae232',providerChanged:false,guardianDefinition:[{path:'/api/market/guardian/tick',schedule:'0 * * * *'}],guardianChanged:false,fileDeliveryEnabled:false,existingSecretReferencesPreserved:true,projectEnvironmentWrites:0,newKeys:0,plansContracted:0,newOrders:0,newPayments:0,signatures:0,providerExecutions:0,limitsApplied:false,productionPublished:false,freshCapacity:{at:r.fresh.observedAt,accountedBytes:r.fresh.budget.accountedTransferBytes,remainingAtCurrentCap:r.fresh.budget.remainingTransferBytes,remainingAtProposedCap:r.fresh.proposedRepairProjection.proposedCapBytes-r.fresh.budget.accountedTransferBytes,finiteRouteBytes:1843137024,minimumRequiredCapBytes:r.fresh.proposedRepairProjection.minimumRequiredCapBytes,proposedMarginBytes:r.fresh.proposedRepairProjection.proposedMarginBytes},finiteScenario:{threeFreshBuyerReads:true,coldInitialReadiness:true,coldCallbacksMaximum:3,lostClaimClosingCapacityReport:true,extraFinancialReconciliationMaximum:1,maximumWholeGlobalFallbackBytes:100925440,fullGuardianPassesMaximum:1,newPostpromotionAuthenticatedCapabilitiesReads:1,humanOrderHistoryReads:1,additionalPrivateBrowserActionsNotIncluded:true,extraPublicVisitsNotIncluded:true,unlimitedRetriesGuaranteed:false},futureApplicationGate:{freshPhysicalAndLedgerReadRequired:true,minimumFreshRemainingBytes:1843137024,authoritativeCurrentDeploymentEnvironmentAndFirewallRequired:true,newPublicationReviewAndApprovalRequired:true,newStagingProofRequired:true,noPaidTestIncluded:true,existingQrCatalogAndToolContractByteEvidenceReused:true,minimalPostpromotionConfigurationReadOnly:true,oldWriterDrainRequired:true},evidence,preparedAt:new Date().toISOString()};
const doc=`# Revisión: resolver el margen interno sin borrar consumo ni reservas

**Solución preparada, compilada y probada localmente. No aplicada.** Candidato **a8bb78b6**, fuente \`${source}\`, 344 archivos. Sólo cambia \`lib/continuous-free-budget.ts\`: añade la opción explícita de **9,25 GB internos**, conservando 8,5 GB y el valor normal de 8 GB. La aplicación real sigue en **3c3fe5ad / 8,5 GB**.

## Por qué la propuesta cambia el techo

El déficit anterior de unos 330 MB correspondía a un recorrido finito con dos callbacks calientes. La revisión encontró dos costes que ese caso no cubría: los callbacks pueden volver a estar fríos tras reiniciar, y un claim con respuesta perdida envía un informe adicional de cierre de capacidad. No se presupone caché vigente ni se elimina la consulta nueva de la ficha, ni se reutiliza un pago.

Incluso quitando consultas repetidas, el mínimo en frío necesita 33.816.576 de ficha + 50.593.792 de creación + 206.172.416 de disponibilidad + el hold intacto de 900.000.000: **1.190.582.784 bytes**. Supera los 1.136.717.568 disponibles con 8,5 GB, antes de entregar. Reducir sólo el hold o el presupuesto de 100 MB del trabajador carece de justificación: el proveedor comprueba el tamaño Redis después de consumir la respuesta. Esta propuesta mantiene esos valores.

El techo nuevo sería **global para el prefijo de Bazaar**, condicionado a la configuración de compras de una sola cuenta y el servicio de texto revisado. No es una cuota de 9,25 GB por usuario ni habilita compradores generales. No es una contratación ni un cambio de cuota física. [Upstash Free](https://upstash.com/pricing/redis) mantiene US$0, 10 GB físicos y 500.000 comandos mensuales; la lectura del panel muestra Free, 37.181 comandos, 64 MB redondeados, 228 KB y US$0.00.

## Cuenta completa, con recuperación

| Componente futuro | Bytes conservadores |
|---|---:|
| Tres lecturas nuevas de identidad, capacidades y ficha del comprador | 101.449.728 |
| Crear el pedido | 50.593.792 |
| Disponibilidad inicial fría, incluido trabajador | 206.172.416 |
| Reserva nueva íntegra | 900.000.000 |
| Tres callbacks fríos, incluido uno por claim perdido | 318.504.960 |
| Informe de cierre de capacidad tras ese claim | 33.816.576 |
| Una petición financiera completa desde margen global si no cabe en el hold | 100.925.440 |
| Una pasada completa del guardián | 64.040.960 |
| Una comprobación MCP de configuración después de publicar | 33.816.576 |
| Una lectura humana de lista de órdenes/historial | 33.816.576 |
| **Pico futuro robusto y finito** | **1.843.137.024** |

Se cuentan los 900 MB una sola vez. Los pagos, controles y wakes debitados de ese hold no se vuelven a sumar fuera. Con una conciliación y el claim perdido, los débitos protegidos suman 907.137.792: el Lua actual permite un cargo completo desde el saldo global cuando no cabe en el remanente del hold, conservando la reserva parcial. Se incluye conservadoramente el mayor cargo posible, 100.925.440; no sólo la diferencia de 7.137.792. El código Lua permanece byte por byte idéntico.

La lectura real a las **${r.fresh.observedAt}** conserva **7.363.282.432 bytes contabilizados**, incluidos **1.421.972.480 reservados** por el pedido original. El estado y sus perfiles no cambiaron respecto de la lectura previa.

| Resultado | Bytes |
|---|---:|
| Saldo con el límite vigente de 8,5 GB | 1.136.717.568 |
| Saldo si se aprobara 9,25 GB | 1.886.717.568 |
| Mínimo total que requiere esta proyección | 9.206.419.456 |
| **Margen posterior proyectado** | **43.580.544** |
| Separación entre el techo propuesto y los 10 GB físicos | 750.000.000 |

El margen de 178 MB calculado antes de incluir cierre de capacidad y fallback global era intermedio; **43,6 MB es el margen final**. Son reservas conservadoras, no bytes facturados. Otras visitas públicas, solicitudes o más fallos pueden consumirlo: se debe releer cuota física y ledger antes de aplicar y antes de admitir. Si el saldo futuro cae por debajo de 1.843.137.024, esta propuesta no demuestra capacidad suficiente y deberá detenerse esta aceptación. Ese umbral es un control operacional previo de la revisión; este candidato no añade una guarda runtime que reserve todo el recorrido. El CAS nativo conserva la reserva de 900 MB y comprueba el saldo real en cada débito. Una visita pública genérica presupuestada en 140.771.328 bytes supera el margen y puede impedir un cargo posterior desde el saldo global. Por eso esta proyección no garantiza entrega frente a tráfico arbitrario ni justifica abrir compras generales.

## Pruebas terminadas

- **Build real y TypeScript: PASS**, 30 páginas. Copia congelada, dependencias fijadas, entorno de compilación sintético sin secretos.
- **441 comprobaciones de configuración y paridad: PASS.** Sólo un archivo cambia; 343 conservan exactamente sus hashes. Límite anterior y default, perfiles, ventana de 31 días, claves, identificador del ledger, reservas y scripts Lua siguen iguales. Importes arbitrarios, Preview, configuración incompleta y más de un comprador fallan cerrados.
- **40 regresiones de stores nativos: PASS.** Misma contabilidad admite con el techo propuesto, sin reinicio o descuento; reserva de 900 MB; original intacto; tercera orden denegada; una admisión con concurrencia; respuesta perdida recuperada sin otra reserva; revocación concurrente sin escrituras parciales. Root las repitió.
- **37 pruebas del SDK del proveedor y 242 del protocolo: PASS.** Caso frío, cierre tras claim perdido, mismo intento, una ejecución del proveedor en el doble local y conservación del hold parcial.
- **45 comprobaciones y 100.100 ordenaciones únicas: PASS.** Tres cargos financieros, nueve controles y tres cargos de fondo producen como máximo un fallback global por bytes; cuotas de comandos del hold suficientes. Root repitió la matriz.
- **Lectura real no destructiva:** una llamada REST con dos GET, cero EVAL o escrituras, conservando el consumo y los holds. El panel se leyó sin contratar o cambiar nada.

Las pruebas nativas usan protocolo Redis en memoria y dobles de SDK; **no ejecutaron Lua nueva en Redis real, firmaron, pagaron ni ejecutaron un servicio real**. No hay código Lua nuevo en este candidato. No se presenta esta preparación como validación del pago o entrega en producción.

## Aplicación posterior y límites de esta revisión

Tras una aprobación nueva del candidato y su paquete de publicación, se preparará un despliegue privado con las referencias existentes, sin cambiar variables del proyecto ni secretos. El override de esa versión será \`BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES=9250000000\`; compras y la plaza de aceptación conservarán su configuración actual. Se comprobarán autoridad, namespace, SSO, guardián, proveedor, capacidad vigente y perímetro sobre el estado real antes de cualquier cambio. La publicación y el cambio de límite todavía no están autorizados por este documento.

Las rutas QR, catálogo, contrato MCP y proveedor conservan sus bytes. La futura comprobación posterior al cambio se limitará a una llamada autenticada de capacidades desde el dominio canónico para verificar el techo efectivo; se reutiliza la evidencia de las rutas inalteradas. Volver a cargar todo el catálogo y los QR, o navegar por otras acciones privadas, necesita presupuesto adicional. La lectura humana contemplada es sólo la lista de órdenes; no incluye el navegador privado completo, consultas, identidad adicional ni otros recursos. Se comprobará el drenaje del despliegue anterior.

La compra nueva de **0,01 USDC Testnet**, GD45…UWMU → GAHV…DJ2C, máximo patrocinado de **0,1 XLM**, requiere autorización separada y otro control de capacidad. El pedido original \`31c97193-be74-4b9d-b0a3-f3890b0a41e8\` continúa incierto: no se adopta hash, reenvía pago, libera o reduce su reserva. No se abren compras generales, cambia proveedor, contrata Upstash, modifica Vercel ni activa otro cron como parte de esta preparación.

[Propuesta de configuración](free-margin-repair-production-proposal-2026-10-12.json). [Build](../evidence/free-margin-repair-bazaar-build-2026-10-12.json). [Lectura de saldo](../evidence/free-margin-repair-fresh-budget-read-2026-10-12.json). [Proyección con todas las ordenaciones](../evidence/payment-recovery-925-cold-financial-projection-local-2026-10-12.json). [Pruebas nativas](../evidence/free-margin-repair-native-migration-local-2026-10-12.json).
`;
async function save(path,v){const h=await open(path,'wx',0o600);try{await h.writeFile(typeof v==='string'?v:JSON.stringify(v,null,2)+'\n');}finally{await h.close();}}
await save('docs/release/free-margin-repair-production-proposal-2026-10-12.json',proposal);await save('docs/release/free-margin-repair-review-2026-10-12.md',doc);
console.log(JSON.stringify({status:'PREPARED_TESTED_FREE_MARGIN_REVIEW_NOT_APPLIED',sourceDigest:source,review:'docs/release/free-margin-repair-review-2026-10-12.md',currentCapBytes:8500000000,proposedCapBytes:9250000000,proposedMarginBytes:43580544,cloudWrites:0,newPayments:0}));
