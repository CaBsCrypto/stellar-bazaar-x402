# Puertas de aceptación de la demo pública Testnet

Este documento describe el candidato del checkout `beta-open-build`. La implementación y las pruebas locales no acreditan una publicación, una compra alojada ni el funcionamiento de Redis/R2 reales. Las evidencias históricas de otras versiones se conservan como antecedentes y deben identificarse con su candidato y entorno.

## Candidato y configuración

- [ ] Fijar el SHA final, el diff frente al despliegue actual, las versiones de Node/Next/MCP/x402 y el identificador del build. No publicar la punta mutable de una rama.
- [ ] Ejecutar `npm run demo:preflight` y consultar `get_bazaar_capabilities` en el despliegue. `lib/demo-configuration.ts` comprueba variables y prefijos mediante booleanos; esto no demuestra conectividad, permisos efectivos, cuota ni saldo.
- [ ] Verificar las cinco variables de R2 sin copiar valores al expediente: bucket, región, endpoint, identificador de acceso y clave secreta. Revisar que las credenciales permitan únicamente las operaciones necesarias en el bucket privado.
- [ ] Registrar huellas de los prefijos de cuentas, revisión, órdenes y objetos de preview y producción. La etapa del prefijo debe coincidir con el despliegue y las huellas de ambos entornos deben diferir. `BAZAAR_DEMO_NAMESPACE_ENV` no prueba por sí solo que no compartan datos.
- [ ] Verificar Redis real, cuota actual de Upstash, CORS del origen exacto de la nueva preview y permisos R2 con datos sintéticos en un prefijo nuevo: subida, HEAD, tamaño/tipo/checksum, descarga completa, lectura parcial y eliminación.
- [ ] Mantener independientes el registro (`BAZAAR_WORKSPACE_CREATION_PAUSED`), la admisión de compras (`BAZAAR_ENABLE_MARKET_PURCHASES`) y los archivos privados (`BAZAAR_MARKET_FILES_ENABLED`). Conservar lectura y recuperación de operaciones existentes al cerrar nuevas admisiones. No desactivar el marketplace completo para cerrar solamente compras.
- [ ] Confirmar ausencia de wallet de servidor, payer local, configuración Mainnet y bypass de pago. La inyección de dependencias de los tests es interna a los módulos; no se habilita por argumentos HTTP/MCP ni por un flag de pago simulado.
- [ ] No cambiar planes, presupuestos o pausa automática de Vercel. Presentar consumo real y margen disponible antes del evento; Testnet no elimina costes de alojamiento.

## Contratos y controles que se deben comprobar

| Control | Implementación que revisar | Aceptación necesaria |
|---|---|---|
| Cuenta y permisos | `lib/workspace-store.ts`, `lib/workspace-http.ts`, `lib/demo-wallet.ts` | Dos cuentas independientes, revocación y recuperación, firma incorrecta/expirada/repetida, consultas y órdenes ajenas rechazadas. Vincular wallet es opcional; cada orden fija su pagador. |
| Catálogo y habilidades | `lib/service-card-schema.ts`, `lib/market-price.ts`, `lib/marketplace.ts`, `lib/marketplace-mcp.ts` | Solo fichas activas con revisión y control del endpoint. Instrucciones públicas versionadas y acotadas a 8 KB. Leer es gratuito; ejecutarlas no autoriza código de terceros ni cambia el precio del servicio. |
| Pago | `lib/marketplace-x402.ts`, `lib/marketplace-x402-store.ts`, `lib/marketplace-capacity.ts` | USDC oficial de Stellar Testnet, precio entero con hasta siete decimales y autorización del pagador de la orden. Rechazar activo/red/destinatario/precio/contenido alterados y credenciales reutilizadas. Persistir capacidad y estado antes de contactar al facilitador. |
| Archivo por orden | `lib/market-file-delivery.ts`, `lib/market-file-delivery-schema.ts` | Orden pagada, proveedor propietario y claim original. Preparar/confirmar misma versión, verificar tamaño/tipo/SHA-256, descarga solo de comprador o su agente. No entregar credenciales R2. La modalidad declarada y su reserva son inmutables. |
| Capacidad | `lib/workspace-admission.ts`, `lib/marketplace-capacity.ts`, `lib/market-file-delivery.ts` | Cuotas atómicas incluyendo reservas y limpieza pendiente: 50 MB por archivo, 100 MB por cuenta, 5 GB globales y hasta 10 archivos. 200 registros/día y hasta 200 por IP/hora; 60 solicitudes/cuenta/minuto y 120 globales/minuto. El límite existente adicional por IP/minuto y el techo diario global siguen vigentes: revisar capacidades efectivas. `429` incluye reintento y falta de almacenamiento/capacidad devuelve `503`. |
| Vencimiento y recuperación | `lib/market-retention-schema.ts`, `lib/market-maintenance.ts`, `lib/market-guardian.ts` | Negar contenido a los siete días desde su registro, sin renovar el vencimiento al leer. Eliminar contenido, texto e índices; conservar únicamente controles mínimos sin prompts/resultados para pagos inciertos y duplicados. Un `410` propio puede devolver estos controles; una cuenta ajena obtiene `404`. Reconciliar consulta la cadena y no reenvía pagos. |

