# Identidad y recuperación con Redis existente

Fecha: 2026-09-28. Candidato PR #61, `mission/identity-pilot`, SHA `be9d1dbb2afb4041edf707576ba5e9fe6fe5e165`. Ejecución sobre ese SHA más el ejecutor local `scripts/validate-identity-redis.mjs`; sin push ni despliegue.

## Resultado

**Aprobado el ejercicio acotado de identidad y recuperación tras reinicio.** Una operación sin pago y una entrega inline sintéticas permanecen en Redis; otro propietario no puede acceder. No se consultaron operaciones históricas. La configuración de autenticación usada pertenece exclusivamente al proceso loopback de prueba.

El aislamiento es lógico por propietario dentro de la base existente. Este resultado no demuestra respaldo, restauración, aislamiento físico, persistencia de archivos externos ni garantías para habilitar pagos.

## Preparación y presupuesto

- Panel de la base `x402-bazaar`: Free, aproximadamente 13 mil solicitudes de 500 mil mensuales, almacenamiento 115 KB de 256 MB, coste $0.00. No se cambió el plan.
- Dos propietarios nuevos generados offline. Credenciales y diario fuera del repositorio con permisos privados; servidor configurado con hashes.
- `EXISTS` sobre exactamente las diez claves derivadas devolvió cero antes de escribir. Sin SCAN, lectura de otras claves, DEL ni caducidades.
- **141 solicitudes REST acumuladas de un máximo de 200.** Lua puede ejecutar varios comandos internos por solicitud; esta cifra no se presenta como una medición de facturación por comando.
- **52.434 bytes de presupuesto conservador de escritura de un máximo de 100.000.** Incluye solicitudes idempotentes, tamaño de las instrucciones y margen. No equivale a memoria física medida de Redis; el contenido sintético escrito queda por debajo del límite.
- Contadores y condiciones se guardaron antes de cada envío. Cero reintentos automáticos; ninguna incertidumbre al terminar.
- Se conservan los registros sintéticos sin borrado ni expiración. El navegador y el servidor de esta prueba quedaron cerrados para impedir sondeo continuo.

## Evidencia de ejecución

| Etapa | Solicitudes acumuladas | Presupuesto de escritura | Resultado |
|---|---:|---:|---|
| Preflight | 1 | 0 | Diez claves inexistentes |
| Seed | 5 | 17.478 | Operación sin pago y entrega inline mediante handlers reales |
| Check | 29 | 34.956 | A/B, permisos, idempotencia, rotación y revocación |
| Nuevo proceso, check | 53 | 52.434 | Mismos registros, sin duplicados |
| Navegador escritorio | 107 | 52.434 | Magic Link, entrega, pregunta, Escape y bloqueo |
| Reinicio y navegador móvil | 141 | 52.434 | Reentrada con enlace original, misma entrega y borrador retirado |

`check` verifica que A lee exactamente la respuesta conservada; B obtiene una lista propia vacía y 404 al solicitar la entrega de A. La lectura no escribe (403); credenciales desconocidas (401), configuración inválida (503) y alteración de propietario (400) no acceden a Redis. Repetir los mismos identificadores devuelve los mismos registros y sigue habiendo una operación y una entrega.

La rotación de lectura rechaza el token anterior y permite recuperar la misma entrega con el nuevo. La rotación de escritura rechaza el token anterior sin invalidar la nueva lectura; revocar A rechaza sus accesos sin borrar datos. Son verificaciones de handlers y configuración local, no propagación remota. El ejecutor restaura al finalizar la configuración sintética inicial para permitir la revisión visual; no se anuncia una revocación permanente.

Se detuvo el proceso loopback y se inició uno nuevo sin reseed. La interrupción dejó un archivo de exclusión local: antes de retirarlo manualmente se comprobó ausencia de listener y `uncertain=false`. Nunca se borró un marcador Redis ni se reinició una operación. Una caída durante escritura incierta seguiría requiriendo reconciliación; no fue provocada en Redis real.

## Navegador y privacidad

Revisión en 1366×768 y 390×844, con la aplicación real y handlers reales sobre Redis. La entrega muestra **Sin pago** y **Disponible**, con título y resumen sintéticos. El token desaparece del fragmento de URL y el campo de acceso es de tipo password. Escape devuelve el foco al botón de preparación de pregunta. Bloquear elimina la vista; después de reiniciar y reabrir el enlace original, la misma entrega está disponible y no reaparece el borrador editado. En móvil, ancho de documento y contenido coinciden: 375 px útiles con barra de desplazamiento.

La copia de la credencial sintética A requirió autorización explícita para lectura por el usuario local de Codex. Se concedió únicamente para esa copia, fuera del repositorio, y se retiró el permiso temporal al finalizar. No se compartieron credenciales Redis ni históricas. Capturas sin tokens: `review-release/redis-identity/desktop.png`, `mobile.png` y `upstash-quota.png`, en el directorio de evidencias hermano del checkout.

La actividad se construyó con el handler real y una lista sintética vacía de eventos; no se validó persistencia externa de actividad. Los archivos externos están deshabilitados. La ausencia de almacenamiento de tokens y las respuestas tardías se cubren adicionalmente por las regresiones locales, no mediante inspección del almacenamiento interno del navegador en esta ejecución.

## Comandos reproducibles

Requiere Node 22.18+ o 24 y dependencias del repositorio. No cargar dotenv ni claves de firma. `PRIVATE_RUN` debe ser un directorio nuevo fuera del repositorio; `REDIS_ENV_FILE` es un archivo privado del operador: el ejecutor lee exclusivamente los cuatro nombres Redis permitidos. No imprimir su contenido.

```text
node scripts/validate-identity-redis.mjs prepare PRIVATE_RUN
node scripts/validate-identity-redis.mjs preflight PRIVATE_RUN REDIS_ENV_FILE
node scripts/validate-identity-redis.mjs seed PRIVATE_RUN REDIS_ENV_FILE
node scripts/validate-identity-redis.mjs check PRIVATE_RUN REDIS_ENV_FILE
node scripts/validate-identity-redis.mjs serve PRIVATE_RUN REDIS_ENV_FILE 3274 3271
```

`serve` usa el build local sin credenciales en 3271 exclusivamente para HTML/recursos estáticos. No expone escritura ni pagos por HTTP. No repetir `seed`; ante fallo se conserva el mismo diario y solo se recuperan esos identificadores. No reiniciar contadores para continuar al alcanzar un límite.

## Pruebas y límites de compilación

- PR #61 consultado nuevamente: SHA indicado, abierto, CI `Typecheck, Security, Tests & Production Build` aprobado.
- Node 24.14.0: `node scripts/test-history-identity-pilot.mjs` aprobado, handlers HTTP reales con almacenamiento doble, sin red externa.
- `node node_modules/typescript/bin/tsc --noEmit`: aprobado.
- `node node_modules/next/dist/bin/next build`: fallo del entorno local porque Turbopack rechaza el enlace de node_modules fuera de su raíz.
- `node node_modules/next/dist/bin/next build --webpack`: aprobado. Aviso existente de `metadataBase`, sin modificar configuración pública.
- Revisión independiente del ejecutor y diez escenarios con dobles: ver `redis-identity-independent-review.md`.

No cambia APIs, Vercel, cuentas históricas ni control de pagos. El siguiente bloque puede revisar la actualización de la aplicación; esta evidencia por sí sola no autoriza publicar ni habilitar cobros.
