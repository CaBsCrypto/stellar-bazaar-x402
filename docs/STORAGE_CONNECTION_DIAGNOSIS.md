# Almacenamiento privado de Bazaar — estado del 8 de octubre de 2026

El almacenamiento configurado es **Cloudflare R2**, compatible con la API S3. No se identificó una cuenta ni un bucket de Amazon S3. El bucket `bazaar-deliverables` está en ENAM, clase Standard, sin dominio público y con su URL pública de desarrollo deshabilitada.

## Conexión comprobada

Vercel tiene, en Preview y Production, los cinco nombres `BAZAAR_S3_BUCKET`, `BAZAAR_S3_REGION`, `BAZAAR_S3_ENDPOINT`, `BAZAAR_S3_ACCESS_KEY_ID` y `BAZAAR_S3_SECRET_ACCESS_KEY`. Las dos credenciales se guardaron como sensibles, bajo autorización, y no están en Git. La presencia en configuración no demuestra por sí sola que un despliegue histórico las reciba; cada candidato debe comprobar el runtime y hacer una lectura autenticada del bucket.

El token `bazaar-vercel-deliverables` permite Object Read & Write únicamente en ese bucket. El token administrativo preexistente se conserva. La clave temporal `bazaar-local-validation-20261008`, utilizada para la validación local aislada y limitada al mismo bucket, **ya fue revocada**. Su copia `.vercel/r2-validation-secrets.json` también se eliminó bajo aprobación. Esta revocación no corresponde al token que utiliza Vercel.

CORS contiene únicamente el origen público `https://bazaar.browns.studio` y los orígenes exactos de las previews identificadas como `8fye` (anterior), `4k4` (candidato 520) y `ge8` (candidato final 094). Admite GET, HEAD y PUT, las cabeceras de contenido, checksum, escritura condicional y Range, y un preflight de 300 segundos. Los preflight comprobados para GET y PUT de la preview final devolvieron `204`; un origen ajeno obtuvo `403`. Una nueva preview requiere añadir su origen exacto antes de probar reproducción en navegador; no se usará un comodín ni un bucket público.

Las pruebas directas anteriores con subtítulos sintéticos comprobaron PUT/HEAD/GET/Range, checksum, bloqueo sin firma y CORS; su evidencia sanitizada está en `r2-storage-validation.json`. La repetición final sobre el candidato fijado `520ea2a835c96bece3317ae96a40a1c4e343d4ea` pasó 17 controles directos con PNG y VTT contra R2: bytes, tipo, tamaño, checksum, Range, firmas, vencimiento y rechazo de alteraciones y sobrescritura. Sus dos objetos se eliminaron en su ámbito sintético exacto. La evidencia saneada está en `docs/evidence/market-storage-isolated/storage-backend-validation.json`. Esto no demuestra un pago Testnet ni reproducción de video en una orden alojada.

La preview `4k4` del candidato 520 **pasó 16 comprobaciones alojadas**: configuración efectiva del runtime y conexión Redis/R2, cuentas públicas, consultas e historial privado, MCP y revocación del agente. Sus registros y consultas realizaron operaciones duraderas sobre Redis real del despliegue. Esto es distinto de la prueba local de Redis: la exportación local de credenciales sigue sin autorización y esa prueba no se ejecutó. El catálogo estaba vacío, por lo que no se ejecutó el rechazo de subida de una orden impagada usando al agente vendedor propietario; las comprobaciones alojadas no cierran ese caso ni el flujo completo de compra y entrega.

La preview final `ge8`, candidato `094ca7e7a5a68bd6a8998c3ce7cefb6935057bf5`, pasó la corrección del GET MCP/SSE con dos clientes del SDK oficial. Conservó las mismas huellas de espacios, identidad e historial de las dos cuentas y su aislamiento tras el despliegue. Son seis comprobaciones adicionales mediante 17 solicitudes, con acceso de operador a la preview protegida; todavía no demuestran acceso público externo. La evidencia está en `docs/evidence/demo-preview-sdk-delta-094ca7e.json`.

## Uso dentro de la aplicación

R2 se usa cuando la versión revisada de un servicio promete **archivos privados en Bazaar**. Una orden reserva capacidad antes de admitir el pago. Solo el agente del proveedor, después de un pago verificado y una reclamación propia, prepara los archivos de ese intento y versión inmutable. Recibe permisos de subida temporales y nunca las credenciales R2 ni las del comprador. La confirmación comprueba tamaño, tipo y checksum. Solo el comprador y su agente obtienen descargas temporales.

Los servicios de texto guardan su resultado en el historial privado. Los enlaces externos permanecen en el origen revisado del proveedor y muestran evidencia declarada; no se presentan como archivos verificados de R2. Las subidas generales de cuentas siguen cerradas.

Las capacidades, `/demo` y `/storage` muestran la disponibilidad efectiva. Se necesitan Redis duradero, prefijos independientes por entorno, las cinco variables R2, la bandera de archivos y la confirmación de una regla de ciclo de vida para objetos completados. Si falta una condición, la función explica por qué está deshabilitada. Cerrar la admisión de nuevas órdenes no impide recuperar una entrega existente mientras siga vigente y su almacenamiento esté disponible.

## Retención y capacidad

El límite es 50 MB decimales por archivo, 100 MB por cuenta y 5 GB globales, incluyendo reservas pendientes. La fecha visible se fija a siete días desde el registro del contenido o la creación de la orden; leer o reintentar no la renueva. El servidor deniega contenido vencido y el guardián retira contenido e índices, dejando solo controles técnicos mínimos de recuperación de pagos.

El borrado de R2 conserva una cola acotada con identificadores calculados mediante hash. Una respuesta de borrado incierta mantiene la reserva. Las confirmaciones repetidas y una espera de seguridad reducen carreras con subidas pendientes; no prueban por sí solas cuándo terminó una subida arbitraria. El ciclo de vida de objetos completados debe actuar como respaldo.

La regla preexistente que aborta multipart después de siete días **no elimina objetos completados**. Tras autorización específica se guardó y se comprobó activa la regla `bazaar-market-delivery-seven-days`: Delete objects after 7 day(s), limitada al prefijo exclusivo `market-deliveries/v1/`. Cloudflare puede demorar la eliminación física después del vencimiento: [documentación oficial](https://developers.cloudflare.com/r2/buckets/object-lifecycles/). La caducidad de una URL tampoco elimina el objeto.

El cron y su credencial requieren validación autenticada del despliegue. Una llamada manual correcta no demuestra una ejecución programada ni una limpieza física observada tras siete días.

## Validación pendiente

- Redis real local aislado con dos cuentas, reinicio, concurrencia, cuotas y vencimiento: no autorizado ni ejecutado. Las operaciones duraderas ya comprobadas en la preview no sustituyen esas pruebas locales específicas.
- Cliente MCP público externo sin acceso de operador: pendiente de la publicación autorizada; el SDK oficial y CORS ya pasaron en la preview final protegida.
- Rechazo de archivos para una orden impagada del vendedor propietario: pendiente porque la preview 520 tenía el catálogo vacío.
- Compra Testnet autorizada por separado para texto e imagen/video; comprobar pago, entrega, integridad, reproducción, respuesta perdida y recuperación sin pagar de nuevo.
- Autorización final de producción y recorrido desde un cliente público externo.

Los scripts de prueba simulan pagos solamente con dependencias locales. El despliegue no incluye un endpoint de simulación. No se contrataron planes, no se elevaron presupuestos y no se publicará producción como parte de una prueba de almacenamiento.
