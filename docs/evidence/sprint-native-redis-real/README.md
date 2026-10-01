# Expediente de preparación y ejecución nativa

Estos archivos públicos contienen configuración, conteos y capturas con el campo
de acceso enmascarado. Las credenciales de Redis, tokens sintéticos y payloads
privados del ejecutor permanecen fuera de Git.

`provider-preflight.json`, `provider-settings.png` y
`provider-current-margin.png` acreditan la base dedicada, Free Tier, configuración
y margen observado en consola. La última consulta de cuotas fue
2026-10-01T06:54:11.701Z: 0/500.000 comandos, 0 B/10 GB, 0 B/256 MB y $0.00.
Estas consultas de control no son comandos del recorrido Redis.

## Intentos diagnósticos conservados

| Intento | Resultado | Consecuencia |
|---|---|---|
| `attempts/01` | Parcial: cuatro casos chat; sección oculta tratada como visible y precargas agotaron el ledger | Se corrigió la medición de visibilidad y se desactivó prefetch en las vistas privadas |
| `attempts/02` | Parcial: chat y biblioteca 390 al 100 %; texto 200 % recortó una pestaña | Se permitió envolver las pestañas y reducir su ancho mínimo |
| `attempts/03` | Navegador completo PASS, ocho casos; recorrido global rechazado al observar request 121, con 120 enviados | Se quitaron cinco GET de disponibilidad redundantes; cada proceso espera Ready y su primera operación comprueba Next |

Todos esos intentos usan Redis REST con doble y **cero solicitudes Redis
externas**. Sus planes privados e intenciones se conservan; sus informes no son
aceptación del candidato final ni del sprint real. El contador de almacenamiento
del tercer intento precede la corrección de confirmación mediante COMMIT
exclusivo y no se reutiliza como inventario final.

El candidato definitivo necesita un nuevo build y recorrido completos sobre su
SHA local fijado. La ejecución Redis real exige un plan separado y autorización
humana específica. No se borra ninguna clave para resolver fallos.
