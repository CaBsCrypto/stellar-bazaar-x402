# Sprint Goal: cerrar la validación compartida de Bazaar abierto

Fecha de planificación: 2026-10-01.

## GOAL

**Demostrar que un desarrollador puede crear su espacio privado, conectar su agente externo y recuperar la misma conversación y entrega mediante Magic Link después de reiniciar la aplicación, usando Redis real y sin duplicaciones ni acceso de otro propietario.**

El resultado será un candidato con evidencia suficiente para revisar su publicación. Este sprint no publica la actualización.

## Punto de partida

- Rama local: `mission/open-bazaar-local`.
- Expediente y capturas: `61bcb68`. Código validado: `c92e084`.
- El candidato incorpora 17 herramientas MCP, espacios privados, chat, tareas y resultados inline gratuitos o simulados.
- Las pruebas locales, la revisión independiente, tipos y compilación Node 22 están aprobados dentro del alcance documentado.
- La web pública todavía expone ocho herramientas MCP de consulta. La nueva entrada de espacios privados no está publicada.
- El nuevo almacén Redis tiene pruebas con dobles; falta comprobarlo contra el servicio real. Las pruebas históricas del historial no sustituyen esa comprobación.

## Recorrido que debe pasar

**Guardar intención y accesos → crear espacio → mensaje humano → agente reclama tarea → conserva respuesta → registra entrega → humano abre Magic Link → bloquea → reinicio → recupera la misma entrega.**

Bazaar conserva el intercambio; el agente se ejecuta fuera de Bazaar. La prueba utilizará un ejemplo sintético, sin invocar un modelo alojado ni un servicio de pago.

## Equipo y tareas

El Scrum Master mantiene un único tablero, verifica dependencias e integra únicamente cambios revisados. Trabajan como máximo tres especialistas simultáneamente, con checkouts separados.

| Responsable | Entregable | Aceptación |
|---|---|---|
| Identidad y persistencia | Ejecutor Redis acotado, configuración aislada y evidencia de recuperación | Dos propietarios nuevos; solo sus claves; alta idempotente, permisos, rotación y revocación conservadas entre procesos |
| MCP y producto | Paquete reproducible para el agente y revisión de chat/biblioteca | Documentación suficiente, credenciales separadas, móvil/escritorio y texto al 200 % comprobados |
| Revisión independiente | Reproducción del recorrido y revisión de fallos | Sigue únicamente prompt, guía y requisitos; registra limitaciones sin intervención oculta del autor |
| Scrum Master | Expediente final y decisión de cierre | SHA, configuración, comandos, resultados, pendientes y reversión corresponden al candidato exacto |

## Orden de ejecución

1. Confirmar el SHA y preservar el candidato; arrancar un servidor local con configuración explícita, sin cargar firmantes o credenciales históricas.
2. Preparar el ejecutor y probar sus límites con dobles. Congelar identificadores y condiciones antes de cualquier efecto.
3. Presentar la instancia, prefijo nuevo, claves permitidas, margen gratuito y máximos de solicitudes/comandos y datos, incluidos los reintentos CAS permitidos. Obtener autorización específica antes de escribir en Redis real.
4. Ejecutar el recorrido con handlers HTTP y cliente MCP reales contra datos sintéticos aislados. Contabilizar el tráfico efectivo; detenerse al alcanzar cualquier límite. No dejar sondeos indefinidos ni reintentos de transporte automáticos.
5. Revisar la interfaz en 390×844 y 1366×768, texto al 200 %, teclado, bloqueo y reentrada. Guardar capturas sin secretos.
6. Corregir hallazgos y repetir solo las pruebas afectadas; exigir revisión independiente del SHA corregido. Ejecutar tipos, compilación y regresiones pertinentes con Node 22.
7. Preparar el manifiesto de actualización y la reversión. Entregarlo para una revisión de publicación separada.

## Pruebas de aceptación

- A escribe su mensaje y su agente registra una respuesta y entrega; A recupera exactamente esos registros. B y credenciales de otros ámbitos no acceden.
- Humano, agente y secreto de recuperación mantienen permisos distintos. Rotar o revocar no cambia el propietario ni restablece accesos antiguos.
- Alta concurrente y reenvío idéntico conservan un único espacio. Reutilizar identificadores con condiciones diferentes produce conflicto.
- Dos procesos recuperan el mismo espacio. Reiniciar y recuperar conserva mensajes, tarea, operación, respuesta y comprobantes sin volver a ejecutar el ejemplo.
- Respuesta perdida, almacenamiento inaccesible, registros dañados y límites no producen un falso éxito. Un efecto incierto conserva su intento y requiere recuperación explícita.
- Si la respuesta ya está conservada y falla el registro, se reintenta únicamente ese registro; no se genera otra respuesta o entrega.
- El Magic Link retira el token de la URL y lo mantiene en memoria. Bloquear retira contenido y borradores; una respuesta tardía no restablece la sesión.
- Las solicitudes de proveedor pendientes continúan fuera del catálogo. Este sprint no aprueba ni activa servicios.

Los fallos inducidos y escenarios destructivos se prueban con dobles; no se detiene ni modifica la instancia Redis compartida para provocarlos.

## Evidencia y cierre

Guardar por resultado: SHA, runtime, origen/dominio, configuración sin valores secretos, comando, conteo efectivo, entorno y resultado. Separar **local con dobles**, **Redis real aislado**, **navegador real** y **pendiente**. La revisión al 200 % debe comprobar que el texto realmente se amplió.

**Sprint cerrado:** recorrido compartido aprobado independientemente, revisión visual pendiente completada y expediente de publicación preparado. Una comprobación bloqueada no contará como aprobada: se registrarán su causa y condición concreta de desbloqueo.

Si no se confirma coste cero, aislamiento o presupuesto autorizado, la prueba Redis permanece bloqueada. Se puede terminar su preparación local, pero no declarar cumplido el GOAL.

## Límites y siguiente hito

Sin nuevas capacidades, compras, transferencias, faucets, archivos externos, contratos, multichain, activación automática, push, merge ni despliegue. No tocar compras, cuentas o claves históricas; no borrar datos para resolver fallos. No contratar ni ampliar planes.

La prueba demuestra persistencia entre procesos dentro del entorno observado; no certifica respaldos, durabilidad ante pérdida de Redis ni recuperación desde una copia antigua.

**Hito posterior:** autorizar y publicar una actualización concreta; después, un desarrollador remoto crea su espacio, conecta su agente, envía una solicitud de servicio y recupera su entrega sin asistencia interna ni credenciales administrativas.

Referencia: [expediente local](OPEN_BAZAAR_LOCAL_CANDIDATE.md).
