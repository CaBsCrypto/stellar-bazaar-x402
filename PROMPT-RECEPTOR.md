# Prompt para continuar Bazaar en la notebook

Continúa este proyecto desde la entrega de migración del 22 de octubre de 2026. Primero lee `README-MIGRACION.md`, las instrucciones `AGENTS.md` aplicables y el resumen real de publicación. Hasta recibir ese resumen, no afirmes que las ramas fueron publicadas ni que la migración está aceptada.

El repositorio es `https://github.com/CaBsCrypto/stellar-bazaar-x402`, público. La rama principal para continuar nuevo desarrollo es exactamente `migracion/bazaar-multiseller-20261022-6b7a6d`. Su SHA final debe coincidir con el SHA final indicado en el resumen de entrega. No elijas `main` por defecto ni inventes un hash final.

Si todavía no hay clon y la publicación está confirmada, el comando previsto es:

```powershell
git clone --config core.autocrlf=false --config core.eol=lf --single-branch --branch migracion/bazaar-multiseller-20261022-6b7a6d https://github.com/CaBsCrypto/stellar-bazaar-x402.git Bazaarx402
```

La carpeta contenedora de la PC original tenía varios repositorios y worktrees; eso no significa que el proyecto careciera de Git. Las tres ramas de la entrega representan alcances diferentes:

- `migracion/bazaar-trabajo-local-20261022-6b7a6d`: snapshot seleccionado de `beta-open-build`, HEAD original `e9daaf13e792760da0664485d7b189c699a1b0ad`, rama local `codex/bazaar-open-release`.
- `migracion/bazaar-produccion-20261022-6b7a6d`: overlay verificado de 391 fuentes de producción desde ese Git base; digest SHA-256 `8453afdc1f7d9b219d2e48d8e5cd6be324b66fa1e335eacfa96324b4c0c1ebd7`.
- `migracion/bazaar-multiseller-20261022-6b7a6d`: overlay de 459 fuentes sobre producción; digest SHA-256 `9dd52ff0e3cd739fd860719e8efcdedcb0a2c66bbed68076f34e6b29ac75fb96`. Es candidato local, sin despliegue ni activación financiera.

Un digest SHA-256 de fuentes no es un SHA de commit Git. Las fuentes originales están documentadas, respectivamente, en `outputs/bazaar-treasury-registration-repair/wallet-binding-optimization/source-plan.json` (manifest SHA-256 `c5a9245d3a7b4bbb7bf92c1f4b1df8bff9fa6304f7d1f61dd8ce7f41f7df9fc6`) y `outputs/bazaar-budget-multiseller-v1/source-plan-v1.json` (manifest SHA-256 `7919d303b3f04136284f78954fee11b3cca805c14282b8384e413bee7532d614`). No presupongas que esas rutas originales existen en la notebook; usa el material incluido y el manifiesto de la entrega.

Empieza con inspección de sólo lectura: confirma raíz Git, remoto, rama, `HEAD`, árbol limpio, archivos de continuidad y manifest SHA-256. Comprueba que el código incluido no requiere archivos de la PC original y que no se copiaron junctions de `node_modules`. Los 391/459 archivos fueron verificados durante la preparación; no se ejecutaron el proyecto, instalación, build ni pruebas en esa migración. Los scripts de Git base conservados son heredados, no una suite integral recién validada.

El paquete declara Node `24.x`, lockfile npm v3, Next `16.3.1`, React `18.3.1`; TypeScript está fijado a `5.9.3` en el lockfile. No instales paquetes ni ejecutes lifecycle scripts, servidor, build o pruebas hasta tener autorización en esta notebook. Cuando esa autorización exista, revisa antes `package.json` y aplica `npm ci`; selecciona verificaciones pertinentes, sin ejecutar por defecto todos los comandos de wallets, pagos, proveedores o despliegue heredados. No declares éxito a partir de que el clon o una compilación aislada funcionen.

