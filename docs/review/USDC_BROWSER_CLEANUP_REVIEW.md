# Revisión independiente: cierre sintético y condiciones de apertura

## Dictamen de alcance

La separación propuesta en `USDC_BROWSER_CLEANUP_GATE_PROPOSAL.md` es válida dentro del plan autorizado. Retirar el servicio sintético y revocar A forman parte del cierre de aceptación; no publican el candidato ni admiten participantes. Pueden tener una puerta `canRetireSynthetic` distinta de `hostedBrowserPassed`, siempre que no se eliminen los controles de certeza, presupuesto, identidad o preservación de registros.

Este documento aprueba el diseño de la puerta, no declara que sus evidencias hospedadas estén completas ni habilita efectos por sí mismo. La apertura permanece pendiente mientras no pasen Freighter humano, ampliación real al 200 %, cobertura de medición y revisión final.

## Condiciones para un recibo de cleanup

1. Vincular plan, SHA, deployment ID y origen exactos del replacement, prueba de protección anónima confirmada y hash del informe funcional. El recibo se valida antes del primer efecto y no se acepta por su nombre de estado solamente.
2. Confirmar las fases de venta, sustitución y pausa. Preservar los dos pedidos, comprobantes, texto, hashes y estados antes del cierre para compararlos con el historial posterior de B.
3. Completar la recuperación funcional de A y B, privacidad, bloqueo, teclado y móvil antes de revocar A. Registrar métodos, fechas y evidencias; A pierde la posibilidad de repetir su comprobación después de la revocación. La comprobación de tercero puede seguir siendo la prueba HTTP existente, identificada como tal.
4. Congelar sólo el submissionId sintético, workspace/owner de A y `expectedGeneration:3`. No retirar otro servicio, revocar B ni borrar historial. Los cinco efectos API previstos son retirada, revocación, dos rechazos de A y lectura del historial de B; cero pagos o ejecuciones del proveedor adicionales.
5. Demostrar el presupuesto acumulado y margen para esos cinco efectos, incluidos Redis, payloads y tiempo. Conservar intentos anteriores y reservas consumidas. Cualquier resultado incierto, payload desconocido sin cota demostrable o agotamiento cierra la puerta.
6. Consumir la puerta tras los ACK confirmados y conservar las puertas de apertura falsas. Un ACK perdido conserva intención e identificadores; no repetir automáticamente retirada ni revocación.

Un recibo `APPROVED_SYNTHETIC_CLEANUP_ONLY` no significa `PASS_BROWSER`, `PASS_COUNTERS` ni aprobación de publicación. Hace falta revisar el código final y el recibo hospedado exacto antes de dar el dictamen de ejecución.

## Límites de la evidencia de navegador

CUA permite comprobar DOM y viewport, pero en esta sesión `performance` no está disponible y no hay captura completa de HTTP. Los logs deduplicados por UUID acreditan los costes API/Redis/SSR; no prueban los bytes de HTML/estáticos/redirecciones ni ausencia de reintentos del navegador. No poner `complete:true`, bytes cero o `automaticRetries:0` como si se hubieran medido.

Una cota conservadora para cleanup tiene que explicar qué tráfico cubre, qué hechos limitan su número y tamaño, y qué margen queda hasta los límites globales. Un valor elegido porque parece amplio no basta. Si esa cota no se puede demostrar con las superficies disponibles, dejar `canRetireSynthetic:false`; mantener el resultado funcional parcial sin ocultar la limitación.

Los atajos de zoom enviados no cambiaron DPR/viewport. Emular móvil, cambiar CSS o ampliar texto no acredita zoom real al 200 %. Registrar `nativeZoom200:PENDING_MANUAL` y `humanFreighter:PENDING_MANUAL`; ambos continúan como condiciones de apertura aunque el cleanup pueda completarse con sus propias pruebas.

## Validación local exigida al cambio de controles