Para una orden nueva con modalidad `bazaar`, `createMarketOrder` consulta la disponibilidad del bucket antes de reservar/admitir. Un HEAD satisfactorio no garantiza que un fallo posterior sea imposible ni prueba permisos de subida/descarga/eliminación; esas operaciones requieren su aceptación real. Las modalidades `text` y `external` no deben depender de R2. Un enlace externo conserva evidencia declarada por el proveedor y se limita a su origen; no se presenta como integridad verificada por Bazaar.

La limpieza requiere dos eliminaciones confirmadas separadas por la gracia de 15 minutos antes de liberar la reserva de archivos. No hay prueba de finalización de una subida arbitraria en curso por esperar esa gracia. Configurar el ciclo de vida de R2 como respaldo y verificarlo antes de declarar `BAZAAR_MARKET_FILE_LIFECYCLE_ACK=true`: la eliminación física puede demorarse. La fecha límite de acceso permanece fija aunque la eliminación falle.

- [ ] Verificar `/api/market/guardian` con acceso de operador y rechazo anónimo. El guardián muestra incidentes y mantiene la suspensión de proveedores bajo decisión humana.
- [ ] Verificar un tick alojado autenticado y su programación. `vercel.json` programa `/api/market/guardian/tick`, pero un cron declarado no prueba su ejecución ni su autorización. Configurar `CRON_SECRET` con la credencial privada cuyo hash coincide con `BAZAAR_MARKET_OPERATOR_HASH`, sin guardarla en evidencias. El tick exige GET, ruta exacta, HTTPS en el despliegue, ausencia de Origin y autenticación; admite el hostname del despliegue aunque la página pública use otro dominio. Comprobar compatibilidad de la frecuencia con el plan existente y rotación justa ante reconciliaciones o eliminaciones que fallen, sin contratar otro plan.
- [ ] Confirmar que `/api/buyer-execution/reference` devuelve `404` para todos los métodos y que el build no importa `scripts/fixtures`. El antiguo simulador permanece solo en scripts locales y no puede producir evidencia de pago alojado.

## Evidencias por etapa

Cada resultado debe registrar SHA, entorno, fecha, IDs sintéticos, prueba ejecutada, resultado y pendientes. Saneamiento obligatorio: sin tokens, seeds, firmas de pago, URLs firmadas, claves o resultados privados de usuarios reales.

1. **Local:** tipos/build y pruebas relevantes; `scripts/test-market-card-contract.mjs`, `scripts/test-open-market-mcp.mjs`, `scripts/test-marketplace-x402-buyer.mjs`, `scripts/test-market-file-client.mjs`, `scripts/test-market-recovery.mjs`, `scripts/test-market-capacity.mjs`, `scripts/test-market-files.mjs`, `scripts/test-market-file-retention.mjs`, `scripts/test-workspace-retention.mjs`, `scripts/test-demo-configuration.mjs` y `scripts/test-no-hosted-payment-fixtures.mjs`. Identificar explícitamente dobles Redis/R2, pagos simulados y reloj controlado. Ejecutar además la integración Redis/R2 reales en namespaces sintéticos aislados; los dobles no prueban persistencia externa.
2. **Preview:** registro público desde un cliente externo, `initialize`, `tools/list`, capacidades, credencial propia, catálogo/habilidades, revocación, aislamiento y rechazo de subidas para una orden impagada. Probar pérdida de respuestas, corrupción, interrupciones, cuota agotada y fallos de almacenamiento exclusivamente con datos sintéticos aislados. No desplegar un bypass de pago para completar esta etapa.
3. **Compra Testnet autorizada:** presentar previamente los servicios exactos, cantidad, precios e importe total para autorización separada. Usar una wallet controlada por el comprador. Probar un servicio de texto y un servicio con imagen/video; conservar tx, entrega, manifest/checksum, recuperación sin otro pago, reproducción y rechazo de enlaces vencidos. Una firma local correcta no sustituye una transacción confirmada en el despliegue.
4. **Producción autorizada:** presentar candidato inmutable, configuración saneada y evidencias de preview/Testnet. Tras autorización, publicar una sola versión y comprobar sin acceso de operador: QR → cuenta → MCP → consulta → orden → pago → entrega → historial privado. No reutilizar pruebas locales como validación de producción.

## Entrega del escenario

- [ ] QR del dominio efectivamente publicado y URL MCP `/api/mcp`, comprobados desde otro cliente.
- [ ] Configuración de cliente con token en cabecera privada; instrucciones de wallet y presupuesto máximo explícito, compra y proveedor en `public/BUYER.md`, `public/SELLER_AGENT_KIT.md` y `public/MARKETPLACE_PILOT.md`.
- [ ] Ejemplo de archivos y recuperación en `docs/MARKET_FILE_AGENT_GUIDE.md`; el helper congela resultados ya producidos y no ejecuta instrucciones de proveedores.
- [ ] Evidencia del candidato sobre transacción, entrega, privacidad y capacidad; no una captura del bucket o una compra histórica de otro candidato.
- [ ] Señal visible de Testnet, registro gratuito sin membresía y publicación de nuevos proveedores únicamente tras revisión manual.

La demo solo se declara aceptada cuando un usuario nuevo termina ese recorrido alojado sin intervención del operador, salvo la revisión de proveedores. Hasta entonces, publicar el estado real y los pendientes de cada etapa.
