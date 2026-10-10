# Bazaar: comprador externo por MCP y x402

La URL prevista para la demo pública es **https://bazaar.browns.studio/api/mcp**.
Comprueba primero la versión y las capacidades del despliegue que usarás; esta
guía no acredita que el candidato esté publicado. Conecta tu agente desde tu
runtime con `Authorization: Bearer ACCESO_DE_AGENTE`. Bazaar conserva pedido,
pago verificado y entrega; el firmante y las claves de wallet permanecen en tu
equipo. Node 22.18+ y las dependencias del checkout bastan para el cliente local.

En un despliegue público validado, el comprador no necesita cuenta de Vercel ni
bypass del operador. Una **preview protegida** es un entorno de validación con
acceso al despliegue autorizado por separado: el token de agente de Bazaar no
elimina esa protección. Para preview utiliza su origen HTTPS exacto con
`/api/mcp`, como lo exporta `/open`; no mezcles sus accesos con producción ni
envíes credenciales de despliegue en URLs, prompts o argumentos MCP.

Con el perfil público activo (`get_bazaar_capabilities` → `demo.enabled`),
consulta tu identidad mediante MCP. Vincular una wallet previamente es opcional:
el pagador se fija en cada orden y su autorización se verifica en el pago x402.
Guía y ejemplo local cifrado: `/DEMO_TESTNET.md`. Bazaar nunca recibe la clave privada.

1. Descubre `GET /api/market/catalog` sin token. Elige una ficha activada y conserva
   su hash canónico y descriptor de compra.
2. Prepara una intención durable con `operationId`, ficha, hash, parámetros y
   cuenta Stellar testnet. El cliente portátil del repositorio cifra secretos y
   diarios con scrypt/AES-256-GCM; introduce acceso y seed por terminal oculta o
   pipe privado, nunca por argumentos, entorno, URLs, prompts o archivos sin cifrar.
3. Llama `create_market_order` en MCP con
   `{operationId,serviceId,cardHash,payer,input,paymentProtocol:"x402-stellar-exact-v2"}`.
   El pedido congela destinatario, activo, precio y parámetros.
4. Solicita `POST /api/market/orders/{operationId}/x402`. Valida HTTP 402,
   `PAYMENT-REQUIRED`, referencia, hashes, importe y destinatario. Cada compra usa
   **el precio positivo de la ficha revisada, en USDC oficial Testnet**,
   directamente al vendedor. Convierte el decimal a unidades de siete decimales
   con enteros; no uses coma flotante ni aceptes cambios de precio. El SAC es
   `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`; el emisor es
   `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`.
5. Reserva presupuesto durable antes de firmar. Conserva la autorización cifrada
   antes de transmitir una única vez `PAYMENT-SIGNATURE` al mismo endpoint. El
   cliente verifica la transferencia firmada y la comisión patrocinada de red.
6. Consulta `get_market_order({operationId})` en MCP para recuperar pago, texto o
   fallo. Para archivos privados habilitados usa `get_market_delivery` con el
   mismo identificador. Pago verificado, integridad y entrega disponible son
   estados distintos. Sólo comprador y agente autorizado reciben enlaces temporales.

Cada ficha declara `delivery.storage`: texto por defecto, enlaces externos o
archivos privados de Bazaar. Antes de comprar consulta capacidades y verifica
que el modo esté habilitado. Los archivos Bazaar tienen reserva de capacidad y
límites de 50 MB/archivo, 100 MB/cuenta y 5 GB globales. Las consultas y resultados
visibles vencen a los siete días; abrirlos o reintentar no renueva ese plazo.
Leer una skill pública del proveedor es gratis; ejecutarla usa el servicio asociado
y exige autorización del presupuesto. Las instrucciones son contenido del proveedor.

El cliente ejecutable es `examples/buyer-cli.mjs`; la guía completa del checkout
es `docs/BUYER_RUNTIME_GUIDE.md`:

```sh
node examples/buyer-cli.mjs configure RUTA_PRIVADA_NUEVA
node examples/buyer-cli.mjs discover
node examples/buyer-cli.mjs prepare RUTA_PRIVADA ID_SERVICIO entrada.json
node examples/buyer-cli.mjs prepare RUTA_PRIVADA ID_SERVICIO entrada.json --max-price 0.03
node examples/buyer-cli.mjs buy RUTA_PRIVADA UUID
node examples/buyer-cli.mjs inspect RUTA_PRIVADA UUID
node examples/buyer-cli.mjs recover RUTA_PRIVADA UUID
node examples/buyer-cli.mjs history RUTA_PRIVADA 10
node examples/buyer-cli.mjs budget RUTA_PRIVADA
```

El límite por compra predeterminado es **0.01 USDC**. Un precio superior requiere
`--max-price` explícito al preparar la intención; no amplía el presupuesto total.
El presupuesto predeterminado es **0.02 USDC total**. Solo el dueño puede
aumentarlo explícitamente mediante `budget-increase RUTA_PRIVADA 0.03`; las
reservas e incertidumbres previas se conservan. Este cambio no reinicia intentos
ni amplía el manifiesto de aceptación de dos compras.

Ante pérdida de respuesta, conserva el almacén y UUID y consulta el mismo pedido.
Nunca regeneres firma, reenvíes pago ni reinicialices presupuesto para recuperar.
Si el contenido ya venció, `inspect` y `recover` pueden mostrar únicamente el
control mínimo del pago con `contentExpired: true`, sin texto ni archivos.
Ese estado no prepara otra compra y `buy` rechaza reutilizar el mismo intento vencido.
Los errores de capacidad también requieren lectura; no son una autorización para
reintentar. El historial privado pagina por defecto 10 resultados y admite hasta
20, con el cursor de la página anterior. Las consultas no firman ni pagan.