- Funcionales completos y manuales pendientes permiten únicamente cleanup si su presupuesto está demostrado; todas las puertas de apertura siguen falsas.
- SHA, deployment, owner, servicio, generación, hash de informe, pausa o presupuesto incorrectos se rechazan antes de efectos.
- Certeza y bloqueo compartido siguen vigentes; un fallo posterior al primer efecto conserva evidencia y no produce replay.
- La comprobación posterior mantiene exactamente el historial de B y el rechazo de A, sin un pago o generación nuevos.

Revisión sin solicitudes externas ni lectura de credenciales privadas. No se modificó fuente de la aplicación.

## Dictamen de las observaciones hospedadas

`PASS_PUBLIC_FUNCTIONAL_BROWSER_RECEIPTS` para el SHA `a741937b6d389edbd333ff51bac95b68e654d40e`, replacement `dpl_DPiHiRDfYGxMUngmvweCxzCzvojX` y su origen exacto. Se ejecutó localmente `scripts/audit-usdc-browser-public.mjs` sobre los recibos públicos y snapshots AX redactados; no se abrió otra sesión ni se leyó el packet privado.

Ambas vistas muestran los dos pedidos y transacciones del recibo backend, sus participantes, precio USDC y estados distintos de entrega disponible y pago verificado con entrega fallida. A muestra perspectiva Venta y B Compra. Los snapshots de bloqueo de ambas identidades no contienen los pedidos, comprobantes ni texto entregado. Las observaciones registran apertura de la identidad del activo con teclado y foco en el enlace de transacción, sin abrir el explorador. El viewport pedido es 390×844; `documentWidth=clientWidth=375` y el marketplace mide 345, sin desborde horizontal observado. El input de acceso es password. El tiempo funcional observado es 16.186 ms; no equivale a medir todos los transportes.

Los textos visibles de A y B coinciden tras normalizar espacios, con SHA256 `53bc7db24239d2a9bbe4a98b86436e8a1c95d01788ada9bfe0f738a28e055464`. El export local añadido al recibo backend confirma ese mismo `displayWhitespaceNormalizedHash`; el recibo anterior se preservó en `usdc-sale-receipt-before-dom-hash.json`. AX colapsa espacios y saltos de línea: su representación tiene 485 caracteres/492 bytes, frente a los 490/497 del texto original acreditado por el backend, cuyo hash sigue `472769512dbfc531a0551986c36d725300c01d0f346f9aa6f1f28d005943d7b0`. No usar el hash normalizado como hash exacto de la entrega.

El inventario DOM posterior a B todavía contiene `vercel.live/_next-live/feedback/feedback.js`, `feedback.html` y `/.well-known/vercel/jwe`; el toolbar también aparece en las capturas. Leer `enablePreviewFeedback:false` en la configuración no prueba que esos recursos estén ausentes de esta sesión. La prueba funcional acredita filtrado por propietario y limpieza al bloquear, no ausencia de transporte o acceso de scripts de plataforma. Tampoco acredita ausencia de reenvíos reales del navegador.

**Cleanup: `PENDING_MEASUREMENT`, no aprobado para ejecución.** La cota modelada de HTML/estáticos/bootstrap/API no demuestra cobertura del tráfico adicional del toolbar/JWE ni de retransmisiones. El plan exige parar ante incertidumbre; por eso `canRetireSynthetic:false`, `hostedBrowserPassed:false` y `canOpen:false` se mantienen. La pausa compartida conserva cerradas altas y nuevas compras, y se conservan los registros y accesos A/B mientras falta el cierre sintético. Freighter humano y zoom real al 200 % permanecen `PENDING_MANUAL`.

El conciliador acepta un informe DOM parcial con `automaticRetries:null`, reserva configurada de cero reintentos, lista de intercambios vacía y tiempo observado. Suma ese tiempo sin inventar payloads, UUID leídos del navegador ni captura completa. Sus 37 escenarios locales y los tests del endurecimiento futuro del probe toolbar pasan con cero red/DPAPI. Ninguno de estos PASS locales convierte la evidencia parcial en aprobación de apertura o retiro.
