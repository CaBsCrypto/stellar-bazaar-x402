# Expediente local de actualización de Bazaar

2026-09-28. Decisión: **candidato preparado para revisión de publicación; configuración y publicación no aplicadas**.

## Candidato y dependencias comprobados

Base local y PR #61: `be9d1dbb2afb4041edf707576ba5e9fe6fe5e165`, rama `mission/identity-pilot`. Este expediente añade únicamente ejecutor de validación, pruebas y documentación; no modifica APIs, configuración remota ni datos. Sus commits locales se identifican en la entrega mediante `git log`; el CI remoto corresponde a los SHA de esta tabla, no a los commits locales posteriores.

La evidencia Redis y el guard quedaron guardados en el commit local `6ea0fdb`. Este expediente se guarda a continuación en un commit documental separado. Ambos permanecen sin push.

| Orden | PR | Contenido | SHA remoto revisado | CI |
|---|---|---|---|---|
| 1 | #54 | Base y WebMCP | `70e85e795e38bf406cf155a56f58dd5bfa0db099` | SUCCESS |
| 2 | #55 | Identidad y acceso privado | `5ef8eb018723a6d8653bbffe3668d056861b123f` | SUCCESS |
| 3 | #56 | USDC/XLM y recuperación | `780b2b2f39e82a0e95dcf87c07ab9cb27ab40254` | SUCCESS |
| 4 | #57 | Control compartido bloqueado | `8c3257680bda1ebd924d579c09bff2d5912d01c4` | SUCCESS |
| 5 | #58 | Descubrimiento consistente | `2aaefd2198524479da97395a73b721f934c37edc` | SUCCESS |
| 6 | #59 | Entrada del comprador | `7fd847c03760b1db72efcceb364300f844f8c43c` | SUCCESS |
| 7 | #60 | Controles operativos | `2d74a588655c9e19a2013f11dc7567b095d196de` | SUCCESS |
| 8 | #61 | Piloto de identidad y biblioteca | `be9d1dbb2afb4041edf707576ba5e9fe6fe5e165` | SUCCESS |

Cadena abierta: #54 contra main; cada PR siguiente depende del anterior. No se fusionó ni subió nada. `main` remoto y último despliegue Production READY siguen en `76ba7b19eacb424d8c9e872a2d01569e1eb45b3d`. La consulta del último despliegue no certifica por sí sola todos los aliases públicos.

## Configuración observada y propuesta

Consultas de lectura con la CLI Vercel 59.23.2, sin exportar valores: proyecto `stellar-bazaar-x402`, runtime `24.x`, Ignored Build Step `exit 0`, protección `all_except_custom_domains`. El campo consultado de habilitación Git no devolvió una configuración utilizable: las exclusiones de ramas deberán verificarse nuevamente antes de cualquier push futuro. `exit 0` no impide despliegues manuales que omitan esa comprobación ni promociones.

El inventario Production muestra seis variables secretas: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `BAZAAR_PROVIDER_SECRET`, `STELLAR_X402_FACILITATOR_API_KEY`, `X402_SELLER_ADDRESS`, `STELLAR_X402_FACILITATOR_URL`. No se leyeron valores. La lista actual del proyecto no demuestra qué valores fueron incorporados al build que está sirviendo tráfico.

| Grupo | Condición para futura actualización | Estado observado |
|---|---|---|
| Identidad | `BAZAAR_HISTORY_ACCOUNTS_JSON` con propietarios y hashes verificados; nunca tokens crudos | No figura en Production; pendiente preparar/aplicar por separado |
| Redis | Conservar URL/token actuales sin copiarlos al repositorio; comprobar que no haya aliases KV divergentes | Par UPSTASH presente; aliases KV no enumerados |
| Pagos | `X402_PILOT_PAYMENTS_ENABLED=false`, `X402_LEGACY_PAYMENTS_ENABLED=false`, `X402_ENABLE_LOCAL_PAYER=false` | No enumeradas; candidato cerrado por defecto, no extrapolar esos defaults al código publicado anterior |
| Piloto XLM | `NEXT_PUBLIC_X402_XLM_PILOT=false` | No enumerada; no anunciar el piloto como disponible públicamente |
| Publicación | `BAZAAR_ENABLE_REGISTRY_MUTATIONS=false`, `BAZAAR_ENABLE_SELF_LISTING_INTAKE=false` | No enumeradas; candidato exige habilitación explícita |
| Origen | `NEXT_PUBLIC_APP_URL` y `X402_RESOURCE_BASE_URL` deben apuntar al origen aprobado del entorno, nunca localhost | No enumeradas; verificar referencias generadas antes de publicar |
| Firmantes y disco privado | Mantener ausentes `X402_PAYER_SECRET`, `X402_SELLER_SECRET`, `X402_PILOT_STATE_DIR` | No enumeradas |
| Administración/correo | Mantener ausentes `BAZAAR_ADMIN_KEY`, `ADMIN_ALLOWED_EMAILS`, `RESEND_API_KEY` en este candidato de revisión | No enumeradas; no habilitar administración ni correo |
| Archivos externos | No añadir `BAZAAR_S3_*` ni anunciar persistencia externa sin validación propia | No enumeradas; validación realizada solo inline |

No habilitar `X402_SETTLEMENT_STORE=redis` como consecuencia de este ejercicio. La ruta compartida seguirá bloqueada para pagos, aunque su implementación y pruebas estén presentes. Los secretos existentes de proveedor/facilitador no se eliminan ni rotan en esta fase; tampoco se invocan. Su presencia no autoriza compras ni acredita vigencia.

