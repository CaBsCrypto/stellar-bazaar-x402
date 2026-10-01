# Revisión independiente: Next nativo y Redis real

Fecha: 2026-10-01, America/Santiago. Estado: revisión preparatoria; aceptación
del sprint pendiente del candidato final y del recorrido Redis real autorizado.

## Base y alcance

Objetivo leído desde el attachment y desde
`docs/SPRINT_GOAL_BAZAAR_REDIS_REAL.md`. HEAD inicial:
`6ceff21a5ad3102c9658a36b5f21d0dd70b1c94a`. El SHA de código aprobado anterior
es `6c60391d271a57b04ec8621470237c9ca2f522e2`; sus pruebas con file y dobles
no acreditan Next con Redis real. No hay grafo graphify existente en este checkout.

Esta revisión no lee `.env`, credenciales ni datos históricos; no consulta Redis
externo ni ejecuta runners reales. Sólo modifica este informe y scripts de revisión
propios. No realiza commit, push, merge, publicación, pagos ni altas de proveedores.

La base dedicada `bazaar-validacion-20261001` existe según el objetivo actualizado;
las afirmaciones antiguas de “sin instancia” ya no describen ese estado. La
existencia de la base no prueba margen gratuito actual ni autoriza las escrituras
de un plan nuevo.

## Hallazgos de lectura

- La fábrica Redis configurada existente usa el SDK instalado, retries 0,
  deserialización automática desactivada y auto-pipelining desactivado. Un backend
  inválido falla cerrado. El modo file exige configuración explícita local.
- El runner previo centraliza Redis y cuotas; usa handlers reales en un host HTTP
  de pruebas e inyecta propietarios exclusivamente en `NODE_ENV=test`. No sirve
  el build nativo de Next ni la fábrica configurada de producción.
- Los scripts Lua canónicos leen tres claves. READ cuesta 4 comandos contando
  EVAL; COMMIT reserva 6 o 7, y un CAS0 confirmado cuesta 4. Un resultado incierto
  conserva la reserva y detiene nuevos intentos de transporte.
- Los documentos mantienen los IDs, hashes iniciales, hashes retirados e intenciones
  de rotación/revocación. Repetir una intención idéntica devuelve su comprobante;
  cambiar condiciones entra en conflicto. La revocación conserva tombstones.
- `PrivateAgentChat` elimina fragmento y query `token` antes del request, conserva
  acceso en memoria y usa una generación para ignorar respuestas tardías tras
  bloquear/reentrar. Bloquear vacía mensajes, selección, borrador e intento pendiente.
  Eso es evidencia de lectura; requiere comprobación en navegador con Redis real.
- El build Next carga `.env*` automáticamente según su documentación instalada;
  lanzar Next con un entorno limpio necesita también comprobar ausencia de esos
  archivos por nombre, sin abrirlos.

## Validación independiente local reproducible

Desde este checkout, con el runtime existente:

```powershell
& 'C:\Users\MGC\AppData\Local\Temp\bazaar-node22-review\node.exe' --experimental-strip-types scripts/review-bazaar-native-contract.mjs
& 'C:\Users\MGC\AppData\Local\Temp\bazaar-node22-review\node.exe' scripts/review-bazaar-native-proxy.mjs
& 'C:\Users\MGC\AppData\Local\Temp\bazaar-node22-review\node.exe' scripts/test-open-workspace-redis-budget.mjs
```

El script usa exclusivamente dobles en memoria y un doble HTTPS. No construye ni
lanza Next; no usa archivos de configuración privados. La repetición tras revisar
la nueva fábrica aislada pasó con Node `v22.18.0` sobre estos contenidos:

| Archivo | SHA-256 observado |
|---|---|
| `lib/workspace-store.ts` | `d282b41d3e62f77c031e34a3f71b7be3f7b8abacea6949812a1fd2a077090778` |
| `scripts/workspace-redis-budget.mjs` | `d573dc32fd0868367efda46a6936ee1087ac49204e27239fa9580b8bae09a678` |

