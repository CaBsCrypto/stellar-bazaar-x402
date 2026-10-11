# Revisión del candidato de texto antes de publicar

Candidato final de código: `aedf2feecd35c4cbff70c7eb42913ed1e521b513`. MCP `1.1.0`, 35 herramientas, una conexión `/api/mcp`. Código y configuración preparados; producción y cron siguen sin publicarse o activarse por este trabajo. No se hicieron compras, firmas ni ejecuciones nuevas del proveedor. [Configuración vigente para revisión](release/text-production-release-2026-10-11.json).

El vendedor tiene una cuenta propia creada en el espacio nuevo de preparación, permiso humano `market:submit` y configuración de agente ligada a esa cuenta. Sus seis accesos nuevos se guardan exclusivamente en un journal local ignorado, cifrado con Windows DPAPI. La ficha preparada es **Guion breve algorítmico**, `0,01 USDC Stellar Testnet`, entrega privada de texto durante siete días y destino `GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C`. Su origen permanente verificado es `https://ai-video-scriptwriter.vercel.app`. No se copió la credencial principal de Redis al trabajador ni se almacenaron claves privadas de wallets.

El perfil local tiene cuenta, permiso, ficha, configuración y acceso Redis limitado preparados. La credencial del trabajador se autenticó en Redis real y rechazó cuatro operaciones fuera de su alcance. Sólo permite ocho comandos en su prefijo propio; no recibió el token principal. La ejecución se mantiene apagada. Faltan el envío nativo que genera la prueba de control, su comprobación en el endpoint y la revisión/activación del servicio. [Evidencia inicial del perfil](evidence/text-production-seller-profile-prepared-2026-10-10.json) y [acceso limitado validado](evidence/text-production-seller-scoped-access-2026-10-10.json).

El perfil y su manifiesto original conservan su vínculo inmutable con `c009137…`; la revisión posterior corrige el código sin recrear la cuenta ni cambiar su ficha o credenciales. El archivo de configuración vigente registra esta procedencia y el candidato final. Ninguno de los dos documentos aplica configuración en Vercel.

## Admisión y pago

Un servicio visible sin capacidad vigente no ofrece compra en el catálogo y no admite órdenes nuevas. El agente propietario informa disponibilidad mediante `report_market_capacity`; el trabajador comprueba primero un endpoint autenticado de salud del proveedor. La señal vence en seis minutos. Un cupo impagado se reserva durante cinco minutos. Bazaar comparte entre todos los servicios del vendedor el máximo de **un pedido pendiente y 50 autorizaciones diarias**.

El servidor comprueba el cupo al crear la orden, antes de la primera autorización y antes de enviar el pago al facilitador. La reserva, el contador y el intento se escriben juntos mediante compare-and-swap atómico de Redis. Redis comprueba además el vencimiento con su propio reloj antes de guardar. Tras recibir la confirmación se vuelven a comprobar capacidad y generación del vendedor; un reloj monotónico detecta demoras aunque el reloj del cliente se estanque. Un `503` por indisponibilidad conocida se produce sin enviar el pago. Revocación, señal vencida, capacidad agotada o pérdida de confirmación impiden reenvíos automáticos. Los pagos confirmados conservan recuperación y entrega aunque se cierre la admisión.

Si falla la última comprobación después de guardar el estado de liquidación, se conserva la incertidumbre y el cupo para revisión. No se vuelve a enviar el pago; este bloqueo conservador puede cerrar nuevas compras del vendedor hasta resolver el incidente.

La señal reduce cobros a proveedores indisponibles, pero no garantiza que nunca falle una entrega después de un pago. Los fallos e incertidumbres se conservan para revisión y recuperación; este candidato no añade reembolsos automáticos. Antes de una parada prevista el vendedor debe informar `ready:false`; una caída imprevista se detecta por el vencimiento de la señal.

## Validaciones comprobadas

| Validación | Resultado | Alcance |
|---|---|---|
| Suite del candidato | 30 suites PASS | Local, incluyendo privacidad, MCP, historial, límites y recuperación |
| Nueva capacidad del vendedor | 34 escenarios PASS | Incluye vencimiento durante CAS, respuesta tardía y recuperación sin reenviar; sin red ni transacciones reales |
| Pago x402 | 67 controles PASS | Firmas sintéticas en memoria; facilitador y ledger simulados |
| Trabajador y handler | 72 escenarios + 28 controles PASS | Salud, reserva durable, respuesta perdida y entrega conservada |
| Redis real | 14 controles PASS, 128 solicitudes | Tres claves sintéticas, un ganador concurrente, escritura conjunta, reloj de Redis, cuota compartida y limpieza confirmada |
| Acceso Redis del vendedor | 12 controles PASS, cuatro rechazos, 14 comandos | Dos claves sintéticas limpiadas; 72 pruebas offline del helper |
| Paquete proveedor | 51 controles, 19 de Express PASS | 22 archivos, cron vacío y disponibilidad autenticada |
| Compilación | Bazaar y proveedor PASS | Copias preparadas; no valida despliegue |
| QR y perímetro | 11 Next, 8 UI, 189 rutas, 768 combinaciones PASS; 2 QR decodificados | Local; no se aplicó el firewall remoto |
| Preview del candidato final | 19 comprobaciones PASS, 14 solicitudes | Redirección, páginas, QR, MCP, catálogo y ausencia de compra; sin cuentas, pagos o ejecuciones nuevas |

