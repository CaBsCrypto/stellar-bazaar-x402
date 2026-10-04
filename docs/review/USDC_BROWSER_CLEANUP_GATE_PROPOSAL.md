# Propuesta local: navegador funcional, cleanup y apertura USDC

Propuesta pendiente de acuerdo con el coordinador y el revisor. Este documento no declara pruebas pasadas, no cambia el manifiesto ni el ejecutor, y no autoriza efectos nuevos. La retirada del servicio sintético y la revocación de A ya forman parte del plan aprobado.

## Hallazgo en el ejecutor

`scripts/run-hosted-usdc-sale.mjs`, fase `retire`, exige `readiness.hostedBrowserPassed === true` después de `pause`. La fase sólo retira la ficha sintética, revoca A, comprueba 401 con sus accesos humano/agente y recupera exactamente el historial de B: cinco API ya previstas. No publica el candidato, invita desarrolladores ni realiza pagos.

La superficie CUA disponible permite métricas DOM, pero los atajos Control+Plus/Control+Equal no modifican DPR ni viewport. Por tanto, el zoom real de página al 200 % sigue pendiente de comprobación manual. Freighter humano también está pendiente; las firmas sintéticas verifican el backend. Marcar `hostedBrowserPassed=true` para permitir `retire` ocultaría esas condiciones de apertura. Mantener una sola puerta también impediría completar la retirada/revocación autorizada por motivos ajenos a ese cleanup.

## Resultados separados

Guardar un informe público y sanitizado `usdc-browser-functional.json`, ligado al plan, SHA, ID y origen del replacement y al hash de sus evidencias. Cada control mantiene su resultado, método, fecha y limitaciones. Los controles funcionales requeridos son Magic Link de A y B, compras/ventas privadas con texto y fallo diferenciados, bloqueo y borrado de vista, teclado con foco visible y viewport móvil 390 × 844. La privacidad de terceros conserva además la prueba HTTP hospedada; no convertirla en una prueba nueva de navegador.

Cuando esos controles funcionales pasen, el informe puede decir `functionalStatus: "PASS_FUNCTIONAL_BROWSER"`. Su estado global debe seguir siendo `"PARTIAL_BROWSER_ACCEPTANCE"` mientras los controles de apertura no pasen. Registrar por separado `nativeZoom200: "PENDING_MANUAL"` con las métricas que muestran el atajo sin efecto y `humanFreighter: "PENDING_MANUAL"`. Ningún viewport emulado, CSS alterado o firma sintética cambia esos resultados.

La medición de transporte constituye un tercer resultado. PerformanceResourceTiming es evidencia auxiliar sanitizada: no proporciona UUID de respuesta ni cobertura completa. El conciliador conserva sus avisos de cobertura; `PASS_COUNTERS` sólo acredita sus contadores y tampoco acredita apertura. No fabricar `complete:true`, status CONFIRMED, UUID, bytes o resultados manuales para cerrar un informe.

## Puerta específica para retirar las identidades sintéticas

Proponer `readiness.canRetireSynthetic` independiente de `hostedBrowserPassed` y de una futura puerta de apertura. Su habilitación local requiere:

1. Plan, SHA, payload y deployment exactos; comprobación anónima PASS del replacement protegido.
2. Fases `sale`, `replacement` y `pause` confirmadas, con pedidos, comprobantes y textos preservados para la comparación posterior.
3. Informe funcional aprobado con el mismo plan/SHA/deployment y evidencia congelada; resultados manuales de zoom y Freighter conservados como pendientes.
4. Presupuesto vigente suficiente para las cinco API de `retire` y sus Redis/bytes/tiempo, incluyendo todo lo observado en navegador. Mantener los guardias existentes, cero reintentos y el bloqueo ante resultados inciertos. Una cobertura parcial sólo puede convivir con cleanup si la cota conservadora de sus costes está demostrada y aceptada por el revisor; si no se pueden acotar, la puerta permanece cerrada.
5. Alcance exacto congelado: submissionId del servicio sintético, propietario/workspace de A y expectedGeneration 3; conservar B y todos los registros. Aprobación independiente explícita del alcance de cleanup, sin interpretar ese dictamen como aprobación de apertura.

El cambio propuesto en el selector inicial es utilizar `canRetireSynthetic` para `phase === "retire"`, `canProbe` para `probe` y `canExecute` para el resto. Dentro de `retire`, sustituir la assertion de `hostedBrowserPassed` por la validación del recibo funcional y de cleanup. No eliminar ni debilitar controles de presupuesto, destino, generación, incertidumbre, phase replay o preservación del historial de B.

El recibo de cleanup deberá conservar el hash del informe funcional, las referencias exactas de pruebas de pausa/replacement y la decisión del revisor. Usar un nombre de estado concreto, por ejemplo `"APPROVED_SYNTHETIC_CLEANUP_ONLY"`; no reutilizar `"PASS_BROWSER"` ni `"APPROVED_OPENING"`.

