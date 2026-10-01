# Manifiesto del sprint nativo con Redis dedicado

Fecha: 2026-10-01, America/Santiago. Estado: preparación local; ejecución Redis
real y cierre pendientes de autorización del plan final y revisión independiente.
No es un manifiesto de despliegue.

## Procedencia y puertas

Checkout `mission-consolidation`, rama `mission/open-bazaar-local`.
HEAD de partida `6ceff21a5ad3102c9658a36b5f21d0dd70b1c94a`; código anterior
aprobado `6c60391d271a57b04ec8621470237c9ca2f522e2`.
El candidato nuevo se identifica en el plan final por SHA completo, fingerprint
de todas las fuentes y verificadores, BUILD_ID y fingerprint del build.
El ejecutor exige Node **22.18.0** y usa Next **16.3.1** instalado, sin instalar
dependencias. Rechaza cualquier `.env*` salvo el ejemplo por su nombre.

Base dedicada: `bazaar-validacion-20261001`, AWS `us-east-1`, Free Tier,
`https://smooth-dory-323957.upstash.io`. La consola mostró coste $0.00 y uso cero
de 500.000 comandos, 10 GB de tráfico y 256 MB de almacenamiento. Eviction
desactivado y sin regiones de lectura adicionales. La credencial dedicada está
fuera de Git, en carpeta privada con ACL exclusiva verificada; no se incluye aquí.
La consulta de consola fue de control/configuración, con cero comandos Redis.
Consulte `evidence/sprint-native-redis-real/provider-preflight.json` y sus capturas.

## Configuración del recorrido local

| Campo | Valor / condición |
|---|---|
| Proceso | `next start`, build webpack identificado, `NODE_ENV=production` |
| Backend | `BAZAAR_WORKSPACE_BACKEND=redis`, `configuredWorkspaceStore`, sin fallback |
| Prefijo | `bazaar-workspace:isolated-<32 hex>` nuevo, congelado en el plan |
| Propietarios | Dos asignaciones server-only ligadas a creationId y hashes iniciales; el cliente no decide ownerId |
| Redis del proceso Next | Relay HTTP loopback exacto; token local sintético, sin credencial de Upstash en Next |
| Redis del relay | Sólo origen dedicado explícito y token privado; HTTPS nativo, redirects/retries 0 |
| Claves | Cinco exactas del plan: registry, initialized, owner:none sólo lectura y dos documentos de propietarios |
| Comandos | Sólo EVAL de READ/COMMIT canónicos; CAS de cuota máximo ocho intentos |
| HTTP de aplicación | Dos proxies loopback con ledger global compartido, incluidos HTML, assets, API, MCP, readiness y errores |
| Reinicio | Mismo relay, ledger, prefijo, fixtures y build; no reinicia presupuestos |
| MCP | SDK instalado; reconexión automática 0; sólo acceso agente para tareas/operación/respuesta |
| Proveedores/pagos | Recepción, revisión pública, activación, mutaciones y pagos desactivados |
| Intento | Archivo exclusivo `attempt.native.<mode>.json` antes del primer request; impide repetir silenciosamente el mismo plan |

Máximos intactos: 400 requests Redis; 2.400 comandos EVAL/Lua; 16/32 MiB de
cuerpos enviados/recibidos Redis; 65.536 bytes por cuerpo Redis y aplicación;
16.384 bytes registry/por owner; 49.164 bytes de valores almacenados;
dos propietarios; 120 requests HTTP de aplicación; 1/2 MiB de cuerpos de
aplicación; 120 segundos por ejecución; 5 segundos por request remoto;
CAS ocho; reintentos de transporte cero. Se excluyen headers/framing TCP/TLS
y overhead de Redis de los conteos de cuerpos/valores; no se certifica memoria
facturada exacta. El margen observado excede esos máximos.

## Navegador y límite de instrumentación

El helper comprueba Chromium existente antes del primer efecto. Todas las lecturas
privadas y MCP atraviesan Next nativo y los proxies contados. Magic Link elimina
el token de la URL y sólo lo conserva en memoria; bloquear vacía contenido y
borrador, y una lectura exitosa entregada después del bloqueo no reabre la vista.

Para conservar el límite individual de 64 KiB, los assets estáticos cuyo gzip
excede ese tamaño se descargan de Next en rangos identity contiguos <=64 KiB.
Cada GET/206 cuenta en el ledger. Se verifican Content-Range, tamaños y SHA256
contra el build final antes de cargar el navegador. Otros assets también verifican
sus bytes de Next. El contexto conserva sólo los bytes ya verificados para sus
recargas; los requests interceptados/cache hits y los GET/rangos efectivos quedan
separados en el reporte. Un fallo no permite fallback al archivo local ni retry.
Este transporte estático está instrumentado; no se afirma una descarga HTTP
intacta de un asset mayor de 64 KiB. Las APIs y Redis siguen el recorrido nativo.

Los ocho casos cubren chat/biblioteca, 390×844 y 1366×768, texto normal y
font-size calculado 2× con mediciones y captura. No certifican dispositivo físico,
zoom nativo ni auditoría WCAG completa. La simulación se comprueba dentro de los
detalles técnicos de la biblioteca.

## Reproducción y autorización

Desde el checkout, con el Node existente y sin cargar `.env`:

```powershell
$node22 = 'C:\Users\MGC\AppData\Local\Temp\bazaar-node22-review\node.exe'
$env:BAZAAR_NATIVE_PLAYWRIGHT_MODULES = 'C:\Users\MGC\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:BAZAAR_NATIVE_CHROMIUM_EXECUTABLE = 'C:\Users\MGC\AppData\Local\ms-playwright\chromium-1243\chrome-win64\chrome.exe'
& $node22 scripts/run-open-workspace-redis-native.mjs build
& $node22 scripts/run-open-workspace-redis-native.mjs prepare $newPrivateDirectory
& $node22 scripts/run-open-workspace-redis-native.mjs double "$newPrivateDirectory\plan.json" --browser
```

El directorio es nuevo, fuera del repo, con ACL exclusiva. Build, plan y payloads
deben coincidir antes de transportar. El doble no consulta la instancia real.
Prepare una carpeta y plan nuevos para la ejecución real, sobre el candidato
final. La autorización humana debe nombrar planHash, sourceFingerprint, instancia,
límites y margen gratuito actual. `humanAuthorized` nunca se rellena por inferencia.
La credencial se suministra mediante las dos variables explícitas
`BAZAAR_ISOLATED_REDIS_REST_URL/TOKEN`; no se imprimen ni se guardan en informes.
El modo real exige además `--browser` y el hash exacto del plan.

## Reversión y cierre

Ante un efecto incierto, el relay detiene nuevos comandos, cancela transportes y
los procesos Next/navegador; conserva la intención, el intento y sus máximos
reservados. No repite, borra claves ni cambia de prefijo para ocultar el intento.
La recuperación necesita una decisión explícita sobre ese intento.

La reversión de habilitación es `BAZAAR_ENABLE_OPEN_WORKSPACES=false` y recepción
de proveedores desactivada, conservando backend Redis, documentos, hashes y
tombstones. No restaurar accesos retirados ni inferir propietarios.
El sprint sólo cierra después del recorrido nativo Redis real/Magic Link aprobado
por revisión independiente. Publicar, push, merge, deploy, compras y cambios de
plan siguen fuera del alcance. No certifica respaldo ni pérdida total de Redis.