Evidencias del candidato final: [30 suites](evidence/text-race-fixed-release-local-2026-10-10.json), [Redis real](evidence/text-seller-capacity-real-race-fixed-2026-10-10.json), [build](evidence/text-race-fixed-package-build-2026-10-10.json), [QR](evidence/text-demo-qr-local-2026-10-10.json), [fuente congelada](evidence/text-production-race-fixed-source-export-2026-10-10.json). La evidencia QR se produjo sobre el candidato anterior: los archivos QR, UI y perímetro no cambiaron; las suites correspondientes también pasan en el candidato final.

La ejecución inicial del agregador falló por TCP local restringido y fixtures anteriores sin la nueva reserva. La ejecución final del candidato fijado usa el permiso local necesario y pasa las 30 suites. Los intentos iniciales del wrapper real se detuvieron antes de iniciar el cliente al resolver la ruta y dos instalaciones de Node; el informe real aceptado corresponde únicamente a la ejecución final acotada. Una prueba de medición del catálogo legado, deshabilitado en esta demo, conserva una expectativa anterior y no forma parte de la aceptación de estas 30 suites. No se afirma que toda la suite histórica del repositorio esté aceptada.

La compra de texto anterior, con entrega y aislamiento comprobados en navegador, pertenece al candidato `633e31e…` de la preview protegida. No se repitió y no demuestra aceptación alojada del candidato final `aedf2fe…`.

## Preview validada y apertura pública pendiente

La [Preview protegida validada](https://stellar-bazaar-x402-9ltdf5bsn-cabscryptocontacto-6028s-projects.vercel.app/demo) sirve el candidato final: raíz 307 → /demo, las páginas de demo, alta, catálogo e historial, ambos SVG y MCP 1.1.0 con sus 35 herramientas. El catálogo muestra la ficha histórica sin disponibilidad ni opción de compra. Las rutas de identidad y reporte rechazan accesos sin credencial. Las capacidades alojadas exponen 200 registros/día, 200 por IP/hora, 60 peticiones por cuenta/minuto y 120 globales/minuto. Las comprobaciones pasaron usando sólo la cabecera privada existente de protección de Vercel, desde la máquina del operador. No se abrieron registros o compras, ni se repitieron los accesos privados, la compra o la entrega. [19 comprobaciones](evidence/text-race-fixed-configured-preview-acceptance-2026-10-11.json). Se comprobó también en el navegador interno: [evidencia de lectura](evidence/text-preview-browser-2026-10-11.json) y [captura del vendedor no disponible](evidence/text-preview-unavailable-catalog-2026-10-11.png).

La primera Preview del mismo código no recibió los parámetros de demo y catálogo: la raíz respondió 200 y el catálogo 503. Se conserva esa evidencia fallida. La segunda aplicó únicamente los valores no secretos del espacio sintético conocido y pasó la lectura de aceptación; no modificó secretos globales ni configuración de producción. [Despliegue corregido](evidence/text-race-fixed-configured-preview-deployment-2026-10-11.json), [fallo inicial](evidence/text-race-fixed-protected-preview-2026-10-11.json) y [diagnóstico](evidence/text-race-fixed-preview-diagnosis-2026-10-11.json).

Ambos QR existentes llevan al dominio previsto sin secretos. En el candidato nuevo la raíz redirige a `/demo`; desde allí están explicados registro, cuenta privada, conexión del agente, catálogo y recuperación. [Preparación del QR](DEMO_QR_PREPARATION.md) y [propuesta exacta de firewall](TEXT_DEMO_PUBLIC_WAF_PROPOSAL.json).

La lectura sin credenciales desde la máquina del operador a las `2026-10-11T02:40:22Z` obtuvo `/demo` 404, `/catalogo` 200 y `/api/mcp` 200 con versión `0.5.0` y ocho herramientas. Todavía no sirve el candidato nuevo. Esa lectura no demuestra acceso desde otra IP; la restricción remota previamente observada no se modificó en este trabajo. [Lectura actual](evidence/text-public-readiness-refresh-2026-10-10.json).

El código resuelve el destino del QR, pero el acceso público externo no está aceptado. La propuesta modifica únicamente la regla existente para el host, rutas y métodos de la demo; conserva autenticación de cuenta y excluye administración, revisión, control y guardian. Antes de aplicarla debe recuperarse la configuración actual y validarse la respuesta de la API.

La lectura alojada del candidato ya pasó en Preview protegida sin cron ni simuladores de pago. Para abrir la demo quedan el envío de ficha, la prueba de control y revisión del endpoint permanente, la aceptación del trabajador nuevo y la autorización de publicación/apertura exacta. El recorrido privado con compra anterior sigue ligado al candidato histórico; no se presenta como una nueva validación de pago del candidato final. Compras de prueba y cualquier programación necesitan su aprobación separada. [Configuración preparada vigente](release/text-production-release-2026-10-11.json).

No se contratan planes ni se aumentan presupuestos. La estimación de cron anterior pertenece al candidato anterior y ya excedía la cuota mensual observada; la versión nueva añade salud y reportes de capacidad, por lo que debe medirse antes de programarla. Ningún cron queda incluido en los paquetes preparados.

El escaneo acotado de secretos del código y build actuales no encontró semillas Stellar ni coincidencias con los secretos locales conocidos. El historial Git conserva un commit anterior con una coincidencia de semilla; no se reescribió el historial. Este escaneo no demuestra ausencia de todos los secretos posibles.