Los secretos y servicios externos no viajan con Git. Consulta los nombres documentados para Redis/Upstash, pedidos, Stellar/facilitador, ranuras multiseller, S3 opcional y controles operativos. No busques secretos en rutas de otra PC, no solicites pegarlos en el chat y no generes claves nuevas para reemplazar las existentes. No cambies datos, prefijos, namespaces, reservas, contadores o credenciales; no apliques migraciones SQL ni crees pedidos o firmas para validar el entorno.

El cliente finito del 22 de octubre exige las fuentes de producción391, no multiseller459. El paquete `outputs/bazaar-first-x402-free-20261022/client` y Carmelita724 no fueron copiados: sus imports originales dependen de rutas locales y otro proyecto. La adaptación de Carmelita pertenece a `CaBsCrypto/carmelita`, digest `3334b872a1aa7b337008cdad9f291aa08b2918a664f9cd2b8677a6b5c03dba23`, base `90cb5800dd3f6b4a2042862a91a2579e3678cfc19a4a0b97b124ed2cd71518ae`, y aún no tiene commit propio declarado, despliegue o esquema aplicado. Documenta esa dependencia y su migración pendiente; no mezcles su árbol de aplicación con Bazaar. El intento financiero permanece detenido antes de firmar y la aceptación web sigue pendiente.

`--single-branch` requiere un fetch explícito para consultar las otras ramas o `main`. Usa las órdenes exactas de `README-MIGRACION.md`. `main` observado en la PC original era `76ba7b19eacb424d8c9e872a2d01569e1eb45b3d` y no tiene paridad declarada con producción. El ancestro común conocido entre los checkouts locales `e9daaf13…` y `c2b93a98b8d80bfb1ea45a1b19832a5425c671d3` es `7f7ab2bba4c76e01ac282d1eaed8ac55ef86c6ab`; calcula el ancestro real respecto del `main` que acabas de obtener y revisa el diff antes de proponer una integración. No sobrescribas `main` ni uses force-push.

La integración Git de Vercel está habilitada; su exclusión actual cancela las ramas distintas de `main`. Un push puede igualmente crear un registro cancelado y consumir un límite. No cambies esa configuración, no despliegues ni hagas merge. Un PR futuro debe ser borrador y exige autorización separada. Comprueba en el resumen real el resultado de la auditoría de los 151 commits salientes y la verificación de las referencias remotas; la documentación por sí sola no certifica publicación. Los otros worktrees y stashes se conservaron en la PC original y no se afirman publicados.

Entrega primero un diagnóstico breve con la rama y SHA verificados, estado del manifest y árbol, disponibilidad local del código, requisitos pendientes y siguiente acción concreta. La prueba de continuidad debe poder realizarse con la PC original apagada; cualquier dependencia que todavía necesite esa PC es un bloqueo que debes declarar. Continúa trabajo autorizado sin reiniciar la investigación histórica, conservando las diferencias entre producción, candidato local y evidencia hospedada pendiente.


Si el clon ya existe, inventaría su trabajo antes de tocarlo y prefiere una carpeta nueva si hay modificaciones. Una vez revisados documentos, SHA y `MANIFIESTO-SHA256.json`, aplica la checklist de la notebook del README con datos sintéticos. Los perfiles DPAPI CurrentUser no son portátiles; la recuperación segura de credenciales sigue bloqueada hasta comprobarla. No uses autenticación compartida como prueba de que se migraron datos locales o claves.

Para desarrollo nuevo crea una rama de continuación desde la migración elegida, con nombre único comprobado. Login no integra ramas: fetch trae referencias y merge sí cambia archivos. Un futuro PR tendrá base en la rama predeterminada real, actualmente main, y compare en la migración o continuación elegida. Antes revisa ancestro común, diff completo, checks, conflictos y automatizaciones. Pide autorización separada para el PR y créalo como borrador salvo otra instrucción. Mantén el original como respaldo, sin push directo a main, auto-merge, force-push ni deploy.
