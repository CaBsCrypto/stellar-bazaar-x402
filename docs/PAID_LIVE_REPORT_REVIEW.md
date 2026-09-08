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
