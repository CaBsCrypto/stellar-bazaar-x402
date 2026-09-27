# Misión Bazaar — recorrido completo local

Fecha: 2026-09-27. Coordinación: Scrum Master de esta sesión. Esta evidencia no habilita pagos publicados.

**Cierre local aprobado sobre código `674bfcabc16e7883aee690247d9b450d39b16205`: 30 suites PASS, tipos PASS, compilación webpack PASS y MCP HTTP PASS.** El comprador independiente repitió el handoff en ese mismo SHA y recuperó una entrega idéntica, un registro y contadores1/1 sin ayuda de implementación. El commit posterior contiene únicamente informe y evidencia.

## Alcance y base

Objetivo: descubrir → comprobar condiciones → compra simulada → respuesta conservada → historial privado → recuperación sin nueva liquidación. Vendedor: idea/API → borrador → validación → solicitud de revisión, sin aprobación automática.

Se confirmó por GitHub `origin/main=76ba7b19eacb424d8c9e872a2d01569e1eb45b3d`. PR54 Base (`74838cc`) y PR55 Identidad (`5500652`) seguían abiertos en borrador y con CI aprobada. No hubo push, merge, despliegue, pagos, faucets, contrataciones ni cambios de datos históricos durante esta misión. Las cuatro ramas adicionales son locales y NO están cubiertas automáticamente por las exclusiones Vercel de PR54/55: antes de cualquier push habrá que revisar nuevamente despliegues.

Runtime local: Node22.18.0, Windows. CI permanece Node22. Los checkouts usan dependencias existentes mediante junction; por ese motivo se compiló con `next build --webpack`. Esto no sustituye una ejecución nueva de CI Linux/Turbopack para los commits no publicados. `metadataBase` produce un aviso de fallback localhost; no impide compilar.

## Equipo y revisión independiente

| Rol | Responsable | Revisor / evidencia |
|---|---|---|
| Scrum Master e integración | Coordinador raíz | Único integrador de las ramas locales |
| Base y ramas | pr_base, checkout mission-identity | pr_runtime reprodujo fallo/solución y pruebas de propiedad WebMCP |
| Identidad y vendedor | pr_identity, checkout buyer-independent | pr_runtime verificó ACL/junction; comprador independiente revisó guías |
| Comprador y persistencia | pr_runtime, checkout mission-base-audit | pr_base repitió USDC/XLM y shared; coordinador repitió integración |
| Producto / comprador desde cero | full_independent_buyer, contexto nuevo | Solo prompt, handoff y guías; estado en TEMP; no leyó implementación/tests |

Máximo tres especialistas ejecutándose simultáneamente. Los autores editaron checkouts separados. La aceptación del comprador fue realmente independiente del autor; las pruebas unitarias no se presentan como esa aceptación.

## Tablero y matriz

| Flujo | Dependencia | Evidencia | Resultado / límite |
|---|---|---|---|
| Base y WebMCP | PR54 + corrección de propiedad | lifecycle/native/async/conformance; revisión no autora | Aprobado dentro de las garantías descritas abajo |
| Identidad | PR55 + ACL/junction | chat, provisioning, history, private-WebMCP | Parejas registradas, mínimo privilegio, desconocidas rechazadas |
| Entrada comprador | guía y componente compartido | buyer-instructions, buyer-copy y navegador | Mismo prompt portada/hub; copia y selección manual; referencias locales en handoff |
| MCP HTTP | discovery + identidad | SDK StreamableHTTP real sobre loopback | 8 herramientas, inicialización, búsqueda, ficha, capacidades, autenticación y recuperación desde cliente nuevo |
| Descubrimiento | registro público | public-discovery/resource-render/conflicts + navegador | Estático/dinámico, estado parcial/error y colisiones corregidos; revisión independiente aprobada |
| Vendedor | borrador, self-listing | publisher-brief, provider-self-listing, card-preservation | Idea/API, precio pendiente/inválido, control fallido, staging sin publicación; sin envíos externos |
| Selección USDC/XLM | piloto durable | xlm-pilot, testnet-transfer, buyer-acceptance | Presupuestos y unidades separados, saldo gastable, contrato/red/importe/destino y firmante |
| Persistencia | marcador estable antes del efecto | shared-settlement-local, 3 procesos | Un intento simulado; incertidumbre, corrupción y escritura fallida bloquean |
| Recuperación | respuesta persistida antes de historial | automatic-recovery, delivery-recovery, aceptación | Reintenta registro, no pago; mismo resultado/operación desde otro proceso |
| Biblioteca | autenticación y entrega | history/client/UI + navegador real | Hash retirado, bloqueo, reentrada, contenido y borrador retirados |
| Archivos | handlers y almacenamiento doble | deliverables/viewers | Integridad y parámetros de caducidad simulados; persistencia externa pendiente |
| USDT0 | rama experimental 5ffa9a2 | 14 escenarios aislados y readiness | Simulado; adaptadores reales bloqueados; no entra en catálogo |

