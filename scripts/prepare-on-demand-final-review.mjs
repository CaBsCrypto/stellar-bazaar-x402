import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { onDemandProductionV3Control } from '../.vercel/on-demand-production-v3-control.mjs';

const evidencePaths = {
  source: 'docs/release/continuous-on-demand-v2-source-proposal-2026-10-11.json',
  configuration: 'docs/release/continuous-on-demand-v3-production-proposal-2026-10-11.json',
  sourcesLocal: 'docs/evidence/continuous-on-demand-v2-sources-local-2026-10-11.json',
  local: 'docs/evidence/continuous-on-demand-local-final-2026-10-11.json',
  bazaarBuild: 'docs/evidence/on-demand-v2-bazaar-build-2026-10-11.json',
  providerBuild: 'docs/evidence/on-demand-provider-build-2026-10-11.json',
  redis: 'docs/evidence/on-demand-redis-real-v4-2026-10-11.json',
  sellerRedis: 'docs/evidence/seller-on-demand-storage-real-2026-10-11.json',
  preview: 'docs/evidence/on-demand-preview-v2-acceptance-2026-10-11.json',
  qr: 'docs/evidence/on-demand-v2-preview-qr-decoded-2026-10-12.json',
  browser: 'docs/evidence/on-demand-v2-browser-read-2026-10-12.json',
  quota: 'docs/evidence/on-demand-upstash-free-current-v3-2026-10-12.json',
  previewBudget: 'docs/evidence/on-demand-v2-preview-budget-read-2026-10-12.json',
  capacity: 'docs/evidence/on-demand-free-capacity-plan-v2-2026-10-11.json',
  configurationTests: 'docs/evidence/on-demand-production-v3-control-local-2026-10-12.json',
  storagePreparation: 'docs/evidence/on-demand-production-v3-storage-preparation-2026-10-12.json',
  retiredPreviewException: 'docs/evidence/on-demand-preview-waf-retire-applied-2026-10-11.json',
  productionWaf: 'docs/evidence/on-demand-production-v3-waf-current-prepared-2026-10-12.json',
  wafProtocol: 'docs/evidence/on-demand-production-v3-waf-local-r3-2026-10-12.json',
};
const sha = value => createHash('sha256').update(value).digest('hex');
const evidence = {};
const records = {};
for (const [kind, file] of Object.entries(evidencePaths)) {
  const bytes = await readFile(file);
  const record = JSON.parse(bytes);
  evidence[kind] = { path: file, sha256: sha(bytes), status: record.status };
  records[kind] = record;
}
const review = await onDemandProductionV3Control('review');
const check = (condition, code) => { if (!condition) throw new Error(code); };
check(review.status === 'PRODUCTION_REVIEW_READY_WITH_RUNTIME_PRECONDITIONS' && review.reviewPending.length === 0, 'CONFIGURATION_REVIEW_NOT_READY');
check(records.local.results.length === 35 && records.local.results.every(r => r.exitCode === 0), 'LOCAL_SUITE_FAILURE');
check(records.preview.status === 'PASS_PROTECTED_ON_DEMAND_PREVIEW' && records.preview.checks === 79 && records.preview.payments === 0 && records.preview.providerExecutions === 0, 'HOSTED_PREVIEW_PROOF_REQUIRED');
check(records.redis.status === 'PASS' && records.redis.assertions === 48 && records.redis.isolatedSyntheticKeysRemoved, 'REAL_REDIS_PROOF_REQUIRED');
check(records.qr.checks === 2 && records.qr.results.length === 2, 'INDEPENDENT_QR_PROOF_REQUIRED');
check(records.configurationTests.tests.checks === 94 && records.configurationTests.storagePreparation.checks === 73, 'PRODUCTION_PREPARATION_PROOF_REQUIRED');
check(records.productionWaf.cloudWrites === 0 && records.productionWaf.productionChanged === false && records.productionWaf.status === 'PREPARED_CURRENT_BASELINE_NOT_APPLIED', 'CURRENT_WAF_PREPARATION_PROOF_REQUIRED');
check(records.configuration.commandBudget.maximumGlobalCommands === 360000 && records.configuration.commandBudget.public === 115000, 'EXACT_360K_CONFIGURATION_REQUIRED');
check(records.quota.conservativeMaximumTotal === 493500 && records.quota.commandsUsedConservative === 80000, 'CONSERVATIVE_QUOTA_ARITHMETIC_REQUIRED');
const observedPreviewCommandReservations = Object.values(records.previewBudget.usedReservations).reduce((total, value) => total + value, 0);
check(observedPreviewCommandReservations === 26808, 'EXACT_OBSERVED_PREVIEW_COUNTER_REQUIRED');

