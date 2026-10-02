# Preview protegida en Vercel existente

Autorización humana vigente: preparar la Preview del proyecto existente y realizar
las pruebas necesarias. No se crea otro proyecto ni se promueve producción en
esta primera fase. Destino comprobado por UI y CLI:

- Proyecto `stellar-bazaar-x402`, `prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3`.
- Equipo `cabscryptocontacto-6028s-projects`, `team_XjolcoWJ9V9yamVnCdpC7EMY`.
- Producción preservada: `5rbJydG46d3EaTdWFaCkspPrqems`, `bazaar.browns.studio`.
- CLI oficial 62.1.0, autenticada con la misma cuenta del navegador.

Primer despliegue: `--target preview --project prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3`
y scope explícito. Un único envío inicial y una compilación remota; no reintentos
ante resultado incierto. Protección Standard existente conservada. Node 22.x
mediante engines del candidato, webpack mediante buildCommand. Vercel controla
el parche efectivo; registrar el runtime del despliegue, sin afirmar Node 22.18.0.

La Preview inicial tendrá `BAZAAR_ENABLE_OPEN_WORKSPACES=false` y
`BAZAAR_WORKSPACE_ADMISSION=invite-only`, tanto build como runtime. Se deshabilitan
intake, activación de proveedores, mutaciones del registro y pagos. Las rutas
del proxy mantienen cerradas las escrituras y APIs privadas. No se configura
todavía un backend Redis piloto ni se ejecuta el recorrido de escritura REAL.

Revisión inicial: estado Ready/build, HTTPS, página `/pilot`, headers de privacidad
y rechazo de rutas ajenas al piloto. Máximo 20 requests HTTP de lectura/control,
10 MiB de respuesta total, 60 segundos para esa comprobación, reintentos cero.
Redis REAL: cero solicitudes y cero escrituras en esta etapa. Assets ordinarios.
La fase autenticada posterior requiere origen Preview exacto, backend/prefijo
nuevos, intenciones protegidas y un presupuesto completo propio antes de efectos.

El upload excluye Git, dependencias, builds, logs, archivos de entorno y evidencias
locales/revisiones. No se suben credenciales ni referencias privadas de pruebas.
La CLI generó `.env.local` con un token OIDC al vincular: se retiró sin mostrar
su contenido. Las credenciales CLI se mantienen fuera del repositorio.

La herramienta genérica deploy fue rechazada por auto-review por no especificar
destino. Este documento y el vínculo verificable hacen concreta la alternativa
acotada; no autorizan usar esa herramienta genérica ni alterar producción.
