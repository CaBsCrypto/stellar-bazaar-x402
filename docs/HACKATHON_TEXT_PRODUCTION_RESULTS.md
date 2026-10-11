# Resultados antes de abrir la demo de texto

Revisión del 10 de octubre de 2026, Santiago; pruebas finales del 11 de octubre UTC. **La configuración está preparada como borrador; la demo pública todavía no está aceptada.** No se publicó producción, no se activó ningún cron, no se cambió el presupuesto y no se hizo otra compra.

La [revisión final del paquete](evidence/text-production-preparation-final-review-2026-10-10.json) pasó 91 comprobaciones de hashes, enlaces, estados y configuración. Las puertas de apertura permanecen cerradas; el runtime sigue siendo el candidato probado. El escaneo redactado no encontró semillas Stellar ni copias exactas de los secretos locales conocidos en los archivos actuales; conserva el hallazgo histórico previo y no constituye una auditoría exhaustiva de credenciales.

## Qué pasó las comprobaciones

| Comprobación | Resultado y alcance |
| --- | --- |
| Compra, texto e historial | La [compra autorizada anterior](evidence/continuous-purchase-acceptance-2026-10-10.json) de 0,01 USDC Testnet en preview confirmó pago, una ejecución, entrega, historial privado, recuperación e aislamiento. Esa autorización está consumida. Esta revisión no repitió el pago ni el tick. |
| Cuotas de cuentas con Redis real | [Nueve comprobaciones](evidence/text-workspace-real-capacity-final-2026-10-10.json) pasaron: 200 altas/día y por IP/hora, 60 peticiones/cuenta/minuto, 120 globales/ingreso, concurrencia atómica, `429` con reintento, recuperación con admisión cerrada y `503`. Se usaron dos cuentas sintéticas en una familia nueva; 60 solicitudes REST y limpieza confirmada. Los contadores se prepararon cerca del límite; no fue una carga de 200 usuarios. |
| Reserva para pago y entrega | [Nueve comprobaciones del marketplace](evidence/text-market-real-capacity-2026-10-10.json) pasaron con Lua/CAS real: una sola escritura ganadora, reserva durable, lectura posterior a respuesta perdida, rechazo por capacidad antes de escribir y corrupción cerrada con `503`. Tres claves sintéticas, 59 solicitudes, limpieza confirmada; cero pagos o llamadas al proveedor. |
| Persistencia local entre procesos | El [rerun del harness](evidence/text-workspace-core-recheck-2026-10-10.json) pasó en un entorno con TCP local permitido: tres procesos HTTP, reinicio, ocho altas concurrentes, rotación, revocación, recuperación y límites. La ejecución anterior bloqueada por `EACCES` se conserva en el [informe inicial](evidence/text-capacity-local-review-2026-10-10.json); no era una validación de Redis remoto. |
| Historial y permisos en UI | [17 escenarios locales](evidence/text-workspace-lifecycle-recheck-2026-10-10.json) pasaron al corregir el harness obsoleto. Usan el componente real con hooks y transporte sintético: bloqueo, revocación, respuestas tardías, aislamiento, recuperación e intención explícita. Esta prueba no usa navegador, Redis ni firma. El runtime aceptado no cambió. |
| Secretos de producción | La [lectura de Vercel](evidence/text-production-metadata-final-2026-10-10.json) confirmó presencia de Redis, facilitador Testnet y cinco variables R2. Sólo se registraron nombres, tipos y presencia; su valor y validez efectiva en un nuevo runtime quedan por comprobar sin exponerlos. R2 continúa fuera de la demo de texto. |

La primera prueba propia de cuotas tenía un hash de IP de fixture incompatible con el formato canónico del store. Se corrigió el fixture y se repitió en otra familia nueva; [el intento inicial](evidence/text-workspace-real-capacity-2026-10-10.json) conserva su fallo y limpieza. No se cambió el código del runtime para obtener el resultado aprobado. Las pérdidas de respuesta y fallos de transporte se inyectaron localmente; no se interrumpió Upstash ni se tocaron datos reales.

## Acceso público: todavía bloqueado

La [sonda sin credenciales desde esta máquina](evidence/text-public-access-preproduction-network-2026-10-10.json) observó MCP `0.5.0` con ocho herramientas en producción. `/demo`, `/AGENT_CONNECTION.md` y el catálogo nuevo devolvieron `404`. La preview actual exige acceso de Vercel y devuelve `401` a esa misma sonda. El candidato probado sigue siendo `633e31e4aaefa5c59b9d19af02c92dc97325f6c9`, MCP `1.0.0`, en `ezcuo3lgv`.

La regla activa de firewall sigue permitiendo fuera de la IP del operador únicamente `/api/mcp` en los dos hosts protegidos de preview. El dominio de producción no está exceptuado. Por ello el éxito desde esta máquina **no demuestra acceso de cualquier persona desde el QR**. La herramienta web externa no pudo recuperar el dominio y no suministró un estado HTTP definitivo: la aceptación desde otra red sigue pendiente.