const relativeLink = (kind, label) => `[${label}](../${evidence[kind].path.replace(/^docs\//, '')})`;
const result = {
  version: 1,
  status: 'REVIEW_READY_NOT_PRODUCTION_ACCEPTED',
  observedAt: new Date().toISOString(),
  baseCommit: 'e9daaf13e792760da0664485d7b189c699a1b0ad',
  productionSourcePins: review.sourcePins,
  configurationRevision: 3,
  sourceReleaseRevision: 2,
  productionPlanHash: review.planHash,
  productionProposalSha256: review.proposalHash,
  wafPlanHash: records.productionWaf.planHash,
  evidence,
  implemented: ['Authenticated own-service readiness before order and first payment', 'Durable paid notification in the same native CAS as payment confirmation', 'Targeted delivery and original-attempt recovery; uncertain execution requires operator', 'Rolling 31-day conservative commands, transfer and native-storage quotas', 'Pending operation holds without content TTL; seven-day private content retention', 'Cheap hourly guardian indices with explicit old-data initialization', 'Thirty-minute identity cache; provider has no periodic cron', 'Existing MCP tool names, native provider review, private access, links, search and QR'],
  validation: {
    localSuiteCount: 35,
    localSuiteBasis: 'Before the final one-line archived-operation credit correction; that correction separately passed nine checks and the immutable V2 source comparison/build',
    archivedRecoveryCredit: { status: 'PASS_LOCAL_ARCHIVED_RECOVERY_CREDIT', checks: 9, command: 'node scripts/test-on-demand-recovery-credit.mjs', payments: 0, networkRequests: 0 },
    realRedisChecks: 48,
    hostedPreviewChecks: 79,
    hostedPreviewRequests: 70,
    freshSyntheticAccounts: 1,
    readinessInvocations: 1,
    qrDecodes: 2,
    productionControlChecks: 94,
    storagePreparationChecks: 73,
    wafProtocolChecks: 76,
    wafProtocolMatrixCases: 4032,
    realNewOrders: 0,
    realNewPayments: 0,
    realProviderExecutions: 0,
  },
  proposedBudget: {
    plan: 'Upstash Free', subscriptionsChanged: false,
    rollingWindowDays: 31,
    commands: records.configuration.commandBudget,
    transferBytes: 8000000000,
    nativeStorageBytes: 200000000,
    previousCommandsConservativeUpper: 80000,
    sharedMarginCommands: 50000,
    initializationAllowanceCommands: 3500,
    projectedUpper: 493500,
    remainingConservativeMargin: 6500,
    observedPreviewCommandReservations,
    previewCommandAllowanceUpper: 27808,
    additionalPreviewTechnicalAllowance: 1000,
    olderProposalMarginAtFloor11692IsNotCurrentUpperMargin: true,
    freshQuotaCheckRequiredBeforeMutation: true,
    actualPhysicalTransferOrInvoiceProven: false,
    conservativeNewBuyerAndPurchaseBytes: 2644169472,
    theoreticalCompleteNewBuyerDemosIfNoOtherTraffic: 3,
    holdAwareConservativeCompleteFlowCount: 1,
    previewReservedTransferBytes: 7133724928,
    previewLedgerReset: false,
    productionLedgerReset: false,
  },
  jointApprovalScope: [
    'Apply the exact V3 configuration to the two existing projects, without subscription or Vercel-budget changes',
    'Temporarily block traffic to both projects and drain old writers for at least sixty seconds',
    'Create the first minimal provider custom WAF configuration directly active by official PUT only from confirmed absence, then confirm exact active readback; Bazaar continues its existing draft workflow',
    'Initialize known production records and the existing scoped provider quota without resetting consumption or deleting customer data',
    'Deploy one frozen version per project, exact hashes and canonical aliases',
    'Quarantine obsolete deployment hostnames, restore the reviewed public routes and preserve other protections',
    'Activate only the hourly Bazaar guardian; provider periodic cron remains absent',
    'Keep production purchases restricted to the sealed acceptance account; no new payment or general purchase opening',
  ],
  runtimePreconditionsPending: [...review.runtimePreconditionsPending, 'Approved existing Bazaar WAF draft activation and exact first-provider PUT active readback', 'Canonical aliases resolve to exact new immutable source deployments'],
  productionChanged: false,
  cronActivated: false,
  futurePaymentRequiresSeparateApproval: { service: 'Guion breve algorítmico', amount: '0.01', asset: 'USDC', network: 'Stellar Testnet', payerPublic: 'GD454Z77ESZ5EHO6W7RE2WJCWQYKGFBS6HT2D375CYBWGHFFXOFIUWMU', sellerPublic: 'GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C', sponsoredFeeMaximumXlm: '0.1', purchases: 1 },
  limitations: [
    'Preview is protected and tested from the operator computer, not an independent external team',
    'Preview combines V2 Bazaar with the identical frozen provider that calls V1 bootstrap; the one-line archived recovery change is validated locally, not through a hosted payment',
    'The general QR points to canonical production, which still serves the old candidate',
    'Readiness lease naturally expired after the single test; anonymous visits never renew it',
    'No new-model hosted purchase, delivery execution, scheduled invocation or full production private-link walkthrough has been accepted',
    'Synthetic payment and delivery tests are not evidence of a real Testnet transaction',
    'Conservative transfer reservations limit Free to a very small demonstration, not unrestricted public capacity',
    'Changing usage-dashboard counters were not treated as a reset; the projected quota is an allowance estimate, not the provider invoice',
    'First provider WAF creation has no claimed remote draft validation; PUT is directly active and requires explicit joint approval and exact readback. Migration stops if runtime configuration differs',
  ],
};

