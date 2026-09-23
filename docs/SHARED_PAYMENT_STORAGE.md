# Control compartido de liquidación — revisión local

## Implementación

El proveedor dispone de un almacén Redis de marcadores por operación. El comprador conserva su diario privado local. No se migraron compras anteriores ni se cambiaron contratos HTTP.

`X402_SETTLEMENT_STORE=redis` selecciona el almacén compartido. En esta entrega toda solicitud firmada en ese modo devuelve 503 SHARED_PAYMENTS_NOT_ENABLED antes de consultar al facilitador, incluso si el indicador de pagos está activo. No hay una variable que quite esa barrera. Su retirada requiere una revisión posterior de garantías y autorización de publicación. El modo local existente conserva archivos y restricciones de localhost.

Se reutiliza la instancia configurada por UPSTASH_REDIS_REST_URL/TOKEN o KV_REST_API_URL/TOKEN; no se creó otra base ni se publicaron identificadores privados. Prefijo reservado: bazaar:settlement:v1:testnet:swap-risk. Las pruebas usan bazaar:settlement:test:<UUID>, sin tocar historial ni operaciones anteriores.

El primer EVAL crea un marcador permanente y devuelve su propietario. Solo ese creador llama settle. El vínculo SHA-256 incluye payload y condiciones completas, con solicitud ligada en extra. Cambiar activo, importe, destino, red o entradas produce conflicto. No hay vencimiento, robo de bloqueo, borrado automático ni fallback a archivos.

Estados: started, uncertain y completed. La finalización compara propietario y vínculo atómicamente. Una respuesta perdida al guardar completed no puede degradarlo a uncertain. Si la escritura inicial no se confirma no se llama al facilitador. Un fallo posterior conserva started o uncertain y bloquea otros intentos.

## Garantías aún no acreditadas

El acceso real REST y EVAL funciona; las claves de prueba tienen TTL -1. INFO y CONFIG no están disponibles con las credenciales actuales. Esto NO acredita persistencia ante pérdida de infraestructura, política noeviction, respaldo ni recuperación.

Antes de habilitar una Preview con pagos, obtener evidencia del panel/control administrativo de esta misma instancia: política de persistencia, eliminación por memoria, retención, respaldos y procedimiento de restauración. Una restauración que pierda marcadores puede habilitar cobros repetidos: ante pérdida o restauración de estado, detener pagos y reconciliar evidencia externa antes de reabrir. No basta con un bloqueo distribuido o ausencia de TTL.

## Recuperación

Una operación completed devuelve el comprobante conservado sin liquidar. started/uncertain permanecen pendientes indefinidamente. No borrar marcadores, cambiar identificadores ni intentar otro activo para resolverlos. No se añadió endpoint de reconciliación ni transición automática desde datos reportados por el comprador. La resolución de incertidumbre requiere verificar transferencia, contrato, pagador, destinatario e importe y preparar una intervención específica revisable; hasta entonces el registro queda bloqueado.

## Evidencia — 22 septiembre 2026

`node scripts/test-shared-settlement.mjs`: Redis real, facilitador simulado, cero transferencias. Tres procesos concurrentes: una llamada; recuperación desde un proceso nuevo; rechazo de condiciones alteradas; caída antes de enviar (respuesta de claim perdida), respuesta del facilitador perdida, fallo de finalización, finalización aplicada con respuesta perdida, Redis inaccesible y ausencia de caducidad. Los registros aislados de prueba se conservan como evidencia, sin eliminación automática.

Regresiones test:xlm:pilot y test:history correctas. Consulta read-only de las compras históricas: una USDC y una XLM, mismos hashes, gateEnabled false. No se ejecutó buy ni se cargaron claves de firma en las pruebas compartidas.

Sin push, merge, despliegue ni habilitación de pagos. La revisión demuestra exclusión y recuperación del estado disponible, no durabilidad operativa garantizada del servicio Redis.

## Ampliación de revisión — 23 septiembre 2026

Se añadió validación del formato del marcador y comprobante antes de recuperarlo y una prueba HTTP entre procesos con Redis real y facilitador simulado. La inyección solo funciona con NODE_ENV=test, sin VERCEL y callback directo; el endpoint desplegable conserva el bloqueo. Ver PREVIEW_REVIEW.md para destino, configuración y evidencia administrativa pendiente. El código se consolida ahora en commits locales; las menciones previas a ausencia de commits corresponden al cierre anterior.
