# Dictamen independiente del expediente USDC

Fecha: 2026-10-04. Revisor: `review_usdc_hosted`. **REVIEWED_PARTIAL_ACCEPTANCE_NO_OPENING**.

Se aprueba la coherencia del expediente local como aceptación parcial. No se aprueba apertura, retirada/revocación ni cumplimiento del presupuesto completo del navegador. Esta revisión leyó recibos públicos, fuentes de controles y snapshots redactados; no leyó el packet DPAPI ni hizo HTTP, firmas, pagos, consultas Redis o cambios Vercel.

## Identidad del resultado

Plan `7f3e80be-d9be-47e1-81c8-49445b3bc0d9`. SHA de la aplicación hospedada `a741937b6d389edbd333ff51bac95b68e654d40e`; el commit posterior de documentación y controles no sustituye ese SHA en los recibos. Build nativo local `JuUYuA-SG2W_Bt7kYc0fv`, evidencia local separada de los builds remotos.

| Función | Deployment ID |
| --- | --- |
| Bazaar candidato de venta | `dpl_Ek6EJ9oEwi7M5UVcFdQTzz5RFxLm` |
| Bazaar sustituto de recuperación | `dpl_DPiHiRDfYGxMUngmvweCxzCzvojX` |
| Bazaar Preview cerrada | `dpl_GtCiywSTBgtAXcboDgCw829pxvU2` |
| Proveedor externo con prueba y alias | `dpl_6vzckCnGuTd2UocjmWpjeaLRebPw` |

Fingerprint del upload Bazaar `ba058f2d659c29d3b7d7c92f320da02e9b80bd47c3c5aa1780827e91415d5b4e`. El proveedor conserva el alias exacto `https://guionista-market-7f3e80bed9be.vercel.app` y fingerprint `c8a59203f6a68a263ee650f61513dce525453ab9ad90c513b3097abec293f37c`. Los estados READY, SHA, fingerprint y flags se conservan en los recibos públicos de despliegue. Los campos v13 ausentes de protección permanecen `unknown`; no se reinterpretan como una desactivación. Seis comprobaciones HTTP anónimas confirmaron rechazo en sus despliegues exactos. La última, Preview cerrada, recibió 302 sin seguir redirección: una API, 924 bytes y 464 ms.

## Lo acreditado

`audit-usdc-sale-public.mjs` da **PASS_PUBLIC_BACKEND_SALE_AND_RECOVERY_RECEIPTS**: dos pagos directos de 0,01 Circle USDC testnet de B a A, identificadores e identidad del activo congelados, una ejecución algorítmica y entrega de 490 caracteres, y segunda operación con pago verificado/entrega fallida. Los ACK almacenados conservan replay idéntico, conflicto bajo otro contenido, rechazo de tercero y ausencia de segundo intercambio Horizon al reenviar el pago. Sustitución y pausa comparan los pedidos e historiales contra sus registros originales.

La recuperación explícita de provisión conserva los once intentos originales y añade únicamente reto, claim y lectura Horizon de B. El snapshot y transición de binding pasan `assertProvisionRecovery`. Los límites y contadores acumulados permanecen; no se repitieron Friendbot, trustlines ni claim.

`audit-usdc-browser-public.mjs` da **PASS_PUBLIC_FUNCTIONAL_BROWSER_RECEIPTS**: ambas identidades recuperan sus dos pedidos y comprobantes con perspectiva Venta/Compra, ven el mismo texto normalizado, y bloquear elimina sus referencias y contenido. Teclado y 390×844 pasan dentro del alcance observado. El hash de texto normalizado `53bc7db24239d2a9bbe4a98b86436e8a1c95d01788ada9bfe0f738a28e055464` coincide con la nueva proyección local del texto backend. El recibo anterior se preservó exactamente; sólo se añadieron hash y longitud normalizados. El hash original de bytes sigue `472769512dbfc531a0551986c36d725300c01d0f346f9aa6f1f28d005943d7b0`.

