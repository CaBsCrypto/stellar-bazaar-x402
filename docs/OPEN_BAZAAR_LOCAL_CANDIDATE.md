# Bazaar abierto — expediente local

Fecha: 2026-09-30. Coordinación: Scrum Master de esta sesión.

## Candidato y alcance

Rama `mission/open-bazaar-local`, base `cd709ca`. El commit `b780db4` conserva
el trabajo previo de skills y solicitudes MCP. Código candidato: `c92e084`.
Los commits posteriores de evidencia no cambian ese código.

Recorrido: skills → alta privada idempotente → mensaje humano → tarea reclamada
por un agente externo → respuesta y resultado inline conservados → biblioteca
del mismo propietario → bloqueo y recuperación. Bazaar no aloja un modelo.

No hubo push, merge, despliegue, compra, transferencia, faucet ni escritura en
Redis/S3 externos. Las ramas originales y los registros históricos se conservan.
El candidato no sustituye la aplicación publicada.

## Equipo y revisión

| Responsable | Autoría | Revisión |
|---|---|---|
| Coordinador | MCP, guías, helpers privados y adaptación del visor inline | Especialista de aceptación; otro agente siguió únicamente guía y OpenAPI |
| Identidad/persistencia | Hashes, propietarios, permisos, límites, CAS, Redis y archivos | Especialista de aceptación independiente |
| Chat/producto | Conversaciones, tareas, bloqueo, reentrada y actualización manual | Especialista de aceptación y navegador del coordinador |
| Aceptación independiente | Cliente SDK real, dos procesos HTTP, fallos y recuperación | Gates separados de las pruebas de los autores |

Máximo tres especialistas simultáneos, checkouts separados. Solo el coordinador
incorporó los commits locales a la rama candidata.

## Contrato entregado

- MCP 0.7.0: **17 herramientas, seis de escritura**. Una fuente canónica alimenta
  health, capacidades, OpenAPI, guías y pruebas. No hay herramientas de pago,
  firma, aprobación administrativa o activación.
- Descubrimiento público sin credencial; solicitudes de proveedor con su propio
  token; tareas/historial con acceso de agente. El secreto de recuperación solo
  crea, renueva o revoca su espacio. Nunca se reutilizan esos accesos.
- Alta: cliente conserva UUID y tres secretos independientes antes de enviar;
  servidor asigna propietario, espacio y agente, y guarda solo hashes. Misma
  intención recupera el mismo espacio; condiciones distintas producen conflicto.
- Humano: lectura de entregas y escritura de sus mensajes. Agente: tareas,
  respuestas, actividad y resultados gratuitos/simulados. Los enlaces históricos
  de lectura no adquieren permisos de chat ni escritura.
- Rotación con generación esperada; revocación conserva el tombstone y los datos.
  Repetir una creación no restablece accesos. Perder todos los secretos no permite
  recuperar propiedad por conocer un identificador.
- Chat y biblioteca usan actualización inicial y manual, sin sondeo indefinido.
  El token se retira de la URL y queda en memoria. Bloquear retira vista/borrador
  y cancela solicitudes; no revoca un enlace conservado.
- Solo resultados inline. Las cargas y accesos a archivos externos siguen
  deshabilitados para los espacios abiertos. Solicitudes pendientes no aparecen
  en catálogo; revisión, preparación y activación siguen separadas.

## Hallazgos corregidos

| Hallazgo reproducido | Corrección y prueba |
|---|---|
| Next normaliza `127.0.0.1` como `localhost`, rechazando el origen local correcto | Comprobación del Host y origen exactos; rechaza alias, puertos y autoridad reenviada contradictorios |
| MCP eliminaba cabeceras que HTTP debía rechazar | Conserva Origin, Host, Forwarded y cabeceras de protocolo/puerto en el contexto por petición |
| Windows devolvía EPERM al adquirir el lock de archivos | Reintento acotado únicamente de `open("wx")`, antes del callback; mismo límite de 2,5 s, sin repetir escrituras ni limpiar journals |
| Alta idéntica concurrente podía devolver 409 después de existir un ganador | Una lectura adicional vinculada al propietario confirmado, sin commit, vuelve a validar autorización y condiciones |
| Redis rechazaba altas idénticas por CAS0 aunque el primer intento ya estaba guardado | Reconciliación de lectura autenticada tras CAS0 confirmado; seis altas devuelven un único espacio |
| La cuota compartida podía contender con otra petición válida | Hasta ocho intentos solo tras CAS0 confirmado sin escritura; revalida identidad y capacidad en cada intento, agota con 503 y no reintenta un acuse perdido |
| Rotación simultánea resolvía un bootstrap con generación antigua | Valida su hash dentro de la transacción; CAS del cambio mantiene un ganador y un conflicto explícito |
| Magic Link reabierto en la misma pestaña no se capturaba | Listener de fragmento, limpieza previa, cancelación y aislamiento de respuestas tardías |
| El visor interpretaba cargas deshabilitadas como acceso inválido | Consulta inline autenticada de una operación propia; devuelve lista de archivos vacía, sin consultar S3; uploads permanecen rechazados |
| Actividad/entrega consultaban cada cinco segundos | Carga inicial y botones de actualización manual; conserva selección y cancelación |
| Guías/pruebas afirmaban MCP de lectura o seis pilotos | Contrato canónico y expectativas actuales; planes históricos identificados como tales |
| La documentación local copiaba referencias de producción y confirmaba una copia fallida | Resuelve el origen después del montaje; espera el portapapeles, permite selección manual y descarta confirmaciones tardías o anteriores |
| La tabla de endpoints usaba `q`, prometía un catálogo completo y relevancia perfecta | Usa `query`, describe filtros y estados parciales; revisión independiente contra los handlers |