Comandos USDT0: `node scripts/test-usdt0-simulation.mjs` y `node scripts/test-usdt0-readiness.mjs`, extraídos del SHA `5ffa9a2` a un directorio TEMP aislado con las dependencias existentes. No se incorporaron a las ramas del recorrido básico.

Pruebas por bloque (antes de la última corrección de descubrimiento):

| Árbol / SHA | Pruebas ejecutadas | Tipos / build |
|---|---|---|
| Foundation384ecb3 | lifecycle, native, async, identidad, provisioning; revisiónpr_runtime | Ambos PASS en checkout separado |
| USDC/XLMf24741e | piloto/recibos/recuperación/identidad/WebMCP; revisorpr_base | Ambos PASS en e4bb353, árbol idéntico verificado con gitdiff vacío tras ordenar commits |
| Shared6a7ea00 | shared-local3procesos, piloto, historial, recuperación | Ambos PASS |
| Discoverycf78dd8 | public-discovery, resource-render, WebMCPconformance/paymentoptions | Ambos PASS; hallazgo posterior en revisión cruzada exige nueva ejecución |
| Buyer191d0ab | 28 suites allowlist | Ambos PASS; correcciones posteriores requieren ejecución final |
| Discovery33bb6fe | conflictos, fichas, discovery/conformance/paymentoptions | Tipos y build PASS; revisión no autora de5684125 (mismo parche) aprobada |
| Integración674bfca | 30 suites + MCP HTTP3230 + comprador independiente desde cero | Tipos PASS; build PASS; escáner actual/build sin coincidencias |

## Hallazgos corregidos y límites de diseño

- WebMCP usaba una instantánea asíncrona para decidir una eliminación por nombre: el reproducer borró una herramienta reemplazada por otro componente. Ahora solo elimina cuando puede comprobar identidad actual síncrona del manejador. Con metadatos, error o enumeración asíncrona limpia el espejo propio, conserva el registro nativo y puede rechazar un nuevo montaje. Se necesita un identificador de registro o borrado condicionado para garantizar limpieza nativa en ese caso. No se promete compatibilidad completa con todos los navegadores.
- ACL efectiva del directorio y archivos del aprovisionamiento verificada en Windows con datos sintéticos. Junction temporal hacia el repositorio rechazada. No se crea endpoint público de aprovisionamiento.
- Gate HTTP de pagos aplicado antes del facilitador también fuera de `pilot=true`. El modo compartido continúa bloqueado incluso con la bandera de pagos habilitada.
- MCP tenía cobertura de historial no autorizado, pero faltaba lectura autorizada por transporte real: se añadieron propietario correcto, otro propietario, desconocido, concurrencia y cliente nuevo usando handlers reales y almacenamiento doble.
- El comprador independiente detectó requisito Node24 desalineado, formato de operación sin explicar y falta de caso publicado sin fondos. Handoff actualizado a22.18; IDs8–128; `--fault funds` rechaza con0 firmas/0 liquidaciones.
- Las guías de vendedor tenían promesas contradictorias de autopublicación y credencial del proveedor. Se corrigieron las tres referencias entregadas; tras el segundo hallazgo se revisó el conjunto completo, no solo la frase. El registro público requiere acción administrativa del operador, distinta de recepción/revisión/staging.
- Descubrimiento admitía colisiones de identificadores estáticos/dinámicos y ocultaba huecos del índice. Se rechazan altas con ID reservado. Las colisiones antiguas se conservan almacenadas, se excluyen de la vista pública y producen estado parcial. Entradas válidas de un registro incompleto siguen disponibles con aviso. Se añadieron pruebas de null, forma inválida, ID discordante y duplicados; no se modificaron datos reales.
- Los proxies de revisión bloquean rutas API alternativas y codificadas; un GET no se considera automáticamente inocuo. La prueba con upstream sintético comprueba que peticiones bloqueadas no llegan al servidor y no se reenvían cookies/autorización.
- Las garantías durables comprobadas pertenecen al piloto con diario e ID estable. La ruta legacy USDC sin esas opciones no adquiere automáticamente las mismas garantías. No anunciar protección universal contra duplicaciones.
- Un diario local restaurado/perdido no puede certificar por sí solo que nunca existió un intento posterior. Bloquear y reconciliar con evidencia independiente; no borrar locks ni marcadores para volver a pagar.