Quedó una [propuesta exacta de rutas y métodos](release/text-public-route-proposal-2026-10-10.json), sin aplicar. Conserva las credenciales privadas de cada cuenta y excluye APIs operativas y archivos. El QR propuesto entra por `/demo`, usando `/demo-qr.svg`; la ruta del SVG de la portada requiere una corrección adicional si se quiere aceptar también esa entrada. Abrir el firewall no publica por sí solo el código nuevo.

## Consumo y continuidad

| Cuenta / función | Observación |
| --- | --- |
| Upstash | [Panel actual](evidence/text-upstash-quota-2026-10-10.json): Free, 16.345 comandos derivados de lecturas/escrituras, de 500.000 mensuales; 118 KB almacenados y coste observado de $0. Los números pueden actualizarse después de la lectura. |
| Vercel | [Panel del equipo](evidence/text-vercel-usage-2026-10-10.json): Pro, $20 de crédito incluido consumidos y $3,06 adicionales en el ciclo mostrado. Incluye todos los proyectos; no se atribuye ese importe a Bazaar ni se garantiza publicación gratuita. |
| Cron cada cinco minutos | [Estimación reproducida offline](evidence/text-cron-capacity-estimate-2026-10-10.json): mínimo 648.000 comandos/30 días para el worker solo y 1.373.760 incluyendo el MCP ocioso. Las 267.840 llamadas REST estimadas anteriormente no son el consumo total de comandos. Upstash cuenta también los comandos dentro de Lua; [documentación oficial](https://upstash.com/docs/redis/sdks/ratelimit-ts/costs). No es una factura medida ni autoriza un cambio de plan. |
| Capacidad del vendedor | Una ejecución por tick y 50 intentos/día están limitados en el worker. **Bazaar aún no vincula ese cupo ni la disponibilidad del worker con la admisión del pago.** Un servicio activo puede admitir una compra con el vendedor detenido o sin cupo. Las compras siguen cerradas en el borrador hasta resolverlo. |

Un cron ocioso permanente cada cinco minutos no cabe en la cuota mensual bajo ese modelo. Una ventana de evento de 24 horas tendría un piso estimado de 45.792 comandos ociosos, más compradores, entregas, guardián y otros consumidores. Es una alternativa por revisar con un cierre comprobable, no una programación aprobada ni una garantía de capacidad. Tampoco elimina el requisito de comprobar disponibilidad antes de cobrar.

## Paquete preparado y cierre pendiente

El [manifiesto de producción](release/text-production-manifest-2026-10-10.json) fija origen, Testnet, familia Redis/R2 nueva, referencias sensibles existentes y diferencias con la configuración actual. El [archivo de despliegue de Bazaar](release/vercel-text-no-cron.json) incluye `crons: []`. No basta con deshabilitar el vendedor mediante un flag: ambos paquetes deben omitir la programación para respetar este corte.

La [copia fijada de Bazaar](evidence/text-production-source-export-2026-10-10.json) contiene los 1.173 archivos del candidato y sólo cambia `vercel.json`; el paquete del proveedor conserva sus 22 archivos y sólo elimina su cron. La exportación inicial de Windows cambió finales de línea: se restauraron únicamente cuando sus bytes normalizados coincidían con el blob original de Git. Documentación, scripts y ejemplos quedan excluidos por `.vercelignore`; no se copiaron credenciales. Estas copias aún no se compilaron ni publicaron con la nueva configuración.

La configuración preparada conserva altas pausadas, compras cerradas, archivos deshabilitados y vendedor apagado; prepara catálogo y recepción de servicios con revisión manual. El proveedor sigue siendo una API externa con su cuenta y credencial propia. Su perfil de producción requiere origen definitivo, prueba de control, ficha revisada, acceso ACL propio y secretos de producción; los bypass y las cuentas de preview no se trasladan al público. El guardián tiene además un conflicto de origen entre dominio público y hostname del deployment que debe resolverse antes de aceptar su cron.

El orden mínimo para abrir compras es:

1. Vincular disponibilidad, cola y cupo del vendedor con una reserva atómica **antes** de admitir el pago; preservar conciliación y recuperación existentes.
2. Completar y validar el perfil del proveedor y la nueva configuración en un candidato fijado; comprobar el perímetro público desde otra red y el recorrido por `/demo`.
3. Presentar candidato, configuración, reglas y evidencias juntos para la autorización de publicación/apertura. Si se propone programación, incluir cadencia, consumo y ventana de actividad en esa revisión.
4. Realizar la aceptación externa con una nueva transacción sólo después de autorizar por separado servicio, cantidad, importe, wallet/firmante y tarifa. No reutilizar la autorización consumida de preview.

Las comprobaciones locales y de Redis real reducen los pendientes técnicos, pero no se presentan como validación de una producción que aún no se publicó.
