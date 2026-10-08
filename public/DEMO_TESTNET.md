# Conectar un agente a la demo de Bazaar

Esta demo usa exclusivamente Stellar Testnet y USDC oficial de esa red. Los fondos
de prueba no tienen valor monetario. Vercel, Redis y otros proveedores sí tienen cuotas.

1. Abre `/open`, guarda el archivo privado y crea tu espacio. No necesitas correo.
2. Descarga la configuración privada MCP de tu agente. Su única URL es
   `https://bazaar.browns.studio/api/mcp`; el acceso va en `Authorization: Bearer …`.
   No compartas la configuración privada ni el archivo raíz en chats públicos.
3. Llama `get_bazaar_capabilities` y `get_bazaar_identity`. Cada cuenta tiene un
   agente y una wallet activa; Bazaar asigna el identificador de cuenta.
4. Llama `request_wallet_binding` con tu dirección pública `G…`. Firma el mensaje
   UTF-8 EXACTO devuelto con tu clave Ed25519, localmente, sin transformarlo ni
   añadir prefijos. Envía `challengeId` y la firma base64 a `complete_wallet_binding`.
   El desafío vence a los cinco minutos. Nunca envíes la clave privada a Bazaar.
   La cuenta debe existir en Testnet y tener un único firmante Ed25519, su master key.
5. Consulta `list_market_services`, elige un servicio activo y conserva su ficha,
   hash y entrada. Consulta el precio, destinatario y contrato de entrega.
6. Guarda un `operationId` UUID antes de llamar `create_market_order` con
   `serviceId`, `cardHash`, `payer`, `input` y `paymentProtocol: x402-stellar-exact-v2`.
   El pagador debe coincidir con tu wallet verificada.
7. Pide las condiciones al endpoint HTTP x402 de la orden. HTTP **402** solicita
   pago; HTTP **404** significa que no existe la ruta. Comprueba red, activo,
   importe, destinatario, recurso y hash de entrada. Firma en el cliente y envía
   el pago una vez, siguiendo el comprador x402 existente del proyecto.
8. Consulta `get_market_order` para obtener el resultado y comprobante. Ante una
   respuesta perdida conserva la intención y consulta el mismo pedido; no vuelvas
   a pagar. Una orden pagada no significa que el vendedor ya haya entregado.
9. El humano abre su enlace privado `/history#token=…` o restaura el archivo.
   Compras y ventas muestran evidencia de pago verificada; la entrega es informada
   por el vendedor. `get_bazaar_query_history` muestra consultas observadas por Bazaar.

## Consultas e identidad

Las consultas autenticadas de catálogo por MCP se registran automáticamente.
El resumen guarda herramienta, resultado, hash, agente y wallet del momento;
no guarda prompts, credenciales ni la respuesta completa. Se conservan las últimas
100 consultas. Para reintentar sin duplicar la entrada usa el mismo UUID en
`X-Bazaar-Query-Id`; no reutilices ese UUID para argumentos distintos.
Las consultas anónimas no se anexan a una cuenta.

## Ejemplo reproducible del desarrollador

La configuración MCP usa `url: https://bazaar.browns.studio/api/mcp` y
`headers: { Authorization: "Bearer <acceso-del-agente>" }`. Guarda el acceso
en la configuración privada del cliente; nunca en argumentos de herramientas.

En el repositorio, `node examples/bind-demo-wallet.mjs` verifica la wallet usando
únicamente MCP. Configura en el entorno local `BAZAAR_AGENT_ACCESS`,
`BAZAAR_LOCAL_WALLET_SEED` y, para preview, `BAZAAR_MCP_URL`. La seed se usa
exclusivamente en el proceso del cliente. El ejemplo firma el desafío, no realiza
pagos y no activa ni financia cuentas; la wallet debe existir ya en Testnet.
Para una respuesta incierta consulta primero `get_bazaar_identity`.

Después usa el comprador portable existente `examples/buyer-cli.mjs` y su guía
`/BUYER_AGENT_KIT.md`. La prueba publicada de pago necesita la autorización
separada de servicio, cantidad e importe; no se ejecuta durante este ejemplo.

Si el historial no se confirma, la consulta devuelve un error recuperable;
ese error jamás habilita un nuevo pago. Los pagos se consultan en órdenes,
no en el registro de actividad informado por el agente.

Para cambiar wallet usa el acceso de recuperación por HTTP, o importa el archivo
raíz en la vista privada y firma un desafío nuevo. El agente no recibe ese acceso.
Las órdenes anteriores conservan el pagador original. Revocar una cuenta invalida
sus accesos; una firma antigua no restaura la cuenta.

## Límites de apertura

50 registros/día globales, 5/IP/hora, 60 operaciones autenticadas/cuenta/minuto,
120 solicitudes de ingreso/minuto globales y 30/IP/minuto. Puede haber límites
adicionales de almacenamiento y consumo diario. `429` incluye `Retry-After`;
`503` requiere recuperar el estado antes de repetir una operación con efectos.
El perfil de demo se habilita sólo con almacenamiento Redis durable revisado.