El entorno final aún no está elegido. Para producción el origen propuesto sería `https://bazaar.browns.studio`; para Preview deberá ser su origen exacto protegido. Esta tabla es una propuesta y no se aplica automáticamente. El antiguo manifiesto del candidato operativo no debe reutilizarse como autorización de despliegue.

## Compatibilidad de identidad

- El servidor registra parejas lectura/escritura bajo un mismo propietario. Los accesos no conceden firma, pagos ni administración.
- La versión publicada anterior admite prefijos reconocidos y deriva un propietario por hash del token. El candidato elimina esa alternativa. Un enlace que dependía solo del prefijo será rechazado salvo que exista una asociación administrativa verificable.
- No existe una enumeración completa de enlaces emitidos en esta revisión. No se consultaron registros históricos ni se dedujo propiedad de identificadores recibidos del cliente.
- La evidencia anterior del piloto USDC/XLM documenta una pareja con asociación de origen; no certifica su vigencia ni ausencia de filtración. Antes de incorporarla deberá resolverse esa revisión, sin incluir la cuenta negativa ni las cuentas sintéticas de este ejercicio.
- Si aparecen cuentas legítimas nuevas antes de aplicar configuración, preservar sus asociaciones verificadas. No reemplazar a ciegas el conjunto ni cambiar los propietarios para acomodar enlaces antiguos.
- Un Magic Link es reutilizable y se autoriza por posesión; bloquear la vista no lo revoca. Una rotación publicada solo estará completa tras propagar y comprobar la nueva configuración en todas las instancias.

## Evidencia técnica y revisión

Se reutiliza el ejercicio externo ya terminado: **141 solicitudes REST y 52.434 bytes de presupuesto de escritura**, una operación sin pago y una entrega inline, aislamiento A/B, idempotencia, rotación/revocación local, recuperación en un nuevo proceso, Magic Link y borrador retirado en móvil/escritorio. No se hicieron nuevas escrituras Redis en esta fase. Detalles y límites en `redis-identity-results.md`.

Lista de comandos locales permitidos para esta revisión (entorno heredado filtrado a variables del sistema; sin dotenv ni credenciales):

```text
node scripts/test-history-provisioning.mjs
node scripts/test-history-rotation.mjs
node scripts/test-history-identity-pilot.mjs
node scripts/test-operation-history.mjs
node scripts/test-operation-history-client.mjs
node scripts/test-operation-history-ui.mjs
node scripts/test-private-history-lifecycle.mjs
node scripts/test-delivery-recovery-client.mjs
node scripts/test-delivery-recovery-handoff.mjs
node scripts/test-operational-guards.mjs
node scripts/test-identity-redis-guard.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build --webpack
```

Las once suites, tipos y compilación Webpack se aprobaron sobre el candidato y sus archivos locales con Node 24.14.0. El guard también fue reproducido independientemente en Node 22.18 y 24. CI remoto usa Node 22; Vercel reporta 24.x. No se cambió el runtime. Resultados de comandos en el directorio externo `review-release/update-candidate`.

El escáner redactado pasó sin coincidencias actuales y volvió a identificar un commit histórico ya conocido. No se reescribió el historial. En este checkout no se cargaron secretos locales: la ausencia de coincidencias exactas no certifica la vigencia ni ausencia de exposición de credenciales remotas. Ese hallazgo histórico sigue separado de la aprobación del nuevo diff.

Turbopack falló previamente por el enlace local de node_modules fuera de la raíz; se conserva ese fallo como limitación del entorno. La compilación local con Webpack y el CI remoto normal son evidencias distintas. El aviso de metadataBase del build no se presenta como corregido.

Revisión cruzada: identity_library revisó ejecutor y resultados, sin ser su autor; identity_provision revisó el guard y el informe independiente, escritos por identity_library. Los diez escenarios del guard ejercitan la respuesta de historial, no prueban por separado la rama de entrega ni el fallo exclusivo del guardado final. No se presentan esas coberturas como completas.

identity_library también contrastó este expediente con autenticación, controles operativos y reversión: aprobado para commit local, sin bloqueadores para la preparación. Esa aprobación no sustituye las condiciones de publicación siguientes.

## Reversión y condiciones de publicación

1. Antes de una actualización futura, conservar privadamente el identificador del despliegue, SHA y configuración aprobados; verificar pausa/exclusiones y definir un único candidato final. No desplegar estados intermedios de la cadena.
2. Conservar los registros y sus propietarios: no hay migración ni borrado que revertir. Nunca vaciar Redis, borrar marcadores o restaurar un respaldo antiguo para deshacer una actualización de código.
3. No promover automáticamente el main antiguo como rollback: recuperaría la derivación de identidad por prefijo y carece de controles operativos posteriores. La reversión debe usar un candidato previamente revisado que preserve autenticación estricta y pagos bloqueados, o una corrección hacia adelante sobre esta base.
4. Si no existe ese candidato seguro, no autorizar aún publicación. Cualquier restricción temporal de tráfico o cambio de protección exige un procedimiento concreto aprobado; este expediente no cambia Vercel ni inventa un interruptor de mantenimiento.
5. Verificar después de una futura actualización: SHA/origen efectivos, acceso sin credencial rechazado, lectura sin escritura, mismo propietario/entrega y pagos bloqueados. Esa comprobación es otro bloque, no evidencia obtenida ahora.

Pendientes para publicación: entorno elegido y autorización específica; hashes legítimos y vigencia de accesos; configuración efectiva; reversión segura; protección y acceso automatizado si se elige Preview. El uso de Redis compartido se autorizó únicamente para el ejercicio local: no habilita automáticamente una Preview con esa base.

Durabilidad/respaldos Redis, persistencia externa de archivos, USDT0 real y pagos públicos siguen fuera del cierre. **Este expediente cierra preparación local, no publicación ni habilitación de cobros.**
