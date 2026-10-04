# Estado de la primera venta USDC

Actualizado: 2026-10-04. SHA de la aplicación hospedada: `a741937b6d389edbd333ff51bac95b68e654d40e`. **Backend de venta y recuperación: PASS. Navegador funcional: PASS limitado. Apertura: pendiente.**

## Resultado real hospedado

A publicó «Guionista algorítmico de texto» mediante control HTTPS del endpoint, revisión manual y activación. El proveedor corre en una Preview externa protegida, con alias estable `guionista-market-7f3e80bed9be.vercel.app`; conserva las rutas y precios anteriores.

B pagó dos veces **0,01 USDC Circle testnet directamente a A**. Se verificaron red, código, emisor, SAC, comprador, destinatario, importe, memo, firma, comisión y caducidad. Bazaar no custodió fondos, no cobró comisión y no utilizó facilitador.

| Pedido | Resultado | Transacción testnet |
| --- | --- | --- |
| `9d816a37-b42e-4a5b-8498-3205987814b3` | Pago verificado y entrega única: 490 caracteres, generados algorítmicamente | `2aa0ec28825fb76ae490513859de2f9f7ca4339a2ca9e082d2fc435327feb0b0` |
| `4dfa549a-d5e4-433d-b607-f6091948792e` | Pago verificado y entrega fallida declarada por A, sin otra ejecución del proveedor | `646309ec29ce172b487b0cbc40cce08a58efd19e3b7a74e8108a2d5678f492b3` |

El texto persistido tiene hash `472769512dbfc531a0551986c36d725300c01d0f346f9aa6f1f28d005943d7b0`. Los reenvíos conservaron el pedido y la entrega; contenido distinto bajo el mismo identificador produjo conflicto. El acceso de un tercero fue rechazado. Las pérdidas de respuesta y conciliación se probaron con dobles, sin inducir pagos hospedados inciertos.

La provisión terminó con dos altas Friendbot, dos trustlines y una reclamación USDC. Se conservó el intento inicial de PoW agotado y se efectuó una recuperación explícita única. No se repitieron Friendbot ni trustlines. Las claves sintéticas siguen únicamente en Windows DPAPI local.

USDT0 está identificado con su descriptor oficial mainnet y sus pagos desactivados. Se rechazan compras mainnet y un supuesto USDT0 testnet. Las fichas y pedidos históricos XLM mantienen lectura y hashes, sin migración.

## Recuperación y navegador

Los dos pedidos, transacciones, texto, hashes y estados se recuperaron exactamente tras sustituir Vercel. El historial conserva las perspectivas privadas de venta y compra. La pausa compartida bloqueó nuevas altas y compras tanto en el candidato anterior como en su sustitución, preservando consultas del historial.

A y B recuperaron su vista mediante Magic Link en la Preview protegida de sustitución. Ambos vieron los pedidos correctos; B no vio la ficha privada de A ni su actividad histórica. Bloquear eliminó referencias, wallets y texto de la vista. Pasaron el disclosure del activo con Space, navegación con Tab y viewport móvil real de 390×844 sin desbordamiento horizontal. El viewport se restauró y ambas vistas quedaron bloqueadas.

Preview de recuperación: `dpl_DPiHiRDfYGxMUngmvweCxzCzvojX`. Preview cerrada preparada: `dpl_GtCiywSTBgtAXcboDgCw829pxvU2`, estado READY, mismo SHA, compras, altas y activación cerradas. El despliegue público de `bazaar.browns.studio` conserva su versión anterior.

## Qué falta antes de abrir

1. **Cobertura de tráfico del navegador.** Los UUID de Vercel permiten conciliar API y Redis, pero CUA no ofrece una captura completa de HTML, estáticos, redirecciones o retransmisiones. La barra de Vercel y su ruta JWE siguen observadas pese al ajuste de feedback. Las dos mediciones anónimas de sus assets acreditan tamaños, no ausencia de otros intercambios. La cota de 31.024.060 bytes es un modelo condicionado; no acredita el límite total. El informe de contadores permanece parcial.
2. **Ampliación real al 200 %.** Los atajos probados no alteraron el zoom nativo de este navegador; móvil y CSS no sustituyen la comprobación humana.
3. **Firma humana con Freighter en testnet.** La firma sintética acredita el backend. No certifica conexión, presentación de la transacción y aprobación humana en Freighter. Las dos compras comerciales autorizadas ya se consumieron; un pago humano adicional necesita un nuevo manifiesto previo.
4. **Retirada del servicio sintético y revocación de A.** La puerta `canRetireSynthetic` sigue cerrada por la medición incompleta. A permanece activa para terminar la aceptación; B conserva acceso. Compras y altas están pausadas. No se borraron pedidos, entregas ni registros. El cierre requiere una cota demostrada antes de sus cinco solicitudes previstas y comparar el historial posterior de B.
5. **Revisión final y publicación condicional.** Con las condiciones anteriores cumplidas, revisar SHA, configuración, despliegue y contadores antes de promover el candidato. No publicar con `canOpen:false` ni repetir automáticamente pagos, ejecuciones, retirada o revocación.

Se mantienen Vercel Pro y Redis Free existentes, los namespaces y las identidades A/B. No se contrataron servicios, no se usó dinero real y no se enviaron invitaciones. Las tres admisiones y las guías están preparadas; ninguna credencial aparece en este expediente público.

## Evidencia

[Manifiesto](evidence/sprint-marketplace/usdc-sale-manifest.json), [recibos de venta](evidence/sprint-marketplace/usdc-sale-receipt.json), [recorrido HTTP](evidence/sprint-marketplace/usdc-hosted-http.json), [contadores parciales](evidence/sprint-marketplace/usdc-counter-reconciliation.json), [navegador funcional](evidence/sprint-marketplace/usdc-browser-functional.json), [tráfico incompleto](evidence/sprint-marketplace/usdc-browser-traffic.json), [recorrido local](evidence/sprint-marketplace/usdc-native-local.json), [provisión](evidence/sprint-marketplace/usdc-wallet-provision.json), [revisión de venta](review/USDC_HOSTED_SALE_RECEIPT_REVIEW.md), [guías](USDC_FIRST_SALE_GUIDE.md).
