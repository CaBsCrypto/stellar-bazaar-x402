# Preparación local del QR de la demo de texto

Este cambio prepara el siguiente candidato. No publica producción, no modifica el firewall remoto y no activa un vendedor ni un cron. La compra de texto comprobada en la preview protegida sigue siendo una evidencia separada; no valida acceso público al dominio de producción.

En modo `BAZAAR_PUBLIC_DEMO=true`, `GET` y `HEAD /` redirigen a `/demo`, con respuesta 307 y sin conservar la query. La portada también redirige desde el servidor si el perímetro no está habilitado. Se conserva el destino de los dos QR existentes: `demo-qr.svg` apunta a `https://bazaar.browns.studio/demo` y `bazaar-qr.svg` a `https://bazaar.browns.studio/`. El segundo llega al mismo recorrido mediante la redirección. Ninguno lleva una credencial.

La página `/demo` explica registro, conexión MCP, firma local, recuperación y estado efectivo. Indica que el QR apunta al dominio público previsto y que una preview protegida requiere su propia URL. Descargar o escanear el QR no configura el agente ni firma pagos. El contenido ilustrativo de la portada anterior no se abre como parte del cambio.

El catálogo conserva todas las fichas activas. Si falta disponibilidad vigente, vence su confirmación, se agota el cupo o se pausan compras, muestra el motivo y un enlace para consultar con el agente. Sólo ofrece “Comprar con mi agente” mientras la capacidad reportada sigue vigente. Comprueba el vencimiento local cada quince segundos, sin llamadas periódicas. Es una indicación al usuario: la orden y la admisión del pago deben verificar y reservar capacidad en el servidor.

El perímetro admite la ruta exacta `POST /api/market/capacity`; exige formato Bearer y delega la autorización de agente y propietario al handler nativo. No convierte la ruta en pública ni habilita operaciones administrativas. Las pruebas nativas de `control` y `review` rechazan accesos ausentes y credenciales sintéticas de otro rol antes de cualquier I/O.

## Propuesta de firewall para revisión

[TEXT_DEMO_PUBLIC_WAF_PROPOSAL.json](TEXT_DEMO_PUBLIC_WAF_PROPOSAL.json) contiene una plantilla `rules.update` sobre la regla restrictiva existente. Añade una excepción definida por el host exacto `bazaar.browns.studio`, entorno `production`, método y ruta. La nueva condición de denegación equivale a `denegación existente AND NOT excepción de la demo`. Conserva el acceso MCP de las dos previews y la excepción privada histórica. No añade una regla de bypass ni una excepción `/api/*`.

Las doce agrupaciones expresan AND dentro de cada grupo y OR entre grupos, según la [referencia de configuración de Vercel WAF](https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration). La operación prevista usa la [API oficial de actualización del firewall](https://vercel.com/docs/rest-api/security/update-firewall-configuration). La equivalencia lógica está probada localmente; la aceptación de estos grupos por la API sigue pendiente.

`PRIVATE_LOCAL_IP` es un marcador público. La plantilla no se debe enviar así. Después de la autorización, la operación deberá leer la configuración actual, comprobar que sigue coincidiendo con la regla saneada de origen e incorporar únicamente su valor existente sin registrarlo en evidencias públicas. Si cambian regla, grupos o cantidad de reglas, hay que preparar de nuevo el cambio. La aplicación y lectura posterior de la regla son verificaciones separadas.

Quedan fuera de la excepción pública administración, revisión, control, guardian, presupuesto operativo, rutas de pruebas/simulación, subidas generales y medios. Las APIs privadas incluidas siguen exigiendo credenciales, dueño correcto, origen, tamaño, cuotas y vencimiento en sus handlers. La protección de despliegues y los demás controles de Vercel no se modifican con esta preparación.

## Evidencia y pendientes

Comandos ejecutados localmente, sin servicios externos ni transacciones:

```powershell
node --experimental-strip-types scripts/test-demo-qr-boundary.mjs
node --experimental-strip-types scripts/test-market-catalog-availability.mjs
node --experimental-strip-types scripts/test-text-demo-waf-proposal.mjs
node --experimental-strip-types scripts/test-demo-routes.mjs
node --experimental-strip-types scripts/test-pilot-route-policy.mjs
python scripts/test-public-qr.py
```

Resultado: once escenarios de Next/handlers nativos, ocho del componente de catálogo, 189 comprobaciones de rutas WAF, 768 combinaciones de equivalencia y dos QR decodificados. Las dos suites de política existentes también pasan. El informe saneado está en [text-demo-qr-local-2026-10-10.json](evidence/text-demo-qr-local-2026-10-10.json).

Antes de declararlo público faltan el build y la preview del candidato final, la revisión de configuración efectiva, autorización de publicación y firewall, aplicación con lectura posterior, y una comprobación externa del recorrido `/` → `/demo` → registro → conexión → catálogo → historial privado. Las compras reales, el cron, y la aceptación de archivos/imagen/video tienen sus propias autorizaciones y pruebas; este informe no las realiza ni sustituye.