## Evidencia y comandos

Runtime: **Node 22.18.0**, Next 16.3.1, SDK MCP 1.30.0. Dependencias existentes;
no se añadió un paquete. Ejecutar desde este checkout identificado, sin archivos
`.env` ni credenciales reales. No ejecutar suites Redis externas por analogía.

```sh
node --version
node node_modules/next/dist/bin/next build --webpack
node node_modules/typescript/bin/tsc --noEmit
node scripts/test-open-workspace-core.mjs
node scripts/test-open-workspace-next-http.mjs
node --experimental-strip-types scripts/test-open-workspace-redis-contention.mjs
node scripts/test-open-bazaar-independent.mjs
node scripts/diagnose-workspace-file-concurrency.mjs
node scripts/test-workspace-chat.mjs
node scripts/test-private-workspace-chat-ui.mjs
node scripts/test-private-workspace-chat-lifecycle.mjs
node scripts/test-private-purchase-manual-refresh.mjs
node scripts/test-provider-mcp.mjs
node scripts/test-buyer-instructions.mjs
node scripts/test-seller-instructions.mjs
node scripts/test-agent-entry-copy.mjs
node scripts/test-buyer-mcp.mjs
```

También se ejecutaron regresiones locales de historial, cliente, visor, actividad,
entregables, rotación, identidad, ciclo privado, descubrimiento WebMCP, recepción,
almacén de revisión, sesión administrativa, revisión pública, USDC/XLM y control
compartido simulado. Las pruebas de onboarding y política MCP usaron
`MCP_BASE_URL=http://127.0.0.1:3282` (origen, sin añadir `/api/mcp`).

Webpack y tipos aprobados. Turbopack con el enlace local de dependencias no se
presenta como aprobado. Se mantiene la advertencia de `metadataBase` para imágenes
sociales; el manifiesto de publicación deberá fijar el origen HTTPS correcto.
Errores iniciales de comandos/puertos inexistentes se corrigieron y no cuentan
como pruebas aprobadas ni como regresiones del producto.

| Área | Categoría | Evidencia |
|---|---|---|
| Skills, catálogo y MCP | Cliente SDK real sobre datos sintéticos | Herramientas/capacidades/downloads coherentes; servicio desconocido y catálogo parcial |
| Alta, permisos, rotación y revocación | HTTP real + almacenamiento local aislado | Concurrencia, reinicio, colisiones, acceso ajeno, generación y tombstones |
| Identidad y Redis CAS | Doble REST local con SDK Upstash instalado | Pérdida de acuse, ningún retry SDK adicional, corrupción y ausencia de fallback |
| Contención Redis | Dos pruebas independientes con SDK y doble REST local | Seis altas idénticas: una creación, cinco recuperaciones; seis incrementos de cuota; CAS0 acotado, revocación concurrente y acuse perdido sin otro efecto |
| Chat → tarea → respuesta → operación | HTTP/MCP real sobre datos sintéticos | Un propietario, intento estable, mismo resultado; otro propietario no accede |
| Solicitud de proveedor | HTTP/MCP real, archivos locales aislados | Reenvío explícito, comprobante aceptado inmutable, recepción cerrada y registro inaccesible sin falso éxito |
| Biblioteca | Navegador real + dobles de hooks | 390×844 y 1366×768; resultado, actividad, teclado, bloqueo y reentrada; capturas sintéticas |
| Texto al 200 % | Pendiente de revisión manual | El zoom de teclado no cambió el texto en el navegador interno; no se declara aprobado |
| USDC/XLM/control compartido | Local con dobles | Presupuestos, saldo gastable, alteraciones, incertidumbre y recuperación sin nuevo pago |
| Compras históricas | Evidencia anterior separada | No se consultaron ni modificaron en esta fase; no cuentan como compra nueva |
| Redis/S3 externos y desarrollador remoto | Pendiente | Requieren validación independiente y condiciones de publicación aprobadas |