const markdown = `# Revisión conjunta — Bazaar continuo, Upstash Free y vendedor bajo demanda

Preparado el ${result.observedAt}. **Candidato implementado y validado en Preview; producción todavía conserva la versión anterior.** No se hizo ningún pago nuevo ni se activó programación. La apertura general de compras sigue pendiente.

## Qué cambia

El servicio propio «Guion breve algorítmico» comprueba al vendedor cuando un comprador autenticado prepara la orden y antes del primer envío de pago. Las visitas al catálogo no lo despiertan. Mantiene un lease de seis minutos, una orden pendiente por vendedor y un máximo técnico de 50 entregas diarias. El servidor fija servicio, propietario, versión y destino privado del trabajador; el agente no puede cambiarlos.

La confirmación de pago guarda el aviso durable de entrega en la misma escritura atómica. La recuperación conserva pedido, aviso e intento. Una ejecución incierta pasa a revisión del operador y no se repite automáticamente. El proveedor no tiene cron periódico; se propone únicamente el guardián de Bazaar cada hora. Texto y consultas visibles vencen a los siete días; los controles mínimos de pagos pendientes conservan sus reservas. R2 permanece deshabilitado.

Se conservan /api/mcp, los 35 nombres de herramientas, la publicación nativa revisada, los accesos separados, búsqueda, enlaces públicos y QR. No se contratan planes, no se cambian presupuestos de Vercel y no se almacenan claves privadas de wallets.

## Candidato reproducible

| Elemento | Referencia |
|---|---|
| Commit de partida | ${result.baseCommit}; incluye cambios locales revisados y exportaciones inmutables |
| Bazaar producción, 342 archivos | ${review.sourcePins.bazaar.sourceDigest} |
| Proveedor, 22 archivos | ${review.sourcePins.provider.sourceDigest} |
| Plan de producción | ${review.planHash} |
| Propuesta de configuración V3 | ${review.proposalHash} |
| Plan WAF basado en el estado actual | ${result.wafPlanHash} |

Los manifiestos fijan los contenidos de las fuentes; el commit de partida solo no representa el candidato. ${relativeLink('source', 'Fuentes y manifiestos')}. ${relativeLink('configuration', 'Configuración exacta')}. Las versiones anteriores se conservan.

## Validaciones y alcance

| Evidencia | Resultado | Alcance real |
|---|---|---|
| Builds Bazaar y proveedor | Correctos | Fuentes congeladas; build local no demuestra producción |
| 35 suites locales | Correctas | Concurrencia, permisos, cuotas, recuperación y compatibilidad; dependencias sintéticas |
| Corrección final de crédito archivado | 9 controles correctos | Recuperación de reservas tras vencer el contenido; comparación V2 y build posteriores |
| Redis real aislado | 48 controles correctos | Lua/CAS/tiempo, límites, reservas, fallos y reinicio; siete claves sintéticas eliminadas |
| Preview protegida | 79 controles, 70 solicitudes | Cuenta nueva, credenciales, revocación, aislamiento, MCP, catálogo, instrucciones y QR |
| Readiness alojado | Una comprobación correcta | Reportó capacidad; cero ejecuciones, órdenes o pagos |
| QR alojados | Dos decodificaciones independientes correctas | Servicio apunta a esta Preview; QR general apunta a producción canónica |
| Controles de publicación | 94 + 73 controles correctos | Configuración V3 e inicialización; todavía no aplicados a producción |
| Controles WAF | 76 controles y 4.032 casos correctos | Esquema oficial y recuperación local; creación inaugural directamente activa aún pendiente |

${relativeLink('preview', 'Resultados de Preview')} · ${relativeLink('redis', 'Redis real')} · ${relativeLink('configurationTests', 'Controles de producción')} · ${relativeLink('qr', 'Destinos de los QR')}.

La Preview usa Bazaar V2 y el proveedor de fuentes idénticas conectado al bootstrap V1. La diferencia de recuperación archivada se comprobó localmente; no se presentó esa mezcla como una compra alojada del modelo nuevo. El lease de la comprobación ya venció, como corresponde, y la excepción temporal de Preview fue retirada. ${relativeLink('retiredPreviewException', 'Retirada de la excepción')}.

![Ficha del servicio en la nueva Preview; compras pausadas](../evidence/on-demand-v2-preview-service-browser-2026-10-12.png)

## Capacidad Free y limitación para la demo

Se propone reservar **360.000 comandos en 31 días**: 115.000 públicos, 90.000 autenticados, 105.000 de recuperación y 50.000 en segundo plano. Está dentro del máximo de 400.000 del plan. El límite de transferencia es 8 GB y el de almacenamiento nativo 200 MB, incluidos 20 MB de reserva técnica. Las operaciones pendientes reservan capacidad antes del pago y no pierden esa reserva con el TTL del historial.

El panel confirmó Free y US$0; sus contadores variaron entre lecturas. Para no asumir un reinicio, la propuesta usa **80.000 comandos previos como cota conservadora**, más 50.000 compartidos y 3.500 de inicialización: 493.500 de los 500.000 del plan, con 6.500 de margen. El snapshot de Preview suma 26.808 comandos reservados; la cota de 27.808 de la propuesta incluye 1.000 adicionales conservadores, no un contador medido. Los 11.692 de margen indicados en la propuesta anterior corresponden al piso de consumo; con la cota de 80.000 el margen correcto es 6.500. **La cuota debe comprobarse otra vez justo antes de cualquier cambio.** ${relativeLink('quota', 'Observación y cálculo conservador')}.

**La transferencia conservadora es el límite principal.** El modelo reserva aproximadamente 2,64 GB para un usuario nuevo que completa una compra de texto: como máximo teórico tres recorridos en 31 días si no hubiese otro tráfico, y un recorrido con el margen simultáneo de reservas. Es una demo pequeña y controlada; 200 altas y 50 entregas diarias son techos contra abuso, no capacidad garantizada. La Preview ya reservó 7,13 GB de sus 8 GB aislados; esa cifra no es tráfico físico facturado, no se reiniciará y no se transfiere a producción. ${relativeLink('capacity', 'Modelo de capacidad y supuestos')}.

El reposo del guardián mide ocho comandos por invocación: 5.952 en 31 días, o 11.904 con la reserva conservadora. Inicialización, limpieza y trabajo pendiente consumen capacidad adicional. La publicación se detendrá si la cuota fresca, las referencias o el inventario no cumplen los controles.

## Paquete que requiere tu aprobación conjunta

1. Aplicar esta configuración a los dos proyectos existentes, sin costes contratados ni cambios de presupuestos.
2. Pausar temporalmente el acceso a ambos proyectos y esperar al menos 60 segundos para drenar escritores antiguos. Inicializar las cuotas sobre los datos existentes, sin reiniciar consumo ni borrar cuentas.
3. Crear la primera configuración mínima WAF del proveedor, actualmente inexistente, mediante PUT oficial **directamente activo**, sólo después de comprobar de nuevo su ausencia y con confirmación exacta de lectura. No se presenta como un borrador remoto ya validado. Bazaar conservará el flujo de su borrador existente. Mantener las demás protecciones, autenticación de Vercel y acceso privado del trabajador.
4. Desplegar una versión congelada de Bazaar y una del proveedor; comprobar los dominios canónicos. Bloquear URLs de despliegues antiguos para que no escriban sobre las nuevas cuotas y restaurar exactamente el perímetro público revisado.
5. Activar únicamente el guardián horario de Bazaar. Mantener las compras restringidas a la cuenta de aceptación; el proveedor seguirá sin cron periódico.

${relativeLink('productionWaf', 'Preparación del perímetro con estado actual')}. Las activaciones WAF, la inicialización real y el despliegue siguen pendientes. Si cambia el estado o no se confirma una activación, se detiene la siguiente mutación; no se sustituye una configuración desconocida. La creación inicial usa la [operación PUT documentada por Vercel](https://vercel.com/docs/rest-api/security/put-firewall-configuration).

Este paquete **no autoriza una transacción ni abre compras generales**. Después del despliegue restringido se solicitará por separado una compra de 0,01 USDC Stellar Testnet, GD45…UWMU → GAHV…DJ2C, con tope patrocinado local de 0,1 XLM. Quedarán por comprobar transacción, texto, integridad, enlace privado, historial y recuperación con el mismo pedido, y después la aceptación externa y apertura general.

La prueba nueva de pago y entrega, el recorrido completo en producción, la invocación programada del guardián y la integración de un equipo externo todavía no están validados. **No se declara la demo pública terminada.**
`;

const outputBase = 'docs/release/continuous-on-demand-final-review-2026-10-12';
await writeFile(`${outputBase}.json`, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
await writeFile(`${outputBase}.md`, markdown, { flag: 'wx' });
console.log(JSON.stringify({ status: result.status, review: `${outputBase}.md`, json: `${outputBase}.json`, evidenceFiles: Object.keys(evidence).length, productionPlanHash: result.productionPlanHash, wafPlanHash: result.wafPlanHash, productionChanged: false, cronActivated: false, newPayments: 0 }));