Comprueba claves ajenas, Lua alterado y escritura a `owner:none` rechazados antes
del efecto; rechazo persistente; límites de requests/comandos/bytes antes del send;
reserva concurrente de respuesta; respuesta corrupta y acuse perdido con un único
send; redirect HTTPS terminal y bytes de error; y un único intento del SDK real
desde `configuredWorkspaceStore` ante fallo sintético. También usa la nueva
asignación aislada configurada con `NODE_ENV=production` y el SDK instalado:
creación desconocida, hashes iniciales cambiados y `ownerId` del cliente rechazan
antes de leer Redis; la creación concurrente produce un único owner; ocho CAS0
de cuota acotan la ejecución exactamente a ocho pares read/commit; fábricas
nuevas conservan IDs y rechazan accesos anteriores tras rotación/revocación; y
configuración parcial, Vercel, file, relay no exacto y token distinto fallan sin
send. Contadores externos: 0. No se encontró bloqueador en ese delta de la fábrica.

Debe repetirse sobre el candidato final.
Su categoría sigue siendo **dobles locales de protocolo y configuración**.

El gate propio del proxy, repetido tras preservar el cap individual, pasó sobre
SHA-256 `a3acd43ec39c87e3d3fea746b4fe9d4e812010764f7afd6342dec43aa7dbf4b5`.
Usa dos proxies loopback con un servidor sintético y un ledger compartido;
confirma tres solicitudes (dos válidas y una de autoridad rechazada), dos
efectos upstream y 77 bytes exactos incluyendo el error de proxy. Confirma
reserva concurrente y que un ledger detenido no se reanuda al liberar una reserva.
No es un recorrido Next ni Redis real.

Los tres gates se repitieron sobre la corrección final de almacenamiento y pasaron
con Node `v22.18.0`, cero requests externos y cero escrituras Redis reales.
El gate existente de presupuesto usa dobles y su propia carpeta temporal sintética;
no lee credenciales del recorrido real.
La fórmula del último COMMIT1 confirmado cuenta registry UTF-8, documentBytes
validados y 12 bytes del marcador; CAS0 no cambia ese conteo y la incertidumbre
invalida la afirmación de estado actual. El orden de emisión y de acuses no prueba
el orden de aplicación de Redis. La corrección final exige que el último COMMIT1
comience sin intercambios pendientes, que no comience otro intercambio hasta su
acuse y que sea el único pendiente al recibirlo. `currentStateConfirmed` exige
además cero intercambios pendientes y ninguna incertidumbre. Los casos con dos
COMMIT concurrentes, tanto acuses invertidos como acuses en orden, conservan
`currentStateConfirmed: false`; un COMMIT posterior exclusivo lo confirma.
El runner cierra browser y clientes MCP, detiene los procesos anteriores y termina
con el comprobante B serializado en el único proceso restante. Después de detenerlo
exige cero intercambios y reservas Redis/aplicación, y confirmación exclusiva.
El `ok` final se calcula después del cleanup y depende también de ledgers sin
detención/incertidumbre. Ningún conteo de acuses concurrentes se presenta como
inventario actual.

La lectura inicial detectó entradas rechazadas y errores de proxy ausentes del
ledger; el cambio pasó el gate propio. También se corrigieron la categoría del
browser double (la presencia de `plan.instance` no prueba conexión real), el
BUILD_ID del reporte browser y el seguimiento de redirects del probe tardío.
Ningún resultado anterior a esas correcciones acredita esas comprobaciones.

El primer recorrido nativo con dobles y navegador se conserva en
`docs/evidence/sprint-native-redis-real/attempts/01/`. No está aprobado: el
reporte browser es `ok: false` y el ejecutor quedó incompleto. Sirvió el build
`PdR4-VW_nKMHSuJZwqGNR`, fingerprint de fuente
`9d943f96322cc1ccefe29013128a7119a9682dafd8e0bae44e3afdcfd4c6afd1`.
Los cuatro casos de chat mantuvieron el ancho y ratio 2/2 en texto ampliado.
El caso de biblioteca reportó una SECTION descendiente de details cerrado;
la captura fue revisada independientemente y no muestra esa sección pintada.
El gate corregido usa `checkVisibility` y conserva el primer summary visible
de details cerrado para medir contenido pintado.
Las precargas de navegación consumieron las 120 solicitudes de aplicación
antes del final. Ningún request externo se emitió. La nueva comprobación de
visibilidad y el cambio de prefetch requieren build, plan y recorrido nuevos;
esta evidencia parcial no aprueba recuperación, rotación o revocación finales.

La lectura independiente del delta de precargas confirma `prefetch={false}`
explícito en chat, biblioteca, navegación, pie y breadcrumb de las vistas privadas.
La opción se propaga como prop opcional por los componentes compartidos.
No se encontró un cambio de autorización, credenciales ni contenido en ese delta;
su comprobación en el nuevo build y recorrido sigue pendiente.

