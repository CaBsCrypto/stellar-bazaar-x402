# Evidencia del candidato público Testnet

Fecha de revisión: 7 de octubre de 2026 (Santiago).
Candidato de código: `c8f5fdd0916de1facde159eab2628c20f43132f8`.
Base: `7f7ab2bba4c76e01ac282d1eaed8ac55ef86c6ab`.
La revisión posterior añadió rechazo de recuperación por MCP, comprobación del
archivo raíz contra la cuenta abierta y captura de wallet al iniciar la consulta.
El SHA final de código se obtiene con `git rev-parse HEAD`; la preview bloqueada
corresponde al candidato inicial, no valida esas correcciones.

## Resultado local

| Verificación | Resultado y alcance |
| --- | --- |
| TypeScript y build Next.js webpack | PASS; compilación final local completa |
| `test:demo:wallet` | PASS: dominio/cuenta, firma incorrecta, expiración, uso único, duplicación de wallet, recuperación, revocación, CAS y respuesta perdida; recuperación rechazada por MCP |
| Endpoint MCP real con Redis/Horizon dobles | PASS: initialize, instrucciones, tools/list, observación autenticada y anónima, UUID de reintento sin duplicación |
| `test:market:mcp` | PASS: permisos y aislamiento, consulta HTTP privada, wallet necesaria antes de nueva orden, pagador original conservado tras rotación |
| `test:marketplace:x402` | PASS: 61 casos con dobles; cero pagos reales y cero solicitudes externas |
| `test:market:capacity` | PASS: 24 casos; reservas, concurrencia, incertidumbre y recuperación; Lua Redis real pendiente |
| `test:marketplace` | PASS: rechazo de alteraciones, aislamiento, entrega y recuperación simuladas |
| `test:buyer:portable` | PASS: diario durable, recuperación y MCP; cero pagos reales |
| `test:workspace:global-quota` | PASS: cuotas compartidas y atómicas, concurrencia, reinicio de ventanas y respuesta perdida |
| `test:workspace:core` | PASS: persistencia y reinicio con procesos locales, rotación, límites e aislamiento |
| `test:marketplace:x402:discovery` | PASS: contrato y endpoint x402 congelados |
| Escaneo de secretos | Sin seeds ni etiquetas de secretos actuales; un commit histórico conocido señalado, sin reescribir historia |

Las pruebas no escribieron datos reales de usuarios. Los dobles de Horizon,
facilitador y Redis no certifican una transacción Testnet ni aceptación en Vercel.
Las restricciones locales de filesystem bloquearon inicialmente build y una prueba
de archivos temporales; las ejecuciones autorizadas posteriores pasaron.

## Lecturas externas realizadas

- Vercel: producción `dpl_5rbJydG46d3EaTdWFaCkspPrqems`, estado Ready.
- GET público `/api/mcp` y tools/list mediante Vercel CLI: versión **0.5.0**,
  ocho herramientas, modo read-only. El candidato es **0.9.0**, 31 herramientas.
- Upstash: base `bazaar-validacion-20261001`, Free Tier, aproximadamente 4.200
  comandos de 500.000/mes, 7 MB de transferencia y 51 KB de almacenamiento,
  coste mostrado $0.00. La asignación de namespaces desplegados sigue pendiente.
- No se cambiaron presupuestos ni planes; no se promovió un despliegue.

## Preview

Se preparó una preview con namespaces independientes nuevos para cuentas,
revisión, órdenes y catálogo. No se copiaron historiales privados reales.

URL: https://stellar-bazaar-x402-pz9l7fmxq-cabscryptocontacto-6028s-projects.vercel.app

ID: `dpl_AjEb6p1Ca4CSX839Q9BV8ZkLUELq`.

**Bloqueada por Vercel antes de compilar:** el autor del commit es la identidad
de ejemplo `AI Chef <chef@spicycrust.com>`, sin cuenta Git vinculada autorizada.
Esto no es un fallo de build ni una validación de preview. Hace falta corregir
la identidad de Git y retomar la aceptación sintética. El CLI muestra UNKNOWN;
la página del despliegue confirma Blocked y explica el motivo.

## Pendientes para afirmar «demo lista»

1. Resolver la identidad del commit y ejecutar aceptación en preview con Redis real.
2. Confirmar un servicio de texto revisado y operativo, su vendedor y endpoint.
3. Probar la vinculación positiva con la wallet Testnet del agente del desarrollador.
4. Obtener autorización separada de una transacción: servicio identificado,
   una compra y precio total 0.01 USDC Testnet, sin financiar ni custodiar wallets.
5. Recoger transacción, recibo, entrega e historial privado desde cliente externo.
6. Presentar configuración, SHA y resultados definitivos para autorización de
   publicación; promover una única versión sólo después de esa autorización.

La producción actual conserva su versión. No entregar estas pruebas locales
como evidencia de pagos verificados en producción al hackathon.

## Conexión corregida y aceptación de preview

Cuenta GitHub verificada: CaBsCrypto, con permisos de administración y push
sobre CaBsCrypto/stellar-bazaar-x402. El fallo provenía de la identidad Git global
de ejemplo y de un origin que apuntaba a la copia local beta-open-release.
Se configuró sólo este checkout con 0xCaBs y el correo noreply de CaBsCrypto;
el remoto local se conservó como local-release y origin apunta al GitHub original.
No se modificó la configuración global ni se hizo push a main.

Candidato probado: `58df555a178d3a8bf21274a6e0dab7d4355b5966`.
Despliegue: `dpl_7XJKb95bzrgENrHDfUBTzdk5WgBz`, target Preview, estado Ready.

URL: https://stellar-bazaar-x402-8fyeox5ce-cabscryptocontacto-6028s-projects.vercel.app

Aceptación remota: PASS, 17 solicitudes mediante Vercel CLI contra el despliegue
y Redis reales. Incluyó MCP 0.9.0, initialize e instrucciones Testnet, 31 herramientas,
dos registros sintéticos, replay de registro, identidad privada estable, consultas
sin duplicación, ausencia de historial anónimo, separación entre cuentas, desafío
de wallet vinculado al origen, firma incorrecta rechazada, desafío de otra cuenta
rechazado y revocación efectiva. No se enviaron pagos ni peticiones Mainnet.

La preview anterior bloqueada permanece como evidencia del fallo inicial.
Producción no fue promovida: conserva su contrato MCP 0.5.0. Siguen pendientes
wallet Testnet financiada, servicio de texto revisado, prueba de compra/entrega
con autorización separada y autorización de publicación. La preview tiene la
protección de acceso de Vercel; estas pruebas usaron el acceso del operador.