Tras los ACK confirmados: consumir `canRetireSynthetic`, registrar la retirada/revocación y las comprobaciones 401/B, cerrar la ejecución de aceptación completada y conservar `hostedBrowserPassed:false`, `nativeZoom200Passed:false`, `humanFreighterPassed:false` y `openingApproved:false`. La ausencia de una puerta de publicación en el código actual no equivale a autorización para promover production. El candidato queda protegido y las nuevas compras/altas pausadas según el plan.

## Comprobaciones locales propuestas antes del cambio

- Funcionales PASS y ambos manuales PENDING permiten únicamente el cleanup sintético, con puertas de apertura falsas.
- Funcionales ausentes/incompletos, SHA/ID/owner/servicio/generación distintos, pausa sin confirmar, efecto incierto o presupuesto agotado se rechazan antes del primer efecto.
- La pérdida de ACK conserva intención e IDs y no vuelve a retirar/revocar automáticamente.
- Retirar la ficha y revocar A producen los 401 esperados y dejan exactamente los dos pedidos, estados, comprobantes y texto de B; ninguna fase agrega pagos o llamadas al proveedor.
- `PASS_COUNTERS`, `PASS_FUNCTIONAL_BROWSER` y `APPROVED_SYNTHETIC_CLEANUP_ONLY` por separado no permiten apertura mientras zoom/Freighter o revisión final estén pendientes.

## Acceso posterior de B

El ejecutor ya comprueba el historial de B después de revocar A. El helper `serve-usdc-recovery-once.mjs` actualmente rechaza ambos roles si `sale.completed` contiene `retire`. Si se decide recuperar B también por navegador después del cleanup, limitar ese rechazo a A; B conserva su acceso original. Serían cinco API adicionales en replacement, sujetas al saldo real de las seis reservadas. No hacer esa visita por defecto ni declarar que ocurrió. Una recuperación sobre el deployment `closed` necesitaría ligar también su prueba de protección exacta, manteniendo todos los checks de origen/SHA/ID.

La validación humana pendiente deberá planificarse con su propio manifiesto medido y revisado: no suponer pagos, proveedor o identidades adicionales bajo los límites ya consumidos por esta aceptación.

## Preparación del guard y parche mínimo acordable

`scripts/usdc-synthetic-cleanup-guard.mjs` contiene el guard puro `assertCanRetireSynthetic`, sin I/O. Sus pruebas locales están en `scripts/test-usdc-synthetic-cleanup-guard.mjs`. No se activó ninguna puerta en el manifiesto real ni se editó el ejecutor. El guard usa la etiqueta concreta `PASS_FUNCTIONAL_MANUAL_GATES_PENDING` para el recibo: funcionales aprobados y condiciones manuales pendientes, con `canOpen:false` y `hostedBrowserPassed:false` tanto en recibo como en readiness.

El recibo público `usdc-browser-functional.json` necesita `version:1`, `purpose:"synthetic-cleanup-only"`, `status:"PASS_FUNCTIONAL_MANUAL_GATES_PENDING"`, planId/sourceSha/deploymentId/origin exactos, checks `{magicLinkA,magicLinkB,lockClearsView,keyboard,mobile390,readsSameRecords,privacy}` todos `"PASS"`, manual `{nativeZoom200,humanFreighter}` ambos `"PENDING_MANUAL"`, `canOpen:false`, `hostedBrowserPassed:false`, `automaticRetries:0`, `expectedGeneration:3`, serviceId/submissionId/sellerOwnerId/sellerWorkspaceId/buyerOwnerId/buyerWorkspaceId y los dos orderIds en el orden congelado del manifiesto. `manifest.cleanupReceipt.sha256` se calcula sobre los bytes exactos de ese archivo ya congelado.

El coordinador puede aplicar este parche de control después de la revisión. Mantener todo el resto del ejecutor, incluidos sus límites, ACK, lock y checks de B:

```js
import {assertCanRetireSynthetic} from './usdc-synthetic-cleanup-guard.mjs';

// Selector de la puerta inicial; no cambia las fases ni sus efectos.
const gate = phase === 'probe' ? 'canProbe' : phase === 'retire' ? 'canRetireSynthetic' : 'canExecute';
assert.equal(m.readiness[gate], true, 'MANIFEST_GATE_CLOSED');

// En retire, conservar sale.completed.includes('pause') y sustituir
// únicamente la assertion hostedBrowserPassed=true por el guard:
assertCanRetireSynthetic({
  manifest: m, deployment,
  receiptBytes: await readFile(dir + '/usdc-browser-functional.json'),
  completedPhases: sale.completed,
  workspaceReceipts: packet.receipt,
});
```

El guard no reemplaza la demostración de presupuesto que debe preceder a `canRetireSynthetic:true`, ni el guard por petición existente. Tampoco activa flags, hace efectos o declara una aceptación general del navegador.