La aceptación independiente final y los conteos del probe están en
[review/OPEN_BAZAAR_REVIEW.md](review/OPEN_BAZAAR_REVIEW.md). Los tests nunca
convierten un timeout, lock persistente, journal pendiente o corrupción en permiso
para otro efecto. Un lock persistente conserva sus datos y devuelve 503 acotado.

El escáner redactado no encontró seeds ni coincidencias con los valores privados
que comprueba en el árbol actual. El diff no incluye paquetes privados ni credenciales.
Conserva un hallazgo histórico separado en `e16ccd8`; su vigencia no queda resuelta
por esta revisión. No se reutilizaron esas credenciales.

### Ejecuciones y revisión del candidato

| Código | Ejecución | Resultado |
|---|---|---|
| `cbdc45c` | Probe independiente: 20 rondas, 40 procesos Next y 120 POST | 20×201 y 100×200; 0×409/503; tres contenciones EPERM recuperadas antes del callback; propietario único por intento |
| `a480494` | Suite independiente completa, Node 22.18.0, SDK MCP real y dos servidores Next; directorio privado de evidencia `bazaar-independent-open-Fo54dU` | Aprobada; incluye flujo del helper, scopes, chat, inline, reinicio, recuperación, proveedor y doble Redis. Cero pagos o escrituras externas |
| `a480494` | Core, chat y prueba dirigida de contención Redis | Aprobadas; seis altas HTTP 201/200, una creación y cuota exacta; fallos inciertos no repiten una mutación |
| `406bb82` | Revisión independiente de la corrección de copia y prueba ejecutada de hooks/portapapeles | Aprobada; éxito → nuevo intento pendiente → error no conserva confirmación anterior |
| `f421b24` | Revisión independiente de la tabla de descubrimiento contra sus handlers | Aprobada; revisión documental, no una nueva suite completa |
| `f421b24` | HTTP/MCP, políticas y dos procesos Next | Aprobados: 17 herramientas, seis escrituras, pagos inactivos; seis altas y 15 lotes de reenvío |
| `d83f708` | Revisión independiente y cuatro pruebas Node 22 de entrada/copia/instrucciones | Aprobadas; la pestaña MCP y /publish mantienen el origen local y los datos escritos por el humano |
| `c92e084` | Revisión independiente y prueba del componente CopyText compartido | Aprobada; una segunda copia pendiente no muestra la confirmación anterior |
| `c92e084` | Tipos y compilación Webpack con entorno acotado, sin credenciales reales | Aprobados; la advertencia de metadataBase permanece separada |
| `c92e084` | Navegador real sobre el servidor construido: chat recuperado tras reinicio, bloqueo, documentación y pestaña MCP móvil | Aprobado sobre datos sintéticos; referencias locales, contenido retirado al bloquear y ninguna credencial en las capturas |
| `c92e084` + este informe | Escáner redactado del árbol y build | Cero seeds/coincidencias privadas comprobadas; conserva el hallazgo histórico separado, sin resolver su vigencia |

Las regresiones de historial, publicación, USDC/XLM y control compartido se
ejecutaron sobre `9bdd2f0`; sus áreas no se modificaron después salvo el enlace
de vuelta al chat, revisado en fuente y navegador sobre `cbdc45c`. El cambio
Redis posterior fue reproducido por dos especialistas en sus propios tests.
Las capturas normales muestran datos sintéticos; no sustituyen texto al 200 %.

Capturas guardadas: [chat de escritorio](evidence/open-bazaar/chat-desktop.png),
[chat móvil](evidence/open-bazaar/chat-mobile.png),
[biblioteca de escritorio](evidence/open-bazaar/library-desktop.png),
[biblioteca móvil](evidence/open-bazaar/library-mobile.png) y
[configuración MCP móvil](evidence/open-bazaar/hub-mcp-mobile.png).
Chat de escritorio y configuración MCP móvil corresponden al servidor final
`c92e084`; las demás capturas documentan los recorridos anteriores indicados arriba.

Tras CAS0 confirmado, el alta hace una única reconciliación de lectura que
verifica UUID, bootstrap, hashes iniciales y documento del propietario estable.
Un match conserva el recibo; condiciones distintas dan 409, bootstrap distinto
401, y ausencia/inconsistencia 503. Solo la cuota admite hasta ocho intentos
tras CAS0 probado sin escritura. Un timeout, acuse perdido o resultado desconocido
no autoriza reintentos automáticos. Rotaciones, mensajes, operaciones y actividad
mantienen una sola mutación por intento; su recuperación es explícita.

En HTML previo a la hidratación, los ejemplos conservan la referencia pública.
La copia del componente montado usa el origen visible. Para pruebas reproducibles
de terminal se usan siempre las referencias locales explícitas de la guía.

