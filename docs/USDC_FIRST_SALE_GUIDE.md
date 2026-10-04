# Primera venta de Guionista en USDC testnet

Estado: candidato de aceptación; apertura pendiente. El expediente debe acreditar
el recorrido hospedado y su revisión independiente. Además, una persona debe
completar la firma con Freighter antes de abrir a los tres devs previstos. Esta
guía no envía invitaciones ni autoriza nuevas compras de aceptación.

El producto nuevo entrega un guion algorítmico de texto de hasta 2000 caracteres,
para 15–30 segundos. Cuesta **0,01 USDC testnet**, pagados directamente a la wallet
del vendedor. Bazaar conserva el pedido, el pago verificado y la entrega reportada;
no cobra comisión ni custodia fondos. Los servicios anteriores conservan su ficha
y precio. USDT0 tiene pagos desactivados.

## Comprador

1. Abre tu espacio con su acceso humano o Magic Link y entra al marketplace de
   `/history`. Conserva el enlace de recuperación en privado. Freighter debe usar
   **Stellar testnet**; su cuenta necesita XLM testnet para reservas y comisión,
   una trustline autorizada y suficiente USDC testnet.
2. Elige el servicio aprobado «Guionista algorítmico de texto» y pulsa
   **Preparar compra**. Conecta Freighter en testnet e introduce, por ejemplo:

   ```json
   {"topic":"Presentar una startup","tone":"cercano","durationSeconds":20}
   ```

3. Comprueba precio, destinatario e **Identidad del activo**. Guarda la intención
   de compra y pulsa **Crear pedido sin pagar todavía**. Conserva el archivo y su
   referencia `operationId`; el pedido congela servicio, versión, contenido y pago.
4. En el historial, pulsa **Firmar y pagar 0.01 USDC testnet con Freighter**.
   Antes de aceptar, verifica comprador, destinatario, importe, emisor, red, memo,
   comisión y caducidad de la transacción. Una diferencia requiere detenerse y
   comprobar el pedido; la firma sintética del backend no sustituye esta prueba.
5. Pulsa **Actualizar marketplace** para consultar el seguimiento. **Pago
   verificado** acredita el pago; **Entrega disponible** añade el texto reportado
   por el vendedor. Un pago confirmado con **entrega fallida** conserva ambos
   hechos y no presenta la compra como completada.
6. Si se pierde la respuesta, conserva la referencia y actualiza el estado.
   Cuando aparezca, usa **Conciliar sin volver a pagar**. Una ejecución incierta
   requiere revisión del intento del vendedor; no iniciar otro pago para resolverla.

La identidad admitida es USDC de Circle en Stellar testnet:

- Emisor: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`
- SAC: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`
- Passphrase: `Test SDF Network ; September 2015`

## Vendedor y conexión MCP

1. En **Mis servicios**, prepara una ficha nueva con identificador propio, endpoint
   HTTPS, esquema de entrada, entrega `text/plain`, precio USDC testnet, identidad
   completa del activo y tu wallet destinataria. Guarda la intención de publicación
   y envíala a revisión.
2. Publica el contenido exacto de la prueba de control en el well-known mostrado.
   El operador verifica HTTPS, contrato y control del endpoint, revisa manualmente
   la ficha y la activa. Conserva el identificador de la publicación y su hash.
3. Tu trabajador corre fuera de Bazaar y se conecta a `<origen HTTPS>/api/mcp`
   con el acceso de agente de tu espacio. En Preview se requiere también el bypass
   de automatización, limitado al hostname autorizado. Mantén la protección de
   Vercel. Los tokens se inyectan en memoria privada; no van en URLs, argumentos,
   fichas, capturas o informes.
4. Para este producto usa `examples/guionista-marketplace-worker.mjs`: conserva una
   intención por pedido, reclama únicamente un pago verificado, invoca una vez
   `/v1/marketplace-text`, guarda texto y hash antes de registrar la entrega. El
   proveedor requiere su bearer propio y mantiene el producto desactivado por
   defecto hasta la configuración autorizada.
5. Una respuesta perdida del proveedor conserva el intento y registra
   `execution-uncertain` mediante `uncertain_market_order`. La recuperación es
   explícita; no vuelve a ejecutar el generador. Una entrega perdida permite
   volver a transmitir el mismo texto congelado tras inspeccionar el estado.
   Un fallo confirmado se declara con `fail_market_order` y conserva el pago.

El historial del vendedor contiene los datos necesarios de su venta, su entrega
y el comprobante; la conversación privada del comprador no se comparte.

## Recuperación, soporte y pausa

Tras sustituir el despliegue, entra con tu Magic Link y verifica las mismas
referencias, transacciones, textos y estados. **Bloquear espacio** elimina la vista
privada local; rotación y revocación invalidan los accesos anteriores.

Para soporte conserva `operationId`, hash de transacción, estado, despliegue y
fecha. No compartas seeds, tokens ni el Magic Link. El operador puede pausar
nuevas altas y compras de forma compartida entre despliegues; historial, entregas
y revocaciones se conservan. La reapertura requiere verificar la reversión y las
condiciones de aceptación del candidato.

## Comprobación humana de Freighter pendiente

El operador debe acordar un recorrido humano dentro del manifiesto vigente antes
de producir efectos adicionales. Registrar: conexión a testnet, visualización del
activo/emisor y destinatario correctos, firma aceptada por la wallet del comprador,
un único pago, entrega e historial privado de ambas partes, recuperación mediante
Magic Link, teclado, móvil y texto ampliado al 200 %. Guardar SHA, despliegue y
contadores sin secretos. No abrir mientras esta comprobación siga pendiente.
