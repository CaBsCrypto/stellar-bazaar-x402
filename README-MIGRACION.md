# Continuidad de Bazaar en otra PC

Preparado localmente el 22 de octubre de 2026. La verificación posterior de publicación y los SHA finales se entregan en el resumen externo al commit. Este archivo no intenta registrar su propio hash. Consultar ese resumen antes de clonar: la publicación requiere resolver el efecto automático de Vercel documentado abajo.

El repositorio existente es [CaBsCrypto/stellar-bazaar-x402](https://github.com/CaBsCrypto/stellar-bazaar-x402), público. La carpeta original `C:\Users\MGC\Documents\ChatGPT\Bazaarx402` contiene varios checkouts y paquetes de trabajo; la carpeta contenedora no era por sí misma un repositorio. El trabajo sí tenía historial Git en sus checkouts. Esta migración conserva ese historial y separa las fuentes de producción del desarrollo local.

## Ramas de esta entrega

| Rama de migración | Contenido y procedencia | Uso |
| --- | --- | --- |
| `migracion/bazaar-trabajo-local-20261022-6b7a6d` | Snapshot seleccionado y revisado de `beta-open-build`, cuyo HEAD de origen es `e9daaf13e792760da0664485d7b189c699a1b0ad`, rama local `codex/bazaar-open-release`. | Conservar el trabajo local seleccionado y sus diferencias. No identifica la producción vigente. |
| `migracion/bazaar-produccion-20261022-6b7a6d` | Las 391 fuentes verificadas de producción, aplicadas como overlay desde el Git base `e9daaf13e792760da0664485d7b189c699a1b0ad`. | Referencia reproducible de la fuente publicada y base del cliente finito del 22 de octubre. |
| `migracion/bazaar-multiseller-20261022-6b7a6d` | Las 459 fuentes del candidato local, sobre la rama de producción reconstruida. | Rama principal de continuación para nuevo desarrollo de Bazaar. Sigue sin activación ni aceptación financiera hospedada. |

Las dos ramas de fuentes reconstruidas no se deben confundir con un commit histórico que ya representara producción. Los manifests originales identifican conjuntos de archivos mediante SHA-256; no proporcionan un SHA Git propio. El SHA Git final de la rama de continuación se recibirá en el resumen real de publicación: el SHA final indicado en el resumen de entrega.

El `main` remoto observado es `76ba7b19eacb424d8c9e872a2d01569e1eb45b3d`. No representa las fuentes de producción reconstruidas. La migración no autoriza sobrescribirlo, hacer merge ni reemplazar cambios de UI que allí existan.

## Fuentes y manifiestos

Las rutas siguientes se refieren a la PC original y documentan procedencia; no son dependencias que la notebook deba buscar fuera de su clon.

| Conjunto | Ruta original dentro de Bazaarx402 | Archivos | Digest de fuentes SHA-256 |
| --- | --- | ---: | --- |
| Producción | `outputs/bazaar-treasury-registration-repair/wallet-binding-optimization/source` | 391 | `8453afdc1f7d9b219d2e48d8e5cd6be324b66fa1e335eacfa96324b4c0c1ebd7` |
| Multiseller local | `outputs/bazaar-budget-multiseller-v1/source` | 459 | `9dd52ff0e3cd739fd860719e8efcdedcb0a2c66bbed68076f34e6b29ac75fb96` |

El manifest original de producción es `outputs/bazaar-treasury-registration-repair/wallet-binding-optimization/source-plan.json`, SHA-256 `c5a9245d3a7b4bbb7bf92c1f4b1df8bff9fa6304f7d1f61dd8ce7f41f7df9fc6`. El del candidato es `outputs/bazaar-budget-multiseller-v1/source-plan-v1.json`, SHA-256 `7919d303b3f04136284f78954fee11b3cca805c14282b8384e413bee7532d614`.

En la preparación de esta migración se comprobaron los tamaños y SHA-256 de los 850 archivos de esos dos manifests: todos coinciden. Se leyeron 5.800.792 bytes en producción y 6.234.237 bytes en multiseller. El candidato conserva 370 archivos de producción, modifica 21 y añade 68, sin eliminar ninguno. Frente a Git base `e9daaf13…`, producción tiene 238 archivos idénticos, 81 cambiados y 72 añadidos; multiseller, 238 idénticos, 81 cambiados y 140 añadidos. La comparación utilizó los bytes de cada objeto Git, sin conversión de saltos de línea.

El digest de fuentes es SHA-256 de las filas ordenadas `ruta + NUL + sha256 + NUL + bytes`, unidas por LF, según los preparadores originales. El archivo `MANIFIESTO-SHA256.json` incluye rutas, modos, tamaños y SHA-256 de todos los archivos versionados de esta rama, salvo el propio manifiesto y los metadatos Git. Sus hashes corresponden a los bytes de los blobs Git. El clon indicado desactiva la conversión de saltos de línea para conservarlos. Comprobar el manifiesto y el resumen después de la publicación real. Estos digests cubren las fuentes desplegables, no todo el árbol del repositorio ni el historial Git. Añadir documentación de continuidad no cambia por sí mismo la fuente desplegable declarada.

Los paquetes de 391/459 archivos no incluían `scripts/`, README raíz ni `.env.example`. La reconstrucción conserva los scripts y la documentación del Git base; sus comandos son heredados y no se declara que todos sean compatibles con los overlays. `node_modules`, `.next`, junctions, credenciales, archivos privados, stashes y los demás worktrees no forman parte de los manifests de fuentes. Los otros worktrees y stashes permanecen conservados en la PC original; no se afirma que hayan sido publicados.

## Clonar en la notebook

Realizar este paso cuando el resumen de publicación confirme que la rama fue enviada y dé su SHA final. El clon de una sola rama evita elegir un `main` que no contiene esta continuación:

```powershell
git clone --config core.autocrlf=false --config core.eol=lf --single-branch --branch migracion/bazaar-multiseller-20261022-6b7a6d https://github.com/CaBsCrypto/stellar-bazaar-x402.git Bazaarx402
git -C Bazaarx402 branch --show-current
git -C Bazaarx402 rev-parse HEAD
git -C Bazaarx402 status --short
```

Comparar `HEAD` con el SHA final indicado en el resumen de entrega y verificar el manifiesto SHA-256 que acompañe la entrega. La rama correcta y un árbol limpio son condiciones de recepción; un clon correcto no prueba que el servicio hospedado o sus pagos funcionen.

`--single-branch` limita las referencias obtenidas. Para consultar producción, el snapshot o `main` después, hacer fetch explícito; estas son operaciones de lectura del remoto:

```powershell
git -C Bazaarx402 fetch origin refs/heads/migracion/bazaar-produccion-20261022-6b7a6d:refs/remotes/origin/migracion/bazaar-produccion-20261022-6b7a6d
git -C Bazaarx402 fetch origin refs/heads/migracion/bazaar-trabajo-local-20261022-6b7a6d:refs/remotes/origin/migracion/bazaar-trabajo-local-20261022-6b7a6d
git -C Bazaarx402 fetch origin refs/heads/main:refs/remotes/origin/main
git -C Bazaarx402 merge-base origin/main HEAD
git -C Bazaarx402 diff --stat origin/main...HEAD
```

El ancestro común conocido entre los checkouts locales `e9daaf13…` y `c2b93a98b8d80bfb1ea45a1b19832a5425c671d3` es `7f7ab2bba4c76e01ac282d1eaed8ac55ef86c6ab`. No asumir que ese mismo ancestro sea el de `main` remoto: recalcularlo con `merge-base`. Revisar las diferencias antes de proponer una integración. Un futuro PR debe prepararse como borrador y requiere una autorización separada; esta continuidad no autoriza crear el PR, desplegar ni hacer merge.

## Dependencias y configuración

El paquete Bazaar declara Node `24.x`, npm mediante `package-lock.json` v3, Next `16.3.1` y React `18.3.1`; el lockfile fija TypeScript `5.9.3`. No existe un requisito `packageManager` fijado en el paquete examinado. En los recibos originales constan pruebas locales con Node `24.14.0` y compilación Linux con Node `24.22.0`.

La instalación y ejecución en la notebook requieren autorización allí. Después de revisar los lifecycle scripts y dar esa autorización, el comando de instalación reproducible es `npm ci`. El paquete declara `npm run dev`, `npm run build`, `npm start` y `npm run typecheck`. No ejecutar automáticamente la lista completa de `scripts`: hay comandos heredados de wallets, pagos, proveedor y despliegue. No se ejecutó instalación, aplicación, build ni pruebas del proyecto durante esta migración.

La configuración operacional depende del perfil elegido. Estos son nombres comprobados en código público, sin valores; no constituyen una plantilla ya validada ni una orden de activación:

| Función | Nombres de configuración relevantes |
| --- | --- |
| Espacios y Redis | `BAZAAR_WORKSPACE_BACKEND`, `BAZAAR_WORKSPACE_REDIS_REST_URL`, `BAZAAR_WORKSPACE_REDIS_REST_TOKEN`, `BAZAAR_WORKSPACE_PREFIX`, `BAZAAR_WORKSPACE_PUBLIC_ORIGIN` |
| Redis de pedidos | `BAZAAR_MARKET_ORDER_STORAGE`, `BAZAAR_MARKET_ORDER_REDIS_REST_URL`, `BAZAAR_MARKET_ORDER_REDIS_REST_TOKEN`, `BAZAAR_MARKET_ORDER_PREFIX` |
| Upstash genérico, si corresponde | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `KV_REST_API_TOKEN` |
| Stellar/facilitador | `STELLAR_X402_RPC_URL`, `STELLAR_X402_FACILITATOR_URL`, `STELLAR_X402_FACILITATOR_API_KEY` |
| Proveedores multiseller | `BAZAAR_PUBLIC_BUYER_ADMISSION_JSON`; ranuras `BAZAAR_MULTI_SELLER_A_TOKEN`, `BAZAAR_MULTI_SELLER_B_TOKEN`, `BAZAAR_MULTI_SELLER_C_TOKEN` y sus equivalentes `BAZAAR_MULTI_SELLER_A_PROTECTION`, `BAZAAR_MULTI_SELLER_B_PROTECTION`, `BAZAAR_MULTI_SELLER_C_PROTECTION` |
| Alta starter, si se adopta | `BAZAAR_PUBLIC_REGISTRATION_BUDGET_PROFILE`, `BAZAAR_FREE_DEMO_MODE`, `BAZAAR_FREE_PLAN_TRANSPORT_PROFILE`, `BAZAAR_PILOT_REVIEW_TRANSPORT` |
| Archivos S3 opcionales | `BAZAAR_S3_ENDPOINT`, `BAZAAR_S3_BUCKET`, `BAZAAR_S3_REGION`, `BAZAAR_S3_ACCESS_KEY_ID`, `BAZAAR_S3_SECRET_ACCESS_KEY`; existen aliases de claves que deben revisarse al configurar |
| Controles operativos | `CRON_SECRET`, `BAZAAR_ADMIN_KEY`, `BAZAAR_MARKET_REVIEW_SECRET` |

Los controles `BAZAAR_ENABLE_MARKETPLACE`, `BAZAAR_ENABLE_MARKET_PURCHASES`, `BAZAAR_ENABLE_OPEN_WORKSPACES`, `BAZAAR_X402_MARKETPLACE_ENABLED`, `BAZAAR_PER_ORDER_X402_MODE` y `BAZAAR_PER_ORDER_PROVIDER_PROTOCOL` necesitan una configuración coherente. No copiarlos desde producción ni activarlos para demostrar que el clon funciona. Recuperar secretos sólo por el canal privado existente y cuando estén autorizados; nunca ponerlos en Git, chat, este documento o un manifiesto.

Esta entrega no exporta datos, bases de datos, registros de pedidos, wallets ni claves, no aplica migraciones SQL, no cambia prefijos ni namespaces y no resetea credenciales, contadores, pagos o reservas. Redis Free y Vercel Pro son los servicios existentes documentados; la migración no compra planes ni acredita presupuesto operativo actual.

## Trabajo separado del 22 de octubre

El paquete `outputs/bazaar-first-x402-free-20261022` conserva un cliente finito que exige la fuente de producción `8453afdc…`; no acepta automáticamente el candidato multiseller `9dd52ff0…`. Está detenido antes de firmar por requisitos de presupuesto y vinculación de wallet todavía pendientes. La aceptación web también sigue pendiente.

Ese cliente y el candidato de Carmelita no se copiaron a esta entrega Bazaar. Sus imports originales apuntan a `beta-open-build/examples/marketplace-x402-buyer.mjs` y a `outputs/bazaar-marketplace-standard-rollout/purchase-completion/carmelita/build-work-v5`; copiar la carpeta del cliente por sí sola no es portátil.

La adaptación autocontenida está en `outputs/bazaar-first-x402-free-20261022/carmelita-candidate/source`, pertenece a [CaBsCrypto/carmelita](https://github.com/CaBsCrypto/carmelita) y tiene digest `3334b872a1aa7b337008cdad9f291aa08b2918a664f9cd2b8677a6b5c03dba23` (724 archivos), sobre base `90cb5800dd3f6b4a2042862a91a2579e3678cfc19a4a0b97b124ed2cd71518ae` (704). Su manifest declara `gitCommit: null`: no fue desplegada, su esquema no fue aplicado y sus funciones financieras siguen desactivadas. Requiere una migración y revisión separadas en Carmelita.

## Efectos de GitHub y recepción

La integración Git de Vercel existe y está habilitada. El comando de exclusión observado cancela las ramas distintas de `main`; aun así, un push puede crear un registro de despliegue cancelado y consumir un límite de Vercel. No se cambió configuración para evitarlo. La autorización del push debe contemplar ese efecto concreto. El resultado de la auditoría de los 151 commits salientes y la decisión de publicación se registran en el resumen de entrega; no deducir un push exitoso de la existencia de este documento. [Vercel documenta que los builds cancelados por esta vía cuentan para sus límites](https://vercel.com/docs/monorepos).

La recepción queda completa cuando se cumpla lo siguiente:

- El resumen confirma las ramas publicadas, sus SHAs finales y el resultado de la auditoría; `HEAD` coincide con el SHA de la rama elegida.
- El manifiesto SHA-256 recibido pasa, el árbol está limpio y el receptor distingue producción de multiseller local.
- La PC original puede estar apagada sin perder los archivos de código y documentación incluidos en el clon. No depender de sus junctions, rutas privadas o procesos abiertos.
- Los servicios externos y secretos necesarios se identifican, pero su acceso no se presupone transferido mediante Git.
- Instalación, pruebas y ejecución quedan autorizadas y realizadas en la notebook antes de afirmar que allí funciona. Registrar sus resultados reales y cualquier bloqueo, sin heredar como actuales los recibos históricos.
- No se han aplicado migraciones, reseteado claves o datos, creado pedidos, firmado pagos, desplegado, abierto PR ni hecho merge como parte de esta recepción.

## Revisión realizada

`AUDITORIA-MIGRACION.json` registra la revisión de los 151 commits originales que no estaban en las referencias GitHub comprobadas: 1.445 blobs, incluidos borrados históricos, y 63 imágenes con OCR y revisión de contexto, QR y metadatos. Las seis dudas de OCR se resolvieron por hashes y evidencia de cuentas/entregas sintéticas. No se detectaron credenciales reales confirmadas ni un bloqueo concreto por datos privados. Es una revisión documentada, no una garantía absoluta. Los commits nuevos contienen fuentes revisadas y los documentos de continuidad.

Se conservaron las descargas ZIP/TGZ originales del producto; no se creó un ZIP de migración. Se inspeccionaron sus 39 miembros en memoria y se cotejaron sus manifests: no contienen credenciales ni datos privados identificados. El WASM de multiseller se conserva junto con Rust y Cargo.lock; usa Soroban SDK 21.7.7. No se compiló ni se certificó equivalencia binario-fuente o una toolchain Rust exacta para la notebook. Sus rutas de compilador embebidas son metadatos, no dependencias de ejecución.

## Alcance concreto de esta rama

Esta copia corresponde a **migracion/bazaar-multiseller-20261022-6b7a6d**. Origen Git conservado: `e9daaf13e792760da0664485d7b189c699a1b0ad` de `beta-open-build`, rama `codex/bazaar-open-release`. Fuente de esta variante: `outputs/bazaar-budget-multiseller-v1/source`. El archivo `ORIGEN-MIGRACION.json` registra estos datos sin valores secretos. Producción y multiseller conservan documentación y scripts del Git base; el trabajo local separado conserva 77 cambios rastreados y 604 archivos nuevos de código seleccionados. No se mezclaron los 27 árboles de trabajo.

El inventario original registró cero staged, 100 unstaged y 1.962 sin seguimiento en esos 27 hijos. Se seleccionó el trabajo de `beta-open-build` y los dos conjuntos actuales de fuentes. Los otros 23 cambios rastreados y los archivos no seleccionados de otros checkouts siguen en la PC original, al igual que sus ramas y dos stashes del repositorio común; no se aplicaron ni eliminaron. Los stashes todavía requieren aclarar su propósito antes de una recuperación separada. No se afirma que todas las ramas históricas o tareas paralelas estén migradas.

En el snapshot local se excluyeron 868 archivos sin seguimiento, principalmente evidencia, releases, observaciones y procedencia de builds. Se mantuvieron fuera `.vercel/`, todos los `.env*` privados, perfiles DPAPI, dependencias, cachés, builds, logs y bases locales. `.env.example` contiene nombres y asignaciones vacías; no contiene la configuración real de ninguna PC o servicio. Las fuentes conservan sus bytes; no se modificó lógica de aplicación. Los archivos que pertenecen a otros proyectos no se copiaron.

Los perfiles DPAPI de scripts históricos están protegidos por Windows `CurrentUser`: copiarlos a otra PC no los vuelve utilizables. La recuperación portátil de las credenciales necesarias no está comprobada, por lo que la preparación operacional permanece **BLOCKED** hasta resolverla por un canal seguro. No extraerlos al chat, no regenerar claves de cifrado de registros existentes y no resetear datos. Revisar también rutas absolutas en wrappers operativos; no son dependencias del runtime web revisado ni deben ejecutarse automáticamente.

## Verificación del manifiesto y trabajo nuevo

Después de leer los documentos y revisar las rutas del manifiesto, se puede verificar su contenido con herramientas de lectura de la notebook:

```powershell
Set-Location .\Bazaarx402
$manifest = Get-Content -LiteralPath .\MANIFIESTO-SHA256.json -Raw | ConvertFrom-Json
$errores = @($manifest.files | Where-Object {
    !(Test-Path -LiteralPath $_.path -PathType Leaf) -or
    (Get-FileHash -LiteralPath $_.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $_.sha256
})
if ($errores.Count) { throw 'El manifiesto no coincide; detener y revisar.' }
git status --short
```

Si ya existe un clon, primero revisar su rama, SHA, índice, archivos sin seguimiento y worktrees. No hacer checkout, restore, pull, reset ni stash automático si hay trabajo. Preferir una carpeta nueva para esta recepción. Iniciar sesión con la misma cuenta no migra archivos, claves, datos ni configuraciones.

Desde la rama de migración elegida y con árbol limpio, crear una rama de continuación con un nombre nuevo comprobado, por ejemplo:

```powershell
git switch -c continuacion/bazaar-notebook-20261022
```

Los commits y pushes posteriores requieren el alcance autorizado en esa sesión. Una rama comparte historia cuando tiene ancestros comunes; iniciar sesión no la conecta ni la integra a `main`. `fetch` sólo actualiza referencias, mientras que un merge puede cambiar archivos y generar conflictos. Antes de un PR, comprobar de nuevo la rama predeterminada real, obtenerla explícitamente y revisar:

```powershell
git remote show origin
git fetch origin refs/heads/main:refs/remotes/origin/main
git merge-base origin/main HEAD
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

El PR futuro tendría base `main` (si sigue siendo la predeterminada) y compare la rama de migración o continuación elegida. Requiere autorización separada; por defecto será borrador. Revisar diff completo, checks, conflictos y efectos de despliegue antes de integrar. Conservar el original, sin push directo a main, auto-merge o force-push.

## Prueba en la notebook, después de la autorización local

1. Verificar SHA, rama, manifiesto y ausencia de dependencias en la PC original antes de instalar.
2. Revisar `package.json`, hooks y lifecycle scripts; autorizar instalación y ejecutar `npm ci` desde la raíz. Instala dependencias y puede ejecutar código de paquetes.
3. Preparar sólo configuración y datos sintéticos de prueba, sin servicios o claves de producción. Mantener desactivadas compras, ejecución real del proveedor, firma y liquidación.
4. Autorizar y ejecutar `npm run typecheck`, verificaciones sintéticas pertinentes y `npm run build`. Registrar resultados nuevos; los recibos históricos no los reemplazan.
5. Con autorización de arranque, usar `npm run dev -- --hostname 127.0.0.1`, abrir `http://127.0.0.1:3000` y recorrer catálogo, ficha de servicio y navegación. Para historial privado o flujos de pedido usar únicamente fixtures/datos sintéticos y un perfil de pruebas preparado; no crear un pedido real para diagnosticar.
6. Si se valida el modo compilado, detener el servidor de desarrollo y usar `npm start -- --hostname 127.0.0.1` después del build autorizado. El servidor puede contactar servicios si se suministra configuración real: revisar el perfil antes de iniciarlo.
7. Repetir el recorrido significativo con la PC original apagada o desconectada, manteniendo internet si los servicios de prueba son remotos. Documentar cualquier ruta, proceso, volumen, túnel o dato que todavía dependa de la PC original.

No se exportaron datos ni se ejecutaron migraciones de base. No se identificaron LFS, submódulos ni assets mayores de 5 MiB en el conjunto candidato revisado; las junctions instaladas no forman parte del código. No se instalaron herramientas, dependencias ni se ejecutaron builds, pruebas o la aplicación durante esta preparación. La migración sólo se prueba operativamente al verificar ese recorrido en la notebook. Un preview necesita autorización separada y no sustituye esta prueba local.
