# Integración local de Bazaar · 11 de noviembre de 2026

`integration/bazaar-verified-20261111` parte del [`main` de GitHub comprobado (`76ba7b1`)](https://github.com/CaBsCrypto/stellar-bazaar-x402/commit/76ba7b19eacb424d8c9e872a2d01569e1eb45b3d). El commit `1da5ae8` superpone los 391 archivos de la publicación recuperada en `snapshot/bazaar-production-20261022` (`3d32d37`, digest `8453afdc1f7d9b219d2e48d8e5cd6be324b66fa1e335eacfa96324b4c0c1ebd7`, despliegue `dpl_747btETVsoyUemWvgrN7emMqJsa8`). Se conservaron todos los archivos de `main`, incluidas herramientas, workflows, documentación y el fixture antiguo del comprador. El segundo commit sólo adapta comandos, CI y pruebas: mantiene el lock, la aplicación y `vercel.json`. Se omitieron alias de la publicación que dependían de herramientas ajenas al paquete y no incluidas en la rama.

El tip de #61 (`be9d1db`) y sus PR apilados son ancestros de `e9daaf1`, la línea local de octubre. Los cambios principales se contrastaron con la fuente publicada y, donde correspondía, se recuperaron pruebas del historial. GitHub mantiene abiertos los once PR; la rama local no los modifica.

| PR | Decisión | Evidencia o trabajo rescatado |
| --- | --- | --- |
| [#54](https://github.com/CaBsCrypto/stellar-bazaar-x402/pull/54) | Cubierto por la fuente actual | Conserva el aislamiento y la limpieza de WebMCP; se recuperaron pruebas de montaje, colisiones y reemplazos ajenos. |
| [#55](https://github.com/CaBsCrypto/stellar-bazaar-x402/pull/55) | Cubierto; conservar regresiones | Identidad registrada, permisos por rol y acceso aislado al historial. Se actualizó la prueba de chat y escritura/lectura autenticadas. |
| [#56](https://github.com/CaBsCrypto/stellar-bazaar-x402/pull/56) | Cubierto; conservar regresiones | Las opciones USDC/XLM y la recuperación con diario ya están. Se incorporaron pruebas sintéticas de selección, recepción y recuperación sin repetir pago. |
| [#57](https://github.com/CaBsCrypto/stellar-bazaar-x402/pull/57) | Cubierto; conservar regresiones | El control de liquidación compartido y el bloqueo del sandbox ya están. Se recuperó la prueba de concurrencia en tres procesos; usa IPC y Redis simulado. |
| [#58](https://github.com/CaBsCrypto/stellar-bazaar-x402/pull/58) | Cubierto y ampliado | Se preservaron precedencia y resultados parciales. Se añadieron dos regresiones ajustadas al catálogo y al comportamiento de credenciales de Preview. |
| [#59](https://github.com/CaBsCrypto/stellar-bazaar-x402/pull/59) | Guía superada; conservar escenarios | El contrato vigente separa MCP público y privado. Se verifica el endpoint público real con el SDK y se reutilizan escenarios x402 de admisión y recuperación sintéticas. |
| [#60](https://github.com/CaBsCrypto/stellar-bazaar-x402/pull/60) | Cubierto y ampliado | La fuente actual conserva guardas operativas y agrega controles de origen y frecuencia. Se recuperaron pruebas de autorización, OTP, panel y bloqueo de pagos legados. |
| [#61](https://github.com/CaBsCrypto/stellar-bazaar-x402/pull/61) | Conservar pruebas; CLI legado sólo si hace falta | Se recuperaron las pruebas de revocación, respuestas tardías y pérdida de respuesta. El workspace actual controla el acceso por generación; la rotación offline del historial legado queda separada. |
| [#15](https://github.com/CaBsCrypto/stellar-bazaar-x402/pull/15) | Superado | El contrato actual de Website Intelligence reemplaza el adaptador. Se verificaron sus pruebas de requisitos, consumo y recuperación. |
| [#20](https://github.com/CaBsCrypto/stellar-bazaar-x402/pull/20) | Diseño futuro | Mantener como referencia de escrow; queda fuera del piloto de pago directo. |
| [#32](https://github.com/CaBsCrypto/stellar-bazaar-x402/pull/32) | Diseño futuro | El prototipo diverge del router de `main`. Conservar el requisito de demostrar compatibilidad del reparto con cliente, verificador y facilitador antes de adoptar ese flujo. |

Validación local con Node 24: build de Next.js con Webpack, generación de tipos y `tsc`; `npm run test:integration` pasó 20 de 20, incluidos 67 casos x402, 6 de admisión, 11 de recuperación y 8 de MCP público. También pasaron las pruebas de historial, chat, conformidad WebMCP y contrato de pagos de `main`. Las pruebas usaron datos y transportes sintéticos; el build se ejecutó sin credenciales. No hubo publicación, configuración de infraestructura ni pagos reales. El estado operativo y el presupuesto del piloto deben revalidarse por separado.

## Revisión final antes del PR

- Presupuesto e identidad: las rutas privadas de historial, actividad y entrega pasan por el presupuesto compartido. MCP conserva un solo débito por petición. El acceso de recuperación de tesorería se limita a la ruta de rotación autorizada.
- Pedidos y pagos: si se desborda la primera página de asientos del vendedor, se retiran del índice sólo los asientos impagos, no comprometidos y vencidos. La petición con la página incompleta se detiene. La reconciliación explícita de un pedido vencido usa únicamente la transacción ya guardada; si coincide con la evidencia de Stellar, guarda la recuperación sin contenido y conserva el control de la reserva, sin liquidar ni despachar otra vez.
- Recorridos web: el catálogo respeta la sesión de Preview, la ficha elegida abre Comprar y el alta ofrece el enlace privado al chat. Las guías apuntan a rutas y kits que existen.
- Publicación: la rama de integración está excluida de los despliegues automáticos de Git en `vercel.json`. La revisión se mantuvo local.

Comprobaciones finales: 24 de 24 suites de integración, historial, chat, WebMCP, pagos, actividad, entregas, límites de entrega y vectores TypeScript del registro. Pasaron el build de Next.js con Webpack, TypeScript y el escaneo de credenciales del árbol actual. Se verificaron los dos kits contra sus manifiestos. Las comprobaciones usaron datos sintéticos y el build no leyó credenciales ni contactó servicios de pago.

## Purga automática de pedidos por pedido

El guardián ya barre los pedidos de texto del perfil continuo por pedido. Usa la hora de Redis y el índice por comprador, que cubre pedidos anteriores, entregados y de compradores revocados, sin migración ni escaneo global. Cada pasada revisa hasta cuatro compradores y tres proyecciones por comprador, archiva como máximo un pedido y guarda un cursor pequeño para la siguiente pasada. Un conflicto o una escritura incierta no adelanta el cursor.

El mismo CAS sustituye el pedido y su historial por los controles de recuperación, y elimina la autorización XDR, la entrada y la entrega. Conserva el hash conocido, la huella antirrepetición, la asignación y la reserva de pago. La reconciliación posterior comprueba únicamente la transacción guardada; si no hay hash, conserva el estado incierto y no consulta Stellar. El guardián no firma, liquida, despacha al vendedor ni libera reservas.

La búsqueda y el archivo tienen débitos globales separados (32 comandos y 160 KiB de transporte para buscar, 64 comandos y 768 KiB para archivar, más el coste del débito). Si faltan presupuesto o tiempo, el siguiente ciclo continúa. La API sigue ocultando el contenido desde los siete días; la eliminación efectiva depende del avance del guardián. Los pedidos legados conservan su ruta y un archivo externo inesperado queda intacto para revisión. No se ha medido el presupuesto disponible en producción.

Validación local: 37 pruebas de integración, historial, flujo de pagos, escaneo de credenciales, build y TypeScript. En una prueba con los scripts Lua reales sobre un Redis emulado, se archivó un registro previo y se comprobó que el pedido, su proyección de historial y su proyección de admisión quedaron sin contenido; la asignación, la reserva de pago y el estado legado se conservaron. El archivo usó 54 comandos según el descriptor. No hubo conexiones a Redis o Stellar reales.
