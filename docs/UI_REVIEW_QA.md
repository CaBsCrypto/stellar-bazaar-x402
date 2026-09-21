# Revisión UI — 2026-09-21

Base sincronizada: 60c3a28. Tres ramas dependientes: ui/home-copy-honesty → ui/design-tokens → ui/agent-hub. No se fusionan automáticamente. Revisar en ese orden y ajustar la base del PR siguiente cuando se integre su dependencia.

## Qué cambia
- Portada sin promesas 99/1 o cuatro segundos; contador fijo retirado; staking oculto por defecto. No cambia la implementación de esas capacidades.
- Tokens y componentes compartidos en portada, navegación, pie, breadcrumbs y catálogo. Etiquetas 'Listado en Testnet' no prometen verificación.
- Hub con Comprar/Publicar/MCP y plantillas existentes; copia con alternativa manual. Las plantillas no se ejecutan desde el Hub.
- Lab agrupa demos/experimentos; la portada muestra el catálogo de servicios. Rutas previas permanecen.
- Cinco enlaces principales. Consola visual WebMCP solo en playground; registro de herramientas conservado en todas las páginas.

## Pruebas locales
- Build y typecheck: PASS. Persiste aviso previo de metadataBase; no bloquea compilación.
- WebMCP conformance (list/search) y get_service del guionista: PASS.
- Preservación de fichas y self-listing (8 negativos, prueba de control y staging manual): PASS.
- Historial, cliente y render seguro: PASS. Se adaptó el arnés VM a Navbar/Breadcrumbs/Footer incorporados antes de esta rama. Conserva assertions de escape HTML, importes y vista bloqueada; breadcrumbs mock conserva backHref. La navegación real se prueba en navegador.
- Chat/magic links y contrato de flujo de pago: PASS.
- Entregas y visores: PASS, modelos locales; no validación nueva de S3.
- Preguntas: selección, redacción de secretos, límite de 6.000 caracteres: PASS.
- Escaneo: sin claves privadas ni secretos coincidentes en código actual o build. El escáner informa un commit histórico ya conocido; esta tarea no reescribe historia.

## Navegador
scripts/test-ui-review.mjs sobre versión compilada en 127.0.0.1:3214: PASS en 1440 y 390 px. Portada, búsqueda sin resultados/reset, guionista sin demo Swap, menú Escape/retorno de foco, tres pestañas Hub/flechas, copia y error con selección manual, Lab, precio inválido deshabilita revisión manual, staking ausente. Cero escrituras a API y cero errores de página. Capturas públicas en docs/ui-evidence (sin tokens ni contenido privado).

scripts/test-recovery-status-browser.mjs: PASS 1280/390, entrega pendiente de recuperación o guardado, última actualización, bloqueo/reentrada; respuestas sintéticas, cero escrituras. No se presenta como recuperación remota real.

## Recuperación histórica real (solo lectura)
scripts/test-live-paid-saved-report.mjs desde proceso nuevo: PASS. La operación website-live-paid-ca166bc31d35da0ed87eba5f conserva 1 compra, 1 versión y 6 eventos; hash original y transacción coinciden; otro propietario obtiene rechazo. Ningún pago nuevo.

scripts/test-question-bridge.mjs --browser: PASS en 1280/390 con informe ya conservado. Resultado primero, pregunta por hallazgo, edición, copia/fallo manual, teclado, bloqueo y reentrada. Cero escrituras. No se publican capturas ni accesos privados.

## Reproducir
- npm run build y npm run typecheck.
- npm run test:webmcp:conformance, test:provider-card, test:provider:self-listing, test:history, test:agent-chat, test:payment-flow y test:deliverables.
- node scripts/test-question-bridge.mjs para pruebas sin red.
- Servidor local compilado: npm run start -- --port 3214.
- Para navegador, configurar PLAYWRIGHT_MODULE y BROWSER_EXE si no están instalados en el entorno. BASE_URL selecciona servidor, UI_STAGE=hub selecciona las comprobaciones finales de scripts/test-ui-review.mjs.
- Las pruebas históricas requieren la configuración privada existente; no generan ni solicitan nuevas compras. No versionar work ni .env.

## Revisión pendiente de producto
Revisar portada, /hub y /lab y comprobar con una persona que identifica Mercado, conexión y Publicar en menos de un minuto. Este resultado requiere revisión humana: no se deduce de pruebas automatizadas. Backend, APIs, contratos, pagos, validaciones y autorizaciones permanecen fuera del diff. Los PRs no se fusionan; producción no se publica manualmente. La integración existente de GitHub/Vercel puede generar Previews automáticos de las ramas.

El catálogo estático y discovery dinámico siguen siendo fuentes distintas. Unificar su origen requiere un trabajo independiente; no se presenta esta UI como corrección de ese contrato.
