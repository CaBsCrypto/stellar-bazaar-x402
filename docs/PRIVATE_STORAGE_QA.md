# Validación de Almacenamiento Privado y Recepción Visual — 19 de septiembre de 2026

## Objetivo y Alcance

Validación del ciclo completo de almacenamiento privado S3-compatible para archivos multimedia (imágenes y videos) entregados por agentes en Bazaar, utilizando activos de prueba explícitamente identificados y sin realizar pagos ni compras en Testnet.

## Activos de Prueba Generados

- **Ubicación:** `work/private-deliverables-fixtures/` (aislado mediante `.gitignore`).
- **Afiche de Prueba (`test-poster.png`):** Formato `image/png`, 6,172 bytes, resolución 1280x720. Checksum SHA-256: `3a572ee9eb3d12f8ec5306ad8d491f66997e75307171eeaf6ccb2c35cca32034`. Etiquetado: "Bazaar x402 - Afiche de prueba de almacenamiento y recepción visual (Sin valor comercial)".
- **Video de Muestra (`test-sample.mp4`):** Formato `video/mp4` (H.264/AAC), 75,463 bytes, 3 segundos a 720p. Checksum SHA-256: `95b5e3697819cefa088c24a05ee23db0124a671f36c42e01965be9dde013938f`.
- **Manifiesto:** `manifest.json` validado según el esquema `bazaar.deliverable/v1` con entrega de tipo `video` y afiche asociado.

## Resultados de Pruebas E2E (`scripts/test-private-storage-e2e.mjs`)

1. **Reserva y Autorización:** Manifiesto registrado en Redis con estado `pending` para los dos archivos.
2. **Carga y Verificación de Integridad:** URLs PUT prefirmadas generadas con cabecera `x-amz-checksum-sha256`. Verificación `HeadObject` comprobó longitud, tipo MIME y checksum SHA-256 antes de marcar `available` en Redis.
3. **Descarga y Streaming de Video:**
   - URL GET temporal prefirmada permitió descargar el afiche con coincidencia exacta bit a bit.
   - Peticiones parciales con cabecera `Range` respondieron con código 206, validando la capacidad de avance y rebobinado (*scrubbing*) en el reproductor de video.
4. **Aislamiento entre Propietarios:** Solicitudes de acceso desde un propietario no autorizado (`bob`) fueron rechazadas con 404/403.
5. **Cargas Corruptas e Interrumpidas:** Carga con bytes alterados fue rechazada con 409 (`FILE_INTEGRITY_MISMATCH`). El reintento de almacenamiento con los bytes correctos fue exitoso sin duplicar cuotas ni llamar a endpoints de pago.
6. **Preservación de Reportes:** Los informes estructurados previos en Redis permanecen intactos y accesibles.
7. **Invariante de Pagos y Mensajería:** Ninguna prueba ejecutó llamadas al facilitador x402, transacciones Testnet ni envío de mensajes externos.

## Distinción entre Entornos

- **Modo Desarrollo / CI:** `scripts/test-private-storage-e2e.mjs` incluye un servidor HTTP compatible con S3 que implementa PUT, HEAD y GET con soporte de Range headers y validación criptográfica en memoria.
- **Modo Cloudflare R2 / Nube:** Si las variables `BAZAAR_S3_BUCKET`, `BAZAAR_S3_ENDPOINT`, `BAZAAR_S3_ACCESS_KEY_ID` y `BAZAAR_S3_SECRET_ACCESS_KEY` están configuradas en `.env.local`, el script conecta directamente contra el bucket privado en la nube.
