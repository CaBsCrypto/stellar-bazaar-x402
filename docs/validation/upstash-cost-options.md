# Costes Upstash — 2026-09-29

Fuente oficial consultada: https://upstash.com/pricing/redis

| Opción | Precio publicado en USD |
|---|---|
| Free | $0; 256 MB y 500 mil comandos mensuales |
| Pay as You Go | $0,20 / 100 mil comandos; almacenamiento y transferencia sujetos a sus condiciones |
| Fixed 250 MB | $10/mes; región de lectura adicional +$5/mes |
| Fixed 1 GB | $20/mes; región de lectura adicional +$10/mes |
| Prod Pack | +$200/mes por base sobre un plan de pago |

Prod Pack añade SLA, alta disponibilidad multizona, cifrado en reposo y monitorización avanzada. No es necesario para esta prueba. No se ha comprado ni cambiado ningún plan. El panel de la instancia mostraba Free, unos 13 mil comandos y 118 KB almacenados.

En pago por uso, pasar desde Free elimina la franquicia gratuita de comandos. Las regiones de lectura pueden multiplicar el cargo de escrituras replicadas. La página permite fijar un presupuesto en Pay as You Go. Los planes fijos no cobran por número de comandos; tienen límites de capacidad y transferencia. Verificar condiciones e impuestos al contratar.

Recomendación para esta fase: conservar Free y ejecutar únicamente la validación acotada autorizada. Más capacidad o un SLA no prueban por sí mismos recuperación sin duplicaciones ni restauración de datos.