## Aceptación independiente

El agente recibió únicamente `docs/BUYER_HANDOFF.md`, `public/llms.txt`, terminal y MCP. Ejecutó los comandos publicados en carpetas TEMP nuevas, sin wallet real, secretos ni ayuda de implementación.

| Caso | Resultado | Firmas/liquidaciones |
|---|---|---|
| Compra XLM0.01 autorizada | Entrega, hash y un registro privado | 1/1 → recuperar1/1 |
| Respuesta perdida / incierto | PAYMENT_PENDING conservado | 1/1 → recuperar1/1 |
| Historial fallido | Respuesta disponible; recuperación registra una vez | 1/1 → recuperar1/1 |
| Sin historial | disabled, sin Magic Link inventado | 1/1 → recuperar1/1 |
| Sin presupuesto | EXPLICIT_BUDGET_REQUIRED | 0/0 |
| Sin firmante | PAYER_AND_RECEIPT_VERIFIER_REQUIRED | 0/0 |
| Sin fondos (segunda iteración) | NO_AUTHORIZED_FUNDED_OPTION | 0/0 |
| Nueva compra y recuperación tras correcciones | Mismo ID y una entrega | 1/1 →1/1 |
| Vendedor idea/API | Preparación comprensible, sin envío ni publicación | No aplica |

Los recibos siguen declarados por el agente: `reported-unverified`, entrega con hash coincidente, sin certificar liquidación real. La incertidumbre no se resuelve automáticamente; no existe comando `reconcile` en el ejecutor simulado.

## Comandos permitidos y reproducción

Desde la raíz del checkout, Node22.18.0 y dependencias instaladas. No cargar `.env` reales. El runner conserva únicamente variables de sistema necesarias y usa una lista explícita de suites.

```powershell
node scripts/test-buyer-mission.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build --webpack
node scripts/scan-secrets-redacted.mjs
```

`docs/buyer-mission-results.json` guarda SHA, árbol modificado, runtime, comandos, salidas y códigos de las suites. El recuento no reemplaza la matriz de escenarios.

Revisión visual, procesos separados sin credenciales:

```powershell
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3230
node scripts/serve-history-review.mjs 3231 3230
node scripts/serve-discovery-review.mjs --port=3232
node scripts/serve-discovery-review.mjs --port=3233 --unavailable
node scripts/serve-text-review.mjs 3234 3230
```

La biblioteca3231 usa exclusivamente la pareja sintética pública documentada en el harness; no copiar credenciales históricas. El proxy3234 duplica tamaños de texto calculados después de la carga inicial; **no es zoom de navegador**. Sus escrituras/API están restringidas. La prueba MCP HTTP general debe apuntar al servidor correcto:

