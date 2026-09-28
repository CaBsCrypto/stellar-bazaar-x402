# Piloto local de identidad

Este procedimiento usa cuentas nuevas y datos sintéticos. No configura producción, no paga y no necesita Redis externo. El operador conserva los archivos privados fuera del repositorio; no entrega el archivo completo al agente.

```text
Operador offline → hashes registrados para un propietario
                         ↙                   ↘
           Agente: lectura/escritura      Humano: lectura
                    ↓                         ↑
              Operación → entrega ← Magic Link
```

## Ejecutar y revisar

1. Con Node 22.18+ o 24, ejecutar `node scripts/provision-history-account.mjs --out <directorio-A-nuevo>` y repetir para B. El padre debe existir. La ACL o permisos se verifican antes de guardar credenciales.
2. Dentro de un directorio privado, crear `config.json` como array de los dos objetos `account.json`, sin tokens originales. A y B son propietarios distintos. No cargar `.env.local` ni configuración histórica.
3. Compilar y servir la aplicación únicamente en loopback. En este workspace con unión de `node_modules`, usar `node node_modules/next/dist/bin/next build --webpack`; en instalación normal `npm run build`. Arrancar `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3271` con entorno sin credenciales reales.
4. Arrancar `node scripts/serve-identity-pilot.mjs <config.json-privado> <directorio-A> 3272 3271`. El ejecutor lee la credencial de escritura de A, registra una operación y un manifiesto mediante handlers reales y luego sirve la UI. Solo usa un adaptador de almacenamiento en memoria.
5. Abrir localmente `/history#token=…` con la lectura de A, sin imprimir el enlace en terminal, logs o capturas. Consultar la entrega, preparar una pregunta, cerrar con Escape, bloquear y volver a entrar con el enlace original. B no debe ver esa entrega.

El harness relee los hashes del archivo en cada petición: para rotar o revocar, reemplazar offline ese archivo sin reiniciar el harness. Sus entregas se perderían al reiniciarlo porque son sintéticas y están en memoria. Esta recarga es exclusiva del ejecutor; la aplicación normal usa configuración por entorno y requiere propagarla a todas las instancias.

## Rotación, revocación y recuperación

Seguir `HISTORY_IDENTITY.md`. La rotación genera una propuesta, no cambia el servidor: revisar y reemplazar únicamente la entrada del propietario verificado. `read` conserva escritura; `write` conserva lectura; `both` renueva ambas. El script exige la copia administrativa y las dos credenciales coincidentes. Sin ese respaldo no existe recuperación automática.

Revocar retira la entrada, no las entregas. Para restaurar, generar ambos accesos nuevos bajo el mismo propietario verificado; no reinstalar hashes revocados. El agente no puede reclamar un propietario enviando su identificador.

El Magic Link de biblioteca es reutilizable y no tiene expiración automática; cualquiera que lo posea puede leer. Bloquear limpia la vista local, no revoca el enlace. La revocación bloquea solicitudes futuras una vez aplicada; no puede retirar contenido que ya fue descargado. La UI retira su contenido al bloquear o recibir un rechazo de acceso.

## Pruebas y límites

`npm run test:identity:pilot` prueba rotación offline, operaciones/entregas por HTTP loopback y ciclo de vida WebMCP privado. Complementar con `npm run test:agent-chat`, `npm run test:history`, tipos y build. Las pruebas utilizan procesos distintos para aprovisionamiento y peticiones HTTP reales, pero el almacenamiento sigue siendo un doble; no demuestran durabilidad ni autenticación publicada.

Para una respuesta tardía, arrancar un segundo harness en otro puerto con un quinto argumento de retraso GET (por ejemplo `15000` ms), abrir con lectura y bloquear durante la carga. La respuesta no debe restaurar contenido. No añadir un endpoint remoto para controlar ese retraso.

## Propuesta de Preview — no aplicada

Usar propietarios sintéticos nuevos y un almacén independiente gratuito; si no se puede garantizar, detener publicación. `BAZAAR_HISTORY_ACCOUNTS_JSON` contendrá solo hashes y propietarios de esa Preview, conservando cualquier cuenta legítima que ya corresponda a ese entorno. No reutilizar cuentas históricas ni incluir archivos `credentials.json`.

Mantener pagos Sandbox y legados, pagador local y mutaciones del registro deshabilitados. No añadir claves de firma ni habilitar correo/admin. Revisar protección de acceso, origen y configuración efectiva antes de cualquier despliegue. La pausa Vercel actual no se modifica con este piloto.