### Cambios conservados por funcionalidad

| Bloque | Commits de entrada y correcciones principales | Disposición |
|---|---|---|
| Suite MCP/proveedores | `b780db4`, `ebcba36`, contextos `805050c`/`c5001c8` | Candidato local, herramientas y pruebas independientes |
| Identidad/almacenamiento | `4483c6a`, `3c516e7`, `c91f1bb`, `98dde7a`, `42fd75d`, `5b490ab` | Candidato local; Redis real pendiente |
| Chat/biblioteca | `a0cef54`, `34b067a`, `4377088`, `88689ea`, `e252d37`, `9bdd2f0`, `cbdc45c` | Candidato local con navegador y dobles |
| Referencias y copia | `d0ccfb7`, `406bb82`, `59e2109`, `f421b24`, `d83f708`, `c92e084` | Revisión independiente aprobada; texto al 200 % pendiente |
| Pruebas/informe independiente | `c1ef640` y regresiones hasta `a480494`; informe `2a41fdd` | Conservar trazabilidad; no reescribir ramas históricas |

Los commits de diagnóstico se conservan en la cadena local. Antes de preparar
una actualización se revisará su agrupación y dependencias; ninguno se ha subido.

## Paquete para el desarrollador

Entrada local: `http://127.0.0.1:3282/docs#skills`. Guía descargable:
`/WORKSPACE_AGENT.md`; skills: `/skills/buyer/SKILL.md`, `/skills/seller/SKILL.md`
y `/skills/recovery/SKILL.md`. MCP: `/api/mcp`.

Prompt breve:

> Consulta las skills y todas las herramientas de este Bazaar. Ayúdame a crear mi
> espacio privado, conservar mis accesos y conectar mi agente. Trabajemos con un
> ejemplo gratuito o simulado y recuperemos su entrega. Para ofrecer mi servicio,
> prepara y valida la ficha y envía su solicitud solo cuando autorice las condiciones.

Requisitos: terminal, Node 22.18+, dependencias del checkout, almacenamiento privado
y transporte MCP con Authorization configurable. `examples/agent-workspace-mcp.mjs`
prepara el paquete antes del alta; `agent.json` es la única copia delegada al agente.
`human-links.txt` abre chat y biblioteca. El dueño conserva `workspace-root.json`
y el secreto de recuperación fuera del repositorio. Los ejemplos son internos,
no un SDK instalable publicado. La guía incluye los cuerpos HTTP humanos y las
operaciones/actividad inline reproducibles. Proteger también las trazas del cliente.

## Configuración y reversión propuestas

Solo el servidor local de revisión tiene `BAZAAR_ENABLE_OPEN_WORKSPACES=true`.
Usa backend file y directorio temporal sintético. La configuración de ejemplo
mantiene la función cerrada por defecto.

Para una futura publicación se necesitarán backend Redis, origen HTTPS exacto,
prefijo exclusivo `bazaar-workspace:preview` o `bazaar-workspace:production` y
credenciales privadas `BAZAAR_WORKSPACE_REDIS_REST_URL/TOKEN`. No hay aliases ni
fallback a archivos. Nunca colocar claves de firma o accesos administrativos en
el paquete del agente. La recepción de proveedores se habilita por separado.

Mantener `X402_PILOT_PAYMENTS_ENABLED=false`, `X402_LEGACY_PAYMENTS_ENABLED=false`,
`X402_ENABLE_LOCAL_PAYER=false`, `BAZAAR_ENABLE_PROVIDER_ACTIVATION=false` y
`BAZAAR_ENABLE_REGISTRY_MUTATIONS=false`.

Revertir cerrando la bandera del espacio/recepción y conservando el backend,
hashes, entregas, solicitudes y tombstones. No borrar Redis ni restaurar una
autenticación que infiera propietarios. Una restauración conocida exige detener
efectos y reconciliar; una copia antigua no demuestra qué ocurrió después.

## Condiciones pendientes antes de publicar

1. Presupuesto nuevo y explícito para Redis: confirmar instancia/prefijo, margen
   gratuito, claves sintéticas y máximo de comandos/bytes antes de escribir.
   Esta fase no autoriza escrituras externas ni certifica durabilidad/respaldo.
2. Revisar texto ampliado y un dispositivo real; las capturas normales no lo sustituyen.
3. Presentar manifiesto de SHA, dominio, variables y reversión; autorizar aparte
   configuración y despliegue. No heredar autorización de fases anteriores.
4. Tras publicar, un desarrollador remoto deberá conectar su agente, enviar una
   solicitud y recuperar su entrega sin ayuda ni credenciales administrativas.

Pagos, archivos externos durables, multichain/USDT0 y activación automática quedan fuera.
