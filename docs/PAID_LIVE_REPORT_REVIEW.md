# Revisión: informe real pagado y conservado en Bazaar

Estado: implementación local; publicación y nueva compra Testnet pendientes de revisión final. No se ha ejecutado un nuevo pago durante este bloque.

## Recorrido

El cliente solicita mode=live, español, https://example.com. El proveedor prepara y conserva el informe derivado del HTML y su hash antes del cobro. Un marcador duradero impide repetir el intento. La recuperación exige acceso privado y evidencia de la transacción original. El cliente conserva la respuesta antes de escribir actividad, operación y manifiesto en Bazaar. Resultado permite explorar el informe y preparar una pregunta editable para copiar al chat.

El original, los identificadores y el comprobante permanecen asociados. Los errores de Redis permiten repetir exclusivamente store; recover obtiene el mismo informe, sin nuevo análisis ni pago. El estado nuevo vive en work/private-website-live-paid-pilot, separado del piloto anterior. Nunca se versionan estos archivos privados.

## Comprobaciones y evidencia

| Categoría | Evidencia | Alcance |
|---|---|---|
| Proveedor local | npm run check: 55 pruebas aprobadas | HTML completo/incompleto, destinos y redirecciones inseguros, límites, pago deshabilitado, preparación fallida, concurrencia, pago incierto, recuperación y autorización. Facilitador simulado. |
| Redis real del proveedor | scripts/test-live-redis.mjs --run-isolated-test: aprobado | Ocho solicitudes, una preparación, una llamada simulada al facilitador; recuperación idéntica desde otro proceso; token incorrecto rechazado. Prefijo aislado qa:website-live:5899605509ebe10eec9a2938, una clave conservada. Ninguna transferencia. |
| Cliente | scripts/test-paid-live-client.mjs y test:website-report | Modo, URL, evidencia, origen de revisión explícito, enlace del manifiesto y protección del estado anterior. |
| Biblioteca | Pruebas de actividad, entregas e informe guardado | Evidencia histórica documentada en HUMAN_ACTIVITY_PANEL_QA.md, INTERACTIVE_DELIVERIES_QA.md y WEBSITE_REPORT_PILOT_QA.md. |
| Consulta web real anterior | WEBSITE_LIVE_REPORT.md | example.com consultado y conservado sin compra. No demuestra el nuevo flujo pagado. |
| Escritorio, móvil y teclado | scripts/test-question-bridge.mjs --browser | Informe anterior recuperado; copia, límite, selección manual y bloqueo. No demuestra un informe comprado con esta nueva versión. |
| Testnet histórico | WEBSITE_REPORT_PILOT_QA.md | Compra anterior de datos de prueba. No reutilizar su marcador ni presentarla como compra live. |
| Nuevo piloto Testnet | Pendiente | Se cerrará únicamente al verificar transferencia y abrir el nuevo informe live desde el panel. |

## Revisión antes de publicar

Destino propuesto: un despliegue Preview del proyecto Vercel existente website-intelligence-provider, desde la rama codex/durable-buyer-recovery. No promover producción. La versión conserva compras live deshabilitadas por defecto; la configuración del despliegue debe revisarse explícitamente, con Redis privado del proveedor. La biblioteca sigue local y privada.

La URL exacta de Preview y su hash de ficha se conocerán después de crear el despliegue. Antes de habilitar y efectuar la nueva compra se revisarán nuevamente esos valores y los siguientes límites:

- Página: https://example.com; idioma: español; mode: live.
- Red: Stellar Testnet; máximo y monto esperado: 0,001 USDC (10000 unidades atómicas).
- Destinatario esperado: GAHOZFSDG2DW32FOUUP6XA4SMN3OCR7NOUXHAPYFN47BLJX56GJ3WCSM.
- Activo esperado: CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA.
- Ruta: POST /v1/x402/audits; ficha live 1.2.0; entrada y ficha enlazadas al comprobante.
- Cualquier cambio de origen aprobado, ficha, destinatario, activo o importe detiene el cliente.

## Operación después de la aprobación correspondiente

Configurar WEBSITE_INTELLIGENCE_LIVE_PROVIDER_ORIGIN y WEBSITE_INTELLIGENCE_LIVE_APPROVED_CARD_HASH con los valores revisados. El destinatario aprobado y los accesos permanecen en configuración privada.

1. node scripts/website-live-paid-pilot.mjs preflight: sin firma ni pago; prepara el informe remoto y conserva identidad local antes de la solicitud.
2. Revisar la salida y solicitar la autorización final del pago.
3. node scripts/website-live-paid-pilot.mjs execute --acknowledge-exactly-one-payment --acknowledge-testnet-10000-atomic: solo tras autorización final.
4. Si hay incertidumbre, usar recover y evidencia de cadena; nunca borrar el marcador para repetir execute. Si la copia ya existe, store reintenta solo el registro.
5. verify confirma la transacción. Abrir /history, comprobar las tres pestañas, preparar pregunta, bloquear, volver a entrar y recuperar desde un proceso nuevo.