```powershell
$env:MCP_BASE_URL='http://127.0.0.1:3230'
node scripts/test-mcp-onboarding.mjs
```

Un primer intento apuntó al puerto3000 predeterminado y recibió HTML: se registró como configuración incorrecta, no aprobado. Al repetir contra3230 pasó (8 herramientas,0 escrituras). Una lista inicial también nombró un test inexistente `test-payment-options`; se corrigió a `test-webmcp-payment-options` sin omitir la cobertura.

## Evidencia visual

En `docs/review/full-mission/`: portada, conexión, publicación, catálogo, ficha y biblioteca en390×844 y1366×768; estados vacío/error y texto200%. Datos exclusivamente sintéticos. Se comprobó selección manual completa, confirmación de copia, foco contenido del diálogo, Escape y retorno, bloqueo y reentrada sin borrador. La confirmación de copia y pruebas del handler no certifican integración de portapapeles con todas las aplicaciones externas.

Las capturas iniciales usaron el build191d0ab (guías y harnesses posteriores no modificaban su UI). Los estados finales y el MCP se repitieron con el build674bfca tras la corrección de integridad del registro. Texto ampliado: tamaños calculados duplicados en la carga inicial mediante proxy3234; no certifica zoom nativo ni contenido insertado después de esa ampliación. No hubo desbordamiento horizontal de página en las vistas revisadas; se permite desplazamiento vertical. En el navegador integrado el atajo de zoom no cambió el viewport, por eso no se atribuye esa evidencia a zoom real.

## Puertas externas que siguen cerradas

| Pendiente | Causa | Condición de desbloqueo |
|---|---|---|
| Redis real / durabilidad | Esta misión usó dobles; no acreditó entorno aislado gratis, backup/restauración ni pérdida de datos | Confirmar instancia/prefijo exclusivo, política sinTTL/evicción, garantías y recuperación; autorizar pruebas aisladas sin históricos |
| Archivos externos | S3/R2 e integridad/caducidad fueron simulados | Almacenamiento aislado gratis, subida/descarga/caducidad reales y recuperación verificadas |
| Credenciales históricas | Escáner conserva un hallazgo histórico conocido; vigencia/rotación no comprobadas | Confirmar revocación/rotación antes de reutilizar; no imprimir ni reescribir el secreto |
| Compra Testnet nueva | Fuera del alcance, pagos bloqueados | Revisión separada de activos, importes, firmante, destinatario, facilitador y persistencia |
| USDT0 real / multichain | Solo simulación y documentación | Ruta oficial gratuita y facilitador por red/contrato confirmados, luego piloto autorizado |
| Publicación / Preview / merge | No autorizados en esta misión | Revisar los PR y protección contra despliegues antes de cualquier push |

Evidencia histórica Testnet se conserva como categoría separada; no se consultaron ni modificaron esas compras en esta misión. PR15 Website Intelligence, PR20 escrow y PR32 fee split quedan aparcados.

## Orden local de revisión

1. PR54 Base, seguido de la corrección de propiedad WebMCP.
2. PR55 Identidad, seguido de la comprobación ACL/junction. `review/validation-foundation=384ecb3`.
3. `review/usdc-xlm-recovery=f24741e`, árbol idéntico al validado inicialmente `e4bb353` tras ordenar las dependencias.
4. `review/shared-payment-control=6a7ea00`, depende del anterior, habilitación bloqueada.
5. `review/consistent-discovery=33bb6fe`, depende del compartido; corrección adicional revisada.
6. `review/buyer-entry-validation=674bfca`, depende de descubrimiento; guías, ejecutor, MCP y nuevas regresiones.
7. `mission/full-validation`: referencia final de integración y evidencia; código674bfca seguido del commit documental de cierre.

Las ramas fuente `mission/consolidation`, `mission/buyer-validation`, `experiment/usdt0-simulation`, la rama de fondos y todos los demás worktrees permanecen conservados. No se archivó ni eliminó trabajo. Los informes importados sobre Redis/Preview son antecedentes, no evidencia de verificaciones nuevas.
