# Comprador externo: MCP y x402 con almacén cifrado portátil

El comprador corre en tu equipo con **Node 22.18+**, en Windows, Linux o macOS.
Conecta a `https://bazaar.browns.studio/api/mcp` con el acceso de agente de tu
espacio. No necesita cuenta de Vercel, bypass de despliegue, claves de Bazaar ni
un modelo alojado en Bazaar. Necesita el checkout identificado por SHA y sus
dependencias (`npm ci`), un espacio ya creado y una wallet Stellar testnet propia
con USDC autorizado y saldo suficiente. Este cliente no obtiene fondos ni crea
trustlines.

Cada pedido paga exactamente **el precio de la ficha revisada en USDC Testnet,
directamente al vendedor**. Vincular previamente la wallet en Bazaar es opcional;
la autorización del pagador se verifica en cada pago x402.
El cliente verifica la identidad Circle testnet: emisor
`GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, SAC
`CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`, passphrase
`Test SDF Network ; September 2015`. La transferencia firmada admite una única
llamada SAC `transfer`, con comprador, vendedor e importe congelados. La comisión
patrocinada de red tiene un máximo separado de 1,000,000 stroops; la comisión
se valida antes de firmar y antes del POST de pago. El importe USDC no aumenta.

## Configurar el acceso y el firmante

Ejecuta desde la raíz del checkout. Elige un **directorio nuevo fuera del
repositorio**, dentro de un directorio padre existente. En los comandos, sustituye
`RUTA_PRIVADA` por su ruta absoluta. En Windows, por ejemplo,
`C:\Users\TU_USUARIO\AppData\Local\bazaar-comprador`; en macOS o Linux,
`/home/TU_USUARIO/.local/share/bazaar-comprador`.

```sh
node examples/buyer-cli.mjs configure RUTA_PRIVADA
```

La terminal pide una passphrase de al menos 12 bytes, el acceso de agente y el
seed Stellar de **tu comprador testnet**. La entrada se oculta; no se admite
seed ni token por argumentos, variables de entorno o archivos sin cifrar.
Conserva tu passphrase en privado. Las claves del comprador permanecen en tu
runtime externo; no se envían a Bazaar, al vendedor ni a un LLM.

El almacén usa scrypt (`N=32768`, `r=8`, `p=1`, salt aleatorio de 32 bytes) y
AES-256-GCM con nonce aleatorio de 12 bytes. Credenciales, configuración,
reservas y firmas se cifran antes de escribir y se sincronizan con `fsync`.
Cada revisión y cada snapshot autentica su nombre, versión, secuencia y hash
anterior. Una escritura truncada, una clave incorrecta o una alteración requiere
inspección del dueño; el cliente no omite el último registro para volver a pagar.
Guarda una copia privada completa del directorio. Una copia antigua completa
podría restaurar también un presupuesto antiguo: evita revertir o mezclar copias
después de firmar o pagar. El cifrado no demuestra que una copia sea la más nueva.

Para cambiar explícitamente acceso o firmante:

```sh
node examples/buyer-cli.mjs access RUTA_PRIVADA
node examples/buyer-cli.mjs signer RUTA_PRIVADA
```

El cambio de acceso conserva presupuestos y diarios. Si existen reservas, cambiar
la cuenta firmante se rechaza para preservar la identidad de los pagos anteriores.
No reinicialices un almacén usado para conseguir otro presupuesto.

Un proceso propietario también puede entregar los secretos por **pipe stdin
privado heredado**, usando `--secret-stdin`. Para `configure`, el contenido es un
objeto JSON con `password`, `agentAccess` y `stellarSecret`; para otros comandos,
`password` y, cuando corresponda, `agentAccess` o `stellarSecret`. No uses comandos
`echo`, archivos, historial del shell, prompts públicos o trazas para suministrarlo.
El programa no imprime esos campos. `--origin HTTPS_ORIGIN` solo se admite al
configurar un almacén nuevo o descubrir un catálogo; el valor predeterminado es
el origen público de Bazaar.

## Descubrir, preparar y comprar

```sh
node examples/buyer-cli.mjs discover
node examples/buyer-cli.mjs discover ID_SERVICIO
```

El descubrimiento usa `GET /api/market/catalog` sin acceso privado. La ficha
publica su hash canónico, estado y descriptor de compra. El cliente solo prepara
servicios activados con precio, activo y protocolo exactos.

Guarda los parámetros del servicio en `entrada.json`. Por ejemplo, para una ficha
de Guionista con ese esquema:

```json
{"topic":"Presentar una startup","tone":"cercano","durationSeconds":20}
```

```sh
node examples/buyer-cli.mjs prepare RUTA_PRIVADA ID_SERVICIO entrada.json
node examples/buyer-cli.mjs buy RUTA_PRIVADA UUID_DEVUELTO
```

`prepare` conserva cifrados UUID, ficha, hash, parámetros y wallet; no crea pedido
ni paga. `buy` crea el pedido mediante **`create_market_order` en MCP**, solicita
su desafío HTTP 402, lo valida, reserva presupuesto durable, autoriza una vez y
envía una vez `PAYMENT-SIGNATURE` al mismo endpoint
`POST /api/market/orders/{operationId}/x402`. Solo el RPC público de Stellar
testnet se usa para preparar y simular la autorización. No hay envío directo del
cliente a Horizon ni custodia de fondos por Bazaar.

El máximo por compra predeterminado es 0.01 USDC. Un servicio más caro requiere
una decisión explícita al preparar: `prepare RUTA_PRIVADA ID_SERVICIO entrada.json
--max-price 0.03`. El límite se conserva en la intención cifrada, valida el precio
exacto de la ficha y no amplía el presupuesto total. Importes cero, negativos,
notación exponencial, más de siete decimales o unidades fuera de int64 se rechazan.

Un resultado `paid` prueba el pago; la entrega puede seguir pendiente. Cuando el
vendedor registre texto o fallo, consúltalo:

```sh
node examples/buyer-cli.mjs inspect RUTA_PRIVADA UUID_DEVUELTO
node examples/buyer-cli.mjs recover RUTA_PRIVADA UUID_DEVUELTO
node examples/buyer-cli.mjs history RUTA_PRIVADA
node examples/buyer-cli.mjs history RUTA_PRIVADA 20 CURSOR
```

`inspect` lee **`get_market_order` en MCP** sin cambiar el diario. `recover` hace
la misma lectura y conserva el estado observado. Ninguno firma, reenvía un pago
ni vuelve a ejecutar al vendedor. El historial privado usa páginas de 10 por
defecto y admite hasta 20; conserva el cursor devuelto para la siguiente página.

Después del vencimiento de siete días, `get_market_order` puede devolver HTTP 410
con un control mínimo del pago y `ORDER_CONTENT_EXPIRED`. El cliente sólo acepta
ese control para una lectura, valida el mismo hash de intención, ficha, entrada,
pagador, precio, destino y activo, y muestra `contentExpired: true`. No restaura
texto ni archivos. Un control confirmado requiere transacción y fecha verificadas;
un pago incierto permanece incierto. `buy` rechaza el intento vencido antes de
crear, firmar o transmitir. La conciliación del identificador original es
independiente del contenido y nunca utiliza otro pago.

Si una respuesta se pierde, conserva el UUID y el almacén y ejecuta `inspect` o
`recover`. Un pedido iniciado no vuelve a `prepared`, aunque el servidor aún diga
`awaiting-payment`. Una firma perdida o una segunda simulación incierta no genera
otra autorización. Un POST incierto no se repite. Los errores `MARKET_CAPACITY`,
`X402_SETTLEMENT_CAPACITY` y `CAPACITY_WRITE_UNCONFIRMED` se conservan como códigos
de fallo; requieren lectura del mismo pedido y nunca habilitan un reenvío.

## Presupuesto durable del dueño

El presupuesto inicial es **0.02 USDC Testnet total**, suficiente para dos compras
de 0.01 o una combinación menor o igual a ese total. La reserva usa el importe
exacto de cada ficha. Se escribe antes de firmar y se conserva ante
incertidumbre, fallo o falta de capacidad; no se libera por un estado leído.

```sh
node examples/buyer-cli.mjs budget RUTA_PRIVADA
node examples/buyer-cli.mjs budget-increase RUTA_PRIVADA 0.03
```

El segundo comando representa una decisión explícita del dueño de aumentar el
total autorizado. Añade una revisión cifrada y conserva todas las reservas
anteriores. No habilita un intento incierto para volver a firmarse ni pagarse.
El manifiesto de aceptación local conserva su límite separado de dos pagos;
aumentar este presupuesto no autoriza nuevas compras de aceptación.

Cada mutación adquiere `buyer.lock`. Si el proceso termina de forma abrupta,
el lock puede permanecer. El cliente no lo elimina automáticamente. El dueño
debe comprobar que ningún proceso lo usa, conservar una copia actual y revisar
los diarios antes de retirar exclusivamente ese lock. Un diario truncado no se
repara eliminando su última línea ni generando otro UUID para el mismo efecto.

## Verificación local

```sh
node scripts/test-marketplace-x402-buyer.mjs
node scripts/test-buyer-portable-runtime.mjs
```

Las pruebas usan claves generadas en memoria, respuestas y RPC sintéticos. Cubren
un solo firmado/POST, recuperación por lectura, límites de comisión, cifrado y
alteración, versión, escritura truncada, cadena de snapshots, lock, presupuesto
durable de dos compras, aumento que conserva reservas y CLI por pipe privado.
No hacen pagos reales, solicitudes externas, faucets ni leen wallets existentes.
La ejecución de esta entrega se verificó en Windows con Node 24; el runtime usa
APIs estándar compatibles con Node 22.18+. Linux/macOS y Node 22 exacto requieren
la misma ejecución local en esas plataformas antes de afirmar evidencia allí.
