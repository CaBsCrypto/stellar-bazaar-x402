# Supervisor local del proveedor de texto

`examples/seller-marketplace-supervisor.mjs` encadena el `watch` existente para
atender compradores nuevos sin ejecutar manualmente cada orden. **Preparar el
código no inicia el proceso.** Su arranque y sus límites deben estar autorizados
por el dueño del proveedor. No paga, despliega ni cambia la admisión en Bazaar.

Necesita el almacén cifrado creado por el kit vendedor, con `seller-config`:
`bazaarOrigin`, `ownerId`, `agentId`, ficha/hash, `allowedOrigins`, `controlProof`,
acceso propio de agente y Bearer independiente del runtime. El destino público
de cobro está en la ficha; el supervisor no necesita una clave privada de wallet.

Ejemplo de arranque **pendiente de autorización**, en el equipo del proveedor:

```sh
node examples/seller-marketplace-supervisor.mjs RUTA_PRIVADA --hours 24 --max-sessions 144 --max-mcp-requests 3000 --max-provider-requests 50
```

La contraseña se introduce por terminal oculta. Un broker privado puede agregar
`--secret-stdin` y entregar únicamente `{"password":"..."}` por un pipe heredado;
nunca por argumentos, entorno, shell history o archivos sin cifrar. DPAPI puede
proteger el perfil del broker en Windows; este script no extrae credenciales de
Vercel ni lee un perfil DPAPI automáticamente.

Cada sesión usa un cliente MCP, hasta diez consultas separadas por al menos un
minuto y un límite de mil solicitudes, reducido al presupuesto restante. Antes
de admitir otra orden exige margen para sus herramientas de entrega. Tras un
cierre normal `bound`, espera
otro intervalo y abre la siguiente sesión. Los máximos del evento son 24 horas,
1.440 sesiones, 5.000 solicitudes MCP y 200 solicitudes de generación; pueden
reducirse. Los contadores se guardan antes de contactar al transporte y pueden
incluir un intento que no alcanzó el servidor. El plazo, límites y vinculación
se conservan en `seller.supervisor`; reiniciar no renueva presupuesto o plazo.

Sólo procesa órdenes pagadas del dueño, agente y ficha configurados. Reutiliza
el diario `seller.OPERATION_UUID`, su intento estable y el cursor `seller.scan`.
El lock `seller.watch` impide otro watcher sobre el mismo almacén. Una ejecución
incierta, cuota, fallo o diario existente sin resolver **detiene el supervisor**;
no reinicia esa sesión ni ejecuta de nuevo. Emite una alerta con códigos y
contadores, sin credenciales, entradas o resultados privados. Un estado terminal
o de proceso interrumpido requiere revisión del dueño. No borrar locks/diarios
ni crear otro almacén para reiniciar contadores; recuperar el intento original.

Para una preview protegida, el operador puede usar la API
`runSellerSupervisor({store,fetcher,providerFetcher,...limites})`. `fetcher` es
transporte privado auditado para el endpoint exacto de Bazaar; `providerFetcher`
es independiente y sólo recibe el Bearer del runtime en el origen del proveedor.
El CLI público no añade bypass de Bazaar. No presentar esta conexión protegida
como aceptación pública.

El guionista recibe `POST /v1/marketplace-text` con
`{operationId,attemptId,input:{topic,tone,durationSeconds}}`. Requiere
`BAZAAR_MARKETPLACE_TEXT_ENABLED=true` y
`BAZAAR_MARKETPLACE_WORKER_TOKEN_SHA256=sha256(Bearer_del_runtime)` en su hosting.
Devuelve texto de 1..2.000 caracteres con SHA-256 y motor algorítmico; no genera
MP4 ni ejecuta el HTML del teleprompter. El worker comprueba el pago por MCP antes
de llamar esa ruta; no solicita un segundo pago al endpoint legado.

La máquina debe permanecer **encendida, conectada y sin suspensión** durante el
evento. Desplegar el endpoint en Vercel no instala este consumidor de órdenes.
Antes del Go deben probarse proceso vivo y una compra autorizada que llegue a
entrega sin ejecución manual. Al detenerse por plazo, límite o fallo, el dueño
debe revisar la alerta y cerrar nuevas compras del servicio si ya no atenderá
pedidos; el supervisor no modifica la publicación por sí mismo.

`node scripts/test-seller-supervisor.mjs` usa HTTP simulado con el SDK MCP real,
un reloj controlado y persistencia cifrada local. No inicia un daemon, no llama
a la nube y no acredita transacciones ni disponibilidad del despliegue.