El segundo recorrido diagnóstico está en
`docs/evidence/sprint-native-redis-real/attempts/02/`, build
`gm2raEYLZ6s_bEH1FwtAC`, fuente
`01bde8c3069b92b97e7bcfce4a9549e5817183faa7c7d758fc60c4e8c7a44893`.
No está aprobado: la captura y medición de biblioteca a 390 px y texto 2×
confirman el botón visible “Pago y comprobante” fuera del ancho disponible.
La revisión independiente vio el texto recortado al borde derecho del tab.
Al mismo punto se consumieron 83/120 solicitudes de aplicación y no hubo
tráfico externo. La corrección de layout requiere otro build/plan/recorrido;
las comprobaciones de reinicio, rotación y revocación no se infieren de los
casos parciales. Estos dos intentos se preservan como diagnóstico, sin Redis real.

La corrección revisada en `app/history/deliveries.css` permite envolver el grupo
de tabs, elimina el ancho mínimo implícito del botón y permite ajustar palabras
al ancho. Su SHA-256 observado es
`2ac1d3b84a01a655120815c3a09a94c0193c1ae0244c4af392a450d255165700`.
El markup, roles tablist/tab/tabpanel y manejo de ArrowLeft/ArrowRight/Home/End
permanecen presentes; el nuevo recorrido debe comprobar el resultado visible.

El tercer recorrido diagnóstico está en
`docs/evidence/sprint-native-redis-real/attempts/03/`, build
`hunOK1cLkqAr9VJJ9Q3lE`, fuente
`5b03d83156e9c6bd0808bca07e0bd532bb6502d8c10f84d0147cc9ffdbe4105b`.
Los ocho casos browser pasan con texto ampliado ratio 2/2 y sin desbordes; la
revisión visual independiente de biblioteca 390 px y texto 2× confirma que
“Pago y comprobante” ocupa una fila dentro del ancho. El reporte incluye bloqueo,
reentrada, respuesta real tardía ignorada y recuperación exacta tras reiniciar Next.
El recorrido completo sigue **no aprobado**: observó un intento 121, permitió
120 solicitudes y detuvo `APPLICATION_BUDGET_EXHAUSTED`. Redis quedó en
294 solicitudes / 1.328 comandos; tráfico externo e incertidumbre: cero.
Este intento usa dobles y no acepta el sprint real.

La corrección final elimina cinco GET redundantes de readiness, uno por arranque.
Conserva la espera de `Ready in` y la primera operación API/browser necesaria por
arranque, con sus verificaciones de respuesta e identidad. No elimina ninguna
comprobación funcional ni amplía el máximo de 120; que el recorrido completo quepa
debe verificarse con un build y plan nuevos.

## Aptitud preparatoria del candidato local

La fuente final revisada tiene fingerprint
`a3c557c6ae2c567a181cb3f2770298c9702519a93b506d48f9fcd2b149c102ad`,
comprobado desde `sourceFingerprint()` después de los gates. La revisión del
COMMIT exclusivo, cierre tras cleanup y readiness no encuentra bloqueadores
para consolidar este candidato en un commit local. Esta aptitud permite avanzar
a la preparación del candidato; no es aceptación del sprint ni autorización
para escribir en Redis real.

Después del commit local se requieren build exacto del nuevo SHA, plan nuevo,
recorrido nativo completo con dobles y navegador dentro de todos los límites,
revisión del resultado y autorización humana del plan/margen antes de Redis real.

El coordinador informa typecheck y diez suites aprobadas. La primera ejecución
de `test-deliverable-viewers` salió con código 1 sin stderr retenido; una única
repetición con el mismo entorno y fingerprint pasó, sin cambiar la fuente viewer.
La causa del primer fallo no es recuperable de esa evidencia y no se atribuye a
un motivo supuesto. Esa regresión aprobada en la repetición debe leerse con este
límite. El recorrido nativo final conserva una comprobación independiente de
entrega inline; su resultado completo aún es requisito para avanzar a Redis real.

## Riesgos específicos del paso a Next

1. Congelar cinco claves requiere asignación de dos propietarios por servidor
   vinculada a la intención/hash inicial y verificada antes de cualquier lectura
   Redis. El usuario nunca aporta `ownerId`. Cualquier nuevo camino de asignación
   debe rechazar Vercel, prefijos no aislados, file, combinación parcial de opciones,
   relay no loopback y creación desconocida. No basta con que el relay rechace la
   sexta clave después de que el servidor la haya elegido.