La recuperación remota caduca a las 24 horas; la entrega copiada a la biblioteca permanece. S3, nuevos proveedores, publicación de la biblioteca y envío directo al chat quedan fuera del bloque.

## Commits y cierre de la revisión local

- Proveedor: 2450694 integra el análisis HTML real; 11737bb añade preparación duradera, intento único, recuperación y pruebas.
- Bazaar: 9f40059 conserva fichas y destinatarios; e13fd4d consolida biblioteca, actividad y preguntas; f693b6d añade el cliente aislado del nuevo piloto.
- Confirmación final: build de Bazaar aprobado; test:activity, test:deliverables, test:provider-card, test:website-report y test-paid-live-client aprobados.
- Navegador: 1280 y 390 píxeles, teclado, edición, copia y alternativa manual, bloqueo y recuperación aprobados; cero solicitudes de escritura.
- Recuperación desde proceso nuevo: informe histórico pagado mantiene una operación, una versión y seis eventos; informe real anterior sin pago mantiene cinco eventos. Ambos rechazan otro propietario.
- El proveedor queda limpio en su rama de integración. Los dos cambios locales del ejemplo fast-provider-template se conservan fuera de estos commits.
- No se publicó ni se realizó un nuevo pago. El criterio de éxito completo sigue pendiente del piloto Testnet aprobado.

## Seguimiento del 14 de septiembre de 2026

- Proveedor 11737bb: las 55 pruebas se ejecutaron nuevamente y aprobaron.
- Vercel: sesión existente y proyecto vinculado comprobados. El intento de crear Preview fue rechazado por la revisión automática antes de ejecutarse; no existe un nuevo despliegue de este bloque. Se requiere aprobación explícita para enviar el código de esta rama al proyecto website-intelligence-provider, con X402_SETTLEMENT_ENABLED=false y WEBSITE_INTELLIGENCE_LIVE_ENABLED=false, sin promoción a producción.
- La compra nueva permanece pendiente; ninguna autorización de publicación sustituye la revisión final del pago.
- Ejemplo fast-provider-template revisado: elimina el destinatario fijo, exige la cuenta pública del proveedor y comprueba su checksum; la ficha requiere configurar la misma cuenta antes de publicar.
- S3 privado no está configurado. No se afirma carga/descarga real ni se presentan ejemplos multimedia como compras reales. Nuevos proveedores quedan después del recorrido completo.

## Preview autorizado y validado — 14 de septiembre de 2026

Tras autorización explícita del usuario, se desplegó el commit del proveedor 11737bb en Preview del proyecto website-intelligence-provider. El rechazo anterior quedó resuelto con esa autorización; no se promovió producción.

- URL: https://website-intelligence-provider-iash50mn7.vercel.app
- Despliegue: dpl_5tYbWYVcCZDcpH2D6Qw2wkVjCm5e. Estado Vercel: Ready; target: preview.
- X402_SETTLEMENT_ENABLED=false y WEBSITE_INTELLIGENCE_LIVE_ENABLED=false fijados en este despliegue.
- GET /health: 200, x402.enabled=false, executionMode=disabled.
- POST /v1/x402/audits con mode=live, español, example.com y sin firma: 503 LIVE_PAYMENT_NOT_ENABLED.
- POST /v1/audits con mode=live: 403 LIVE_USE_PAID_ENDPOINT.
- POST /v1/x402/audits/recover con cuerpo vacío: 400 RECOVERY_REQUEST_INVALID. Esto comprueba rechazo de formato, no autenticación de una entrega existente.
- Ficha deshabilitada: 1.0.0, payment.enabled=false, hash 21d9d48b73232a10b8c1cef2f5f9d9e429ce95a081fc5147986f4b6c283e123e. Este NO es el hash aprobado de la futura ficha live.
- Las variables privadas de Redis y facilitador existen en Preview. No se leyeron sus valores. Su presencia no demuestra conectividad desde este despliegue.
- Vercel protege el Preview; la verificación utilizó la sesión autenticada existente y el acceso de protección gestionado por su CLI. Ningún acceso privado se incluye aquí.

Antes de habilitar live, configurar el origen y su lista permitida para el Preview: la ficha deshabilitada aún hereda resourceUrl del dominio de producción. No ejecutar el comprador con ese enlace. La configuración live modificará la ficha y su hash; revisar los valores finales antes de firmar. El cliente también necesitará acceso autorizado a la protección del Preview sin reenviarlo al proveedor analizado.

No se firmó ni se ejecutó un pago. La siguiente etapa es activar/configurar el piloto exclusivamente en Preview y realizar el preflight sin firma; después presentar la URL, ficha, destinatario, activo e importe exactos para autorización final del pago.
