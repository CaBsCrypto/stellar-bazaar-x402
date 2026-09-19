# Piloto privado de Website Intelligence

Este piloto conecta el flujo POST x402 existente con actividad, operación e informe en la biblioteca privada. El análisis del proveedor utiliza un fixture; una transacción Testnet real no convierte ese contenido en una auditoría de un sitio real. El informe conserva resumen, puntuación, hallazgos y el JSON original.

## Preparación local

La aplicación debe estar compilada. Redis se obtiene de las claves configuradas en `.env.local`; no se cambia esa configuración ni se crean buckets. `node scripts/website-report-pilot.mjs setup` crea un propietario aislado y dos accesos diferentes. Los archivos se conservan en `work/private-website-report-pilot`, ignorado por Git. El acceso humano está en `human-read-access.txt`; los accesos del agente y de recuperación permanecen en el directorio privado, nunca en la interfaz pública ni en la salida del comando.

`node scripts/website-report-pilot.mjs serve` inicia el panel en `http://127.0.0.1:3214/history`, solo en loopback, con el propietario del piloto y un segundo propietario vacío para probar aislamiento. No sustituye la configuración de cuentas de otra instancia.

`node scripts/website-report-pilot.mjs fixture` registra una compra simulada de importe cero con el informe fixture existente y sin asociar una transacción histórica como nueva compra. Se puede repetir con los mismos IDs.

## Compra única y recuperación

- `preflight`: consulta la ficha HTTPS canónica, comprueba destinatario configurado, hash de ficha, precio exacto 10000 atómicos, red Testnet, saldo y challenge asociado al input. No crea un firmante ni importa la semilla a uno. Lee únicamente las claves públicas seleccionadas de la configuración x402; el archivo que las contiene también contiene secretos y debe permanecer privado.
- `execute --acknowledge-exactly-one-payment --acknowledge-testnet-10000-atomic`: repite las comprobaciones, registra eventos iniciales, carga el firmante existente y permite un intento. Requiere el estado preparado y la autorización de compra del usuario. No usarlo como comprobación de salud.
- `status`: muestra estado de operación, resultado de almacenamiento y transacción, sin credenciales.
- `verify`: consulta la transacción ya realizada y comprueba la transferencia on-chain y el ledger del recibo. No firma ni paga; conserva la evidencia en el estado local.
- `store`: vuelve a registrar exclusivamente la respuesta local recibida usando los mismos IDs; no contacta al proveedor ni crea un firmante.
- `recover`: primero usa una respuesta local conservada; si no existe, solicita recuperación con la credencial del comprador. Nunca vuelve a ejecutar el endpoint de compra ni firma.

Antes de crear el pago se persiste un marcador en disco. Un bloqueo exclusivo impide la ejecución simultánea. Un proceso posterior rechaza otro pago si ese marcador existe. La respuesta del proveedor se conserva antes de registrar el historial; sus hashes y recibo se reconcilian. El éxito del cobro no se convierte en fallo de compra cuando Redis falla. La tarea solo termina cuando también se ha guardado el informe y sus eventos.

Una interrupción abrupta puede dejar `execution.lock`. Los comandos `store` y `recover` comprueban el PID y solo liberan ese bloqueo si el sistema confirma que el proceso terminó. Conservan siempre `run.json`, el marcador de pago, la respuesta y la credencial de recuperación. Si el estado del proceso es ambiguo, se detienen para revisión administrativa. El piloto no ofrece un reinicio que borre el marcador de pago.

La biblioteca sigue mostrando el pago como reportado, con enlace a la transacción. El runner consulta Horizon y verifica el sobre de la transferencia, incluidos pagador, destinatario, activo, importe y ledger, guardando evidencia por separado; no se atribuye al servidor de historial una verificación que no ha realizado. El original privado no se comunica al emulador WebMCP.

## Validación

`node scripts/test-website-intelligence-history.mjs` comprueba el adaptador y recuperación de fallos de registro. `node scripts/test-website-report-pilot.mjs` prueba persistencia del marcador y exclusión de ocho procesos simultáneos sin red ni pagos. `node scripts/test-private-report-redis.mjs --run-isolated-test` escribe datos mock en propietarios QA nuevos de Redis real y recupera el resultado desde otro proceso; no borra ni inspecciona claves de otros propietarios.

No se contrata almacenamiento adicional ni se publica el panel en esta fase. S3, adjuntos multimedia, comentarios y revisiones permanecen fuera de este piloto.