2. El contador de aplicación debe incluir HTTP, MCP, readiness y navegador,
   incluidos HTML, JS, CSS, imágenes y errores. Los assets de Next pueden superar
   el tope anterior de respuesta individual de 64 KiB. Se preserva ese cap: no se
   aprueba una reserva dinámica mayor por asset. La distribución instrumentada
   mediante rangos de hasta 64 KiB es aceptable si cada rango atraviesa Next/proxy,
   cuenta requests y bytes globales, valida 206/Content-Range/tamaño/hash exactos
   del build final y detiene ante fallo sin retries ni fallback local. Se declara
   la instrumentación de assets; no certifica el transporte HTTP intacto de un
   recurso mayor al cap. Todo debe caber en 120 requests y 2 MiB globales.
3. Un único relay Redis y un único ledger de aplicación deben sobrevivir a los
   reinicios de Next. Crear ledgers nuevos al reiniciar permitiría multiplicar
   requests/comandos/bytes/duración.
4. El fingerprint tiene que incluir runner, proxy, preload y helper browser nuevos,
   aunque aún no estén tracked. El marcador de build debe identificar fuente exacta,
   SHA completo, BUILD_ID y hashes del build servido; una modificación posterior
   invalida el plan. No se acepta un build anterior por coincidir sólo el HEAD.
5. El proxy debe preservar la autoridad local exacta que valida el producto y contar
   todos los caminos de entrada. Hay que impedir bypass a los puertos Next privados
   por HTTP/MCP/browser y que SSE/reconexión emita intentos fuera del contador.
6. Ante pérdida de respuesta real, detener procesos, relay y efectos nuevos; guardar
   el intento y el resultado incierto. No crear un nuevo prefijo para esconder el
   intento anterior ni reintentar automáticamente; recuperación explícita separada.

## Evidencia requerida para aprobar el candidato final

| Categoría | Evidencia obligatoria |
|---|---|
| Procedencia | SHA completo final, lista/digests de cambios locales si los hay, Node 22.18.0, Next 16.3.1, BUILD_ID, hashes build y fuente, comandos exactos |
| Plan | Prefijo nuevo, cinco claves exactas, dos propietarios, IDs/payloads conservados, presupuesto completo, origen dedicado, hash/fingerprint vinculados al build final |
| Autorización | Confirmación humana específica del plan final y margen gratuito actual suficiente para todos los máximos, sin tokens en evidencia pública |
| Guard | Cero reintentos de transporte; SDK y MCP sin reconexión; CAS máximo ocho; reservas previas; error/acuse incierto detiene; bytes y conteos de todos los procesos/browser |
| Native Next | Procesos `next start` construidos, `NODE_ENV=production`, `configuredWorkspaceStore`, Redis obligatorio sin fallback file, dos procesos y reinicio con mismos IDs/valores |
| Identidad | Creación server-side única/idempotente, scopes, B no accede a A, condiciones cambiadas dan conflicto, rotación y revocación invalidan accesos anteriores después del reinicio |
| Human/agente | A crea chat/mensaje; agente externo sintético reclama; respuesta/operación guardadas antes del registro; entrega, respuesta única y comprobante exactos recuperados |
| Browser/Redis | Magic Link recupera exactamente registros finalizados; token fuera URL y local/session storage; teclado, bloqueo limpia contenido y borrador, reentrada, respuesta real tardía ignorada |
| Layout | 390×844 y 1366×768, texto calculado 2×, controles/texto sin desbordes, capturas sin secretos y reporte de mediciones |
| Regresiones | Tipos, build y regresiones pertinentes sobre la fuente final; fallos/corrupción/acuse perdido sólo con dobles |
| Cierre | Informe real y browser distinguidos de dobles/file; tablero, manifiesto y reversión actualizados; revisión independiente final explícita |

Máximos intactos: 400 solicitudes Redis; 2.400 comandos contando EVAL/Lua;
16/32 MiB enviados/recibidos Redis; 65.536 bytes por cuerpo Redis;
16.384 bytes registry y por owner; 49.164 bytes valores almacenados;
dos propietarios; 120 requests de aplicación; 1/2 MiB cuerpos de aplicación;
120 segundos globales; cinco segundos por request HTTPS remoto;
ocho intentos CAS de cuota; cero reintentos de transporte.

Esta revisión no certifica backups ni recuperación tras perder Redis; no sustituye
la revisión de publicación posterior. El sprint permanece pendiente hasta que el
recorrido nativo completo con Redis real y Magic Link pase la revisión final.
