# Panel humano — revisión local, 2026-09-08

Repositorio: CaBsCrypto/stellar-bazaar-x402. Rama: codex/agent-operation-history. Se ampliaron los cambios locales del historial sin publicar ni realizar pagos.

## Implementado

- API privada por tareas, pasos y compras; cursores ligados al propietario y filtros, con anclas inmutables para evitar desplazamientos por nuevas escrituras.
- SDK con pasos y correlación taskId/operationId. Conservación explícita de resultados; fallos de historial separados del pago.
- Lectura de resultados, descargas privadas de archivos pequeños y acceso al proveedor para referencias externas. Las referencias no otorgan por sí solas derechos en el proveedor.
- Panel con filtros, paginación, actualización cada cinco segundos en pestaña visible y borrado al bloquear. Las páginas cargadas se mantienen durante la actualización.
- Herramientas WebMCP privadas registradas fuera del emulador público, protección frente a desconexión durante una llamada y validación de que los accesos de lectura/escritura corresponden al mismo propietario.
- Guía común expuesta en capacidades MCP, manifiesto WebMCP, respuesta de listado WebMCP y onboarding del comprador.

## Validación ejecutada

- test:history: pasa.
- test:activity: pasa; aislamiento, idempotencia, conflicto, paginación, resultados privados, archivos, interrupciones y fallo del registro sin nuevo pago.
- Registro nativo simulado: pasa; herramientas privadas, desconexión, fin de tarea, ausencia de eventos públicos y renderizado inerte.
- test:provider-card, test:mcp:onboarding, test:webmcp:suite y test:agent:policy:evals: pasan. La prueba de políticas esperaba siete herramientas; se actualizó a las ocho herramientas de lectura ya existentes, conservando el rechazo de mutaciones.
- TypeScript y build: pasan.
- Navegador con backend aislado de prueba: acceso, selección de compra, apertura del resultado, actualización y bloqueo comprobados. Los datos son mock; el almacén de esta prueba es un modelo en memoria.

## Pendiente de entorno

- test:activity:redis no pudo comenzar: Docker engine unavailable. Se intentó iniciar Docker; no se creó un contenedor ni se usó Redis de producción. El script crea un Redis desechable sin publicar puertos y comprueba Lua, concurrencia y recuperación tras reinicio cuando Docker esté disponible.
- x402:website-intelligence:preflight no pudo conectar con 127.0.0.1:8787. No se creó una firma ni se intentó un pago. Falta levantar/configurar el proveedor y comprobar una compra Testnet cuyo resultado aparezca en el panel.
- La conexión privada exige WebMCP nativo con registro y retirada de herramientas. El navegador de revisión no ofreció la interfaz completa requerida; no se afirma interoperabilidad nativa real.

## Límites del piloto

Accesos asignados por operador; sin cuentas ni vinculación por correo. Evidencia del historial agent-reported, sin atribución automática desde transferencias ni verificador independiente del servidor. Resultados JSON hasta 8 KiB y archivos hasta 64 KiB; enlaces externos del origen del proveedor, sin credenciales. Capacidad explícita de 1000 operaciones y 10000 eventos por propietario, sin borrado silencioso. Las consultas filtran el corpus acotado del piloto; no es un índice diseñado para grandes volúmenes.

## Revisión reproducible

Ejecutar la aplicación en 127.0.0.1:3211 y abrir /history/review para la muestra sin credenciales. review:history inicia en 3212 un backend de pruebas aislado y muestra accesos ficticios en su salida para probar /history. Nunca usa los accesos del proyecto. La implementación desplegable continúa requiriendo Redis durable y configuración de propietarios.
