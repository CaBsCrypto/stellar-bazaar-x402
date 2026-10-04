# Revisión independiente de recibos USDC hospedados

## Dictamen del backend observado

`PASS_PUBLIC_BACKEND_SALE_AND_RECOVERY_RECEIPTS`, ligado al plan `7f3e80be-d9be-47e1-81c8-49445b3bc0d9`, SHA `a741937b6d389edbd333ff51bac95b68e654d40e` y candidato `dpl_Ek6EJ9oEwi7M5UVcFdQTzz5RFxLm`.

El revisor ejecutó `scripts/audit-usdc-sale-public.mjs` sólo sobre manifiesto, driver, recibo de venta, provisión acumulada y snapshot públicos. No hizo HTTP, leyó DPAPI, obtuvo semillas ni repitió pagos. El dictamen acredita coherencia de los recibos y assertions almacenados del backend; no acredita por sí solo apertura, tráfico completo del navegador, Freighter humano o zoom real.

## Recuperación de provisión

El snapshot anterior conserva exactamente once intentos confirmados y binding `93a3a5276d00cc17e475d190fe55655ee17888f015e66bd74b2d162efb400eda`. Su SHA256 es `ad7779e6136ce5c3947c77806e08ba0133341928c1100139db791ce7c250b65e`.

La transición activa `45c456d56baa2485d255a1e904382b5e5344af2b0e453d2fc75fc4956ee74724` conserva baseline completo/hash, límites primarios y los once intentos. Añade sólo reto, claim y un GET Horizon a B. Los contadores acumulados son siete lecturas Horizon, dos Friendbot, dos trustlines, tres HTTP faucet y un claim; no hay reset de bytes/tiempo ni segundo conteo del snapshot.

## Venta y entrega

- Dos operaciones distintas congelan servicio, cardHash, versión, importe `0.01`, comprador B y destinatario A. Las identidades coinciden con Circle USDC testnet del manifiesto y el SAC derivado localmente por el SDK.
- Las transacciones tienen hashes distintos, fee de 100 stroops y verificación antes de su caducidad. Los destinatarios coinciden con la wallet vendedora; los pagos son directos y el driver declara cero facilitadores.
- Primera operación `9d816a37-b42e-4a5b-8498-3205987814b3`: `delivered`, texto de 490 caracteres/497 bytes, hash `472769512dbfc531a0551986c36d725300c01d0f346f9aa6f1f28d005943d7b0`; referencia del mismo pedido y fecha posterior al pago verificado.
- Segunda operación `4dfa549a-d5e4-433d-b607-f6091948792e`: `delivery-failed`, pago verificado, entrega nula y razón de fallo congelada. No se presenta como completada.
- El driver confirmado conserva creación idéntica con el mismo hash y ACK 201, conflicto de contenido 409, reenvío de pago 409 sin un segundo intercambio Horizon y acceso de tercero 401. Se registra una sola ejecución del proveedor y dos intenciones de pago.

El recibo ampliado conserva dos pedidos del cardHash actual en cada historial y el mismo hash de estado `76f6445bf26135695ca40d8c66d32e9af273016051b28f846576fd29aeaae496` después de retirar únicamente `perspective`. Las vistas identifican A como `sale` y B como `purchase`; ésa es la diferencia legítima entre sus DTO, no una entrega o comprobante distintos. Las proyecciones locales JSON son 6.480/6.488 bytes. El driver conserva assertions PASS de sustitución y pausa: cada historial se compara contra su propio snapshot anterior y ambos pedidos contra los registros originales, sin cambios de estado.

## Condiciones pendientes independientes

La conciliación inicial detectó dos UUID ausentes del campo seleccionado por el CLI: submission POST201 `cee5cd00-202c-4086-93f0-71e28ea23ed3` y primera creación de pedido POST201 `90164d44-398b-4743-a5f3-859c33b2a9ac`. La lectura local del CLI identificó que `row.message` prioriza una advertencia mientras `row.logs[]` conserva otros mensajes. El parser corregido conserva ambos campos y sus duplicados; los exports corregidos recuperaron los dos UUID. La conciliación local vincula los 47 ACK API del driver con sus UUID y contadores exactos, y descarta únicamente observaciones idénticas de la misma pareja deployment/UUID. No se inventaron registros ni se sustituyó el UUID por coincidencias de ruta. Los tests del reconciliador incluyen la diferencia entre filas CLI y observaciones anidadas; export incompleto, meter inválido o duplicado contradictorio impiden PASS.

La sustitución y pausa compartida están confirmadas por los ACK y assertions conservados del driver. Los controles funcionales de navegador y cleanup requieren sus propios recibos exactos. Freighter humano, ampliación real al 200 % y la cobertura de transporte del navegador continúan como condiciones de apertura. Ningún PASS local de este documento habilita producción o invitaciones.
