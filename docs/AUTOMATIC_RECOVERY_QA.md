# Recuperación automática y estados claros

## Implementación

El cliente del piloto live reutiliza la recuperación después de un error con marcador de pago persistido. No dispone de un segundo camino de cobro en esa recuperación. Una nueva ejecución de execute con marcador previo también deriva a recuperación; no reinicia la compra.

Cada ejecución consulta como máximo tres veces, con esperas de 2 y 5 segundos. Los rechazos de acceso, petición inválida, inexistente o caducada detienen antes los reintentos. Al agotarlos, queda recovery-pending en disco para continuar después. La respuesta recibida se guarda antes de aceptarla y antes de registrar historial o manifiesto. Si ya existe respuesta local, se reintenta solo el guardado; si falla, queda storage-pending. Una operación stored con resultado conservado retorna sin modificar el estado ni escribir eventos.

Los nuevos eventos de estado usan el campo result ya existente y la API privada de actividad. No cambian endpoints ni esquemas públicos. El registro de estado local es obligatorio; publicar su estado al historial es de mejor esfuerzo. Si Bazaar no está disponible, el humano verá la última actualización recibida, no un éxito inventado; el estado local permite continuar luego.

El panel separa pago, entrega y última actualización recibida. Una comprobación informada por el agente se etiqueta «Verificado por el agente», sin convertirla en verificación independiente de Bazaar. Tener una referencia de transacción sigue siendo un pago reportado. Tener contenido conservado prima sobre una antigua indicación de recuperación pendiente. Sin contenido, no se muestra la etiqueta de entrega conservada.

## Preview corregido, sin compras

- Código del proveedor: 635f6c6.
- URL: https://website-intelligence-provider-itvkep8zu.vercel.app
- Despliegue: dpl_8Ar3wN9UJzHtyMGf4rCkSMkkqrys.
- X402_USE_PREVIEW_ORIGIN=true, X402_SETTLEMENT_ENABLED=false y WEBSITE_INTELLIGENCE_LIVE_ENABLED=false.
- Protección Vercel conservada; producción intacta.
- /health respondió 200 con x402.enabled=false. La ficha apunta al origen de este Preview. La solicitud live sin firma devolvió 503 LIVE_PAYMENT_NOT_ENABLED.
- Recuperación de la entrega histórica finalizada: mismo hash de informe y misma transacción. Esta comprobación NO demuestra la recuperación automática desde un fallo nuevo.

## Validación del 14 de septiembre de 2026

| Evidencia | Resultado y límites |
|---|---|
| Recuperación local | Tres consultas, esperas 2000/5000 ms, acceso rechazado, respuesta local prioritaria, fallo de guardado, continuación solo del guardado, marcador permanente y operación completada sin cambios: aprobado. No dependencia de pago. |
| Redis real y facilitador simulado | Prefijo aislado qa:auto-recovery:f276ec1b5a5e8a2eea92de33. Una preparación y una llamada simulada al facilitador. Se indujeron fallo al finalizar, pérdida de respuesta y fallo de guardado en Bazaar. Dos consultas de recuperación, después solo guardado. Mismo resultado desde otro proceso y token incorrecto rechazado. Una clave conservada; ningún pago real. |
| Aislamiento de Bazaar en Redis real | Propietarios qa_report_826afdc7e3c0411e932b6c92f53b9d03 y su par _other. Ocho reintentos concurrentes por almacenamiento, conflictos rechazados, versiones inmutables y original recuperado por otro proceso sin escrituras. Catorce claves aisladas permitidas; no se reinició Redis ni se usó S3. |
| Proveedor | 57 pruebas aprobadas, incluidas autorizaciones Soroban idénticas y diferentes. |
| Biblioteca | Compilación y regresiones de informes/entregas aprobadas. Estados pendientes revisados a 1280 y 390 píxeles con respuestas sintéticas: texto correcto, fecha recibida, teclado, bloqueo y reentrada; cero escrituras. |
| Informe comprado anteriormente | Una operación, una versión y seis eventos; original y transacción sin cambios, otro propietario rechazado. Recuperación de una operación completada no modifica su archivo local. |
| Preguntas | Informe conservado, selección, edición, copia/alternativa manual, teclado, bloqueo y reentrada aprobados en escritorio y móvil; cero solicitudes de escritura. |

## Reproducción

- Proveedor: npm run check en website-intelligence-recovery. La prueba integrada usa su compilación en work/build; ambos repositorios deben estar juntos, como en esta instalación.
- Bazaar: node scripts/test-automatic-recovery.mjs.
- Redis aislado: node scripts/test-automatic-recovery-redis.mjs --run-isolated-test. Lee únicamente las variables Redis seleccionadas de .env.local; conserva una clave sintética y un registro local de prueba. No llama a un facilitador real.
- Aislamiento del historial: node scripts/test-private-report-redis.mjs --run-isolated-test.
- Navegador local: node scripts/test-recovery-status-browser.mjs y node scripts/test-question-bridge.mjs --browser; configurar PLAYWRIGHT_MODULE y BROWSER_EXE cuando sea necesario y mantener activo el panel en 3214.
- Conservación histórica: node scripts/test-live-paid-saved-report.mjs.

No se hizo otra compra Testnet. La nueva recuperación automática está validada con fallos inducidos, Redis real y facilitador simulado. Su recorrido con una nueva transferencia real no se afirma ni se necesita para cerrar este bloque. S3 y proveedores nuevos siguen pendientes.
