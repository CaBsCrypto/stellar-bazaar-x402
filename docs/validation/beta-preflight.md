# Beta pública: preparación de validación acotada

2026-09-29. Base local `0c32e80`; PR #61 remoto todavía `be9d1db`. Main remoto continúa en `76ba7b1`. Proyecto Vercel consultado en lectura: pausa de builds `exit 0`, Node 24.x, protección `all_except_custom_domains`. Las ramas de revisión siguen excluidas en vercel.json.

## Ajuste necesario antes de probar

El SDK instalado @upstash/redis 1.38.2 reintentaba cinco veces por defecto: hasta seis envíos por comando. La biblioteca consulta periódicamente actividad y entregas. Contar llamadas HTTP de la aplicación como si fueran solicitudes Redis no garantizaba el presupuesto autorizado.

Las tres factorías de historial, actividad y entregas usan ahora `retry: { retries: 0 }`. Una pérdida de respuesta se devuelve al llamador sin reintento del SDK. Esto no elimina los reintentos explícitos e idempotentes del cliente ni el sondeo periódico; un ejecutor de validación debe acotarlos por separado. No cambia formatos ni endpoints. Ante fallos transitorios puede aparecer un error antes que con la configuración previa.

Prueba `node scripts/test-history-redis-no-retry.mjs`: SDK real y fetch simulado, un solo intento por cada factoría al perder la respuesta de lectura. Aprobada y reproducida independientemente por beta_review en Node 22 y 24. No se presenta como prueba independiente de EVAL perdido. Regresiones de historial, entregas y actividad aprobadas localmente; se incorpora la prueba al CI.

## Presupuesto de la futura prueba publicada

| Handler | Reserva máxima GET | Reserva máxima POST |
|---|---:|---:|
| /api/operations | 2 | 1 |
| /api/deliveries | 6 | 3 |
| /api/activity | 4 | 1 |

Son cotas de solicitudes REST Redis, no medición de comandos internos Lua. Se deben reservar y persistir antes del HTTP publicado, sin devolver la reserva por timeout ni HTTP exitoso. Toda pestaña/ejecutor deberá pasar por el mismo control; el sondeo no puede quedar abierto sin contabilizar. Es necesario restringir origen, rutas, credenciales sintéticas, tamaño e identificadores. No se inicia ninguna escritura hasta tener control de 200 solicitudes y 100 KB incluyendo sobrecarga; el límite anterior de 141 solicitudes corresponde a otra ejecución ya cerrada.

Las consultas históricas serán estrictamente de lectura y separadas de ese ejercicio sintético. No cargar firmantes ni usar la ruta de pago. La preparación de accesos históricos ya realizada no implica que estén activos en Vercel.

## Estado de publicación

El intento de push de mission/identity-pilot fue rechazado por la revisión automática, que consideró insuficiente la autorización posterior frente al límite anterior de no publicar. Se pidió confirmación explícita de rama, PR, integración, configuración y dominio. No se ejecutó push, merge ni despliegue; tampoco hubo nuevas solicitudes Redis. Este documento registra preparación, no beta publicada ni prueba remota completada.