Los tests focales de conciliación (37 escenarios), guardia de coste público, toolbar con dobles y protección pasan localmente sin red. El parser conserva mensajes seleccionados y anidados, observa versiones inválidas y retiene duplicados antes de conciliarlos. La conciliación vincula los 47 ACK API del driver y conserva 61 UUID únicos del servidor, descartando 173 observaciones idénticas. No sustituye UUID ausentes con inferencias por ruta.

## Contadores observados y limitación

`reconcile-usdc-counters.mjs final` devuelve **INCOMPLETE_EVIDENCE** y exit 1 deliberado. No es un fallo del auditor ni un PASS de presupuesto completo.

| Medida observada | Resultado / límite |
| --- | --- |
| API | 104 / 120; prime sin UUID conserva otra API como cota, no observación |
| Redis REST | 287 / 400 |
| Comandos, cota superior | 986 / 2400 |
| Valores persistidos, cota agregada | 20.779 / 49.164 bytes |
| Payloads enviados conocidos | 669.035 / 16.777.216 bytes |
| Payloads recibidos conocidos | 1.456.830 / 33.554.432 bytes |
| Tiempo activo observado | 122.265 / 300.000 ms |
| Horizon GET/backend | 23 / 24 |
| Friendbot / trustlines / claim USDC | 2 / 2 / 1 |
| Pagos / proveedor | 2 / 1 |
| Controles Vercel / creates | 36 / 50; 6 / 6 |

Estos bytes son costes conocidos de los runners/servidor y probes, no el total del navegador. CUA no capturó sus headers, cuerpos HTML/estáticos, redirecciones ni retransmisiones. Los 14 UUID API privados adicionales están contados en Redis/API, pero sus headers no fueron leídos por el navegador. El informe DOM sólo suma 16.186 ms; `requests:[]` significa falta de registros de transporte, y `automaticRetries:null` conserva desconocidos los reenvíos reales. La configuración de aplicación sin reintentos no los prueba.

El toolbar, feedback HTML y JWE siguen observados pese al ajuste del proyecto. Los dos GET anónimos de sizing acreditan 204.763 bytes de bootstrap, sin demostrar coste del tráfico adicional. La versión ejecutada del probe carecía de lock/guardia global; su endurecimiento posterior y tests no acreditan retrospectivamente esas garantías. La cota propuesta de 31.024.060 bytes no demuestra cobertura completa y no habilita cleanup.

## Estado final y cuatro pendientes

El manifiesto concluye `PARTIAL_ACCEPTANCE_STOPPED`: todas las puertas de ejecución/Preview/provisión/inspección/cleanup/apertura quedan falsas. Los recibos conservan la pausa compartida; altas y compras permanecen cerradas. A no fue revocada, el servicio sintético no fue retirado y B conserva acceso. La Preview cerrada está READY con compras, intake, activación y creación cerradas; su configuración no sustituye una nueva prueba de mutación. No se promovió a `bazaar.browns.studio`, ni se enviaron invitaciones.

1. Captura/medición completa del transporte de navegador, incluida plataforma, retransmisiones y atribución de UUID. Resolver con una superficie admitida y un manifiesto revisado antes de otros efectos; no reconstruir tamaños desconocidos como cero.
2. Retirada sintética y revocación de A, seguidas de rechazo de A y preservación exacta de B. Requieren presupuesto demostrado y puerta específica; no repetir automáticamente.
3. Zoom nativo real al 200 %, actualmente `PENDING_MANUAL`.
4. Firma y recorrido humano Freighter, actualmente `PENDING_MANUAL`. Las dos compras autorizadas están consumidas; otro pago exige un nuevo manifiesto previo.

`USDC_FIRST_SALE_STATUS.md`, las guías y los recibos mantienen estos pendientes. Este expediente puede guardarse y revisarse como resultado parcial reproducible; no debe presentarse como sprint cerrado o marketplace abierto.
