# Sprint Goal: validar Bazaar con Next y Redis real

Fecha: 2026-10-01.

## Objetivo

**Demostrar que un desarrollador puede crear su espacio privado, conectar un agente externo sintético y recuperar mediante Magic Link la misma conversación y entrega después de reiniciar la aplicación, usando Next nativo y Redis real, sin duplicaciones ni acceso de otro propietario.**

El resultado será un candidato revisado y un expediente reproducible para evaluar su publicación en un hito posterior.

## Punto de partida

- Checkout: `mission-consolidation`, rama `mission/open-bazaar-local`.
- Código validado: `6c60391`; HEAD del expediente: `6ceff21`. Confirmar los SHA completos al iniciar y registrar cualquier cambio posterior.
- Base dedicada ya creada: **bazaar-validacion-20261001**, AWS `us-east-1`, plan Free $0, sin regiones de lectura adicionales y con eviction desactivado.
- Origen Redis: `https://smooth-dory-323957.upstash.io`. Sus credenciales todavía no se han leído ni guardado para la aplicación.
- Las pruebas con dobles, el recorrido con archivos y la revisión visual previa están aprobados. **Next nativo, persistencia y Magic Link con Redis real siguen pendientes.**
- El ejecutor existente utiliza un host HTTP de prueba con handlers reales. Ese resultado no acredita el recorrido nativo.

Referencias: `OPEN_BAZAAR_SHARED_CANDIDATE.md` y `OPEN_BAZAAR_SYNTHETIC_HANDOFF.md`. Sus afirmaciones anteriores sobre ausencia de instancia deben actualizarse con la nueva evidencia.

## Trabajo del sprint

1. Preparar la conexión privada a esta base, con entorno explícito, Node 22.18.0 y credenciales dedicadas protegidas fuera de Git y de los informes.
2. Completar la prueba sobre Next nativo y `configuredWorkspaceStore`, con backend Redis y sin fallback a archivos. Resolver antes de cualquier efecto cómo la creación nativa conserva propietarios asignados por servidor dentro de las cinco claves congeladas.
3. Preparar un plan nuevo vinculado al candidato final: dos propietarios sintéticos, intención y payloads conservados, prefijo exclusivo, cinco claves exactas y presupuesto completo. Confirmar el margen gratuito actual y obtener autorización específica antes de escribir.
4. Ejecutar el recorrido humano/agente y la recuperación en navegador; corregir hallazgos y repetir únicamente las comprobaciones afectadas.
5. Obtener revisión independiente y actualizar tablero, manifiesto y reversión con el estado real de cada comprobación.

Mantener los límites existentes: 400 solicitudes Redis, 2.400 comandos incluyendo EVAL/Lua, 16/32 MiB enviados/recibidos, 49.164 bytes de valores almacenados, dos propietarios, 120 solicitudes de aplicación y 120 segundos por ejecución. Aplicar también los límites individuales documentados, ocho intentos CAS y cero reintentos automáticos de transporte. Contabilizar el tráfico de todos los procesos, MCP y navegador. Cualquier ampliación requiere revisión y nueva autorización.

## Validaciones obligatorias

- A crea su espacio, envía un mensaje y su agente reclama la tarea, conserva la respuesta, registra una entrega y responde con su referencia.
- Reenvíos idénticos mantienen registros únicos; identificadores reutilizados con condiciones distintas producen conflicto. B y credenciales de otros ámbitos no acceden a A.
- Dos procesos y el reinicio de Next conservan exactamente propietarios, IDs, mensajes, tarea, respuesta, entrega y comprobantes, sin regenerarlos.
- Rotación y revocación conservan el propietario e invalidan los accesos anteriores después del reinicio.
- Magic Link recupera esos mismos registros; retira el token de la URL y lo mantiene fuera del almacenamiento del navegador. Bloquear elimina contenido y borradores; una respuesta tardía no reabre la sesión.
- Comprobar teclado, reentrada, 390×844 y 1366×768, texto realmente ampliado al 200 % y ausencia de desbordes.
- Probar pérdida de respuesta, corrupción y fallos inducidos con dobles. Ante un efecto real incierto, detenerse y conservar el intento para recuperación explícita.

## Evidencia y cierre

Entregar instrucciones reproducibles, capturas sin secretos y resultados vinculados al SHA completo, BUILD_ID, runtime, configuración, comandos y conteos efectivos. Distinguir dobles, Next con Redis real, navegador con ese backend y pendientes. Ejecutar tipos, compilación y regresiones pertinentes sobre el candidato final.

**El sprint se cierra únicamente cuando el recorrido nativo completo con Redis real y Magic Link pasa revisión independiente.** Un bloqueo debe indicar causa y condición de desbloqueo.

Sin publicación, push, merge, despliegue, compras, ampliaciones de plan, modelos alojados, activación de proveedores ni modificaciones de SalesAgent o datos históricos. No borrar claves para resolver fallos. Este sprint valida persistencia entre procesos; no certifica respaldos ni recuperación tras perder Redis.
