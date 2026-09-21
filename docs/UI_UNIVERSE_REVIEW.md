# Revisión visual: universo y conexión

Versión local de revisión. Sin nuevas compras ni cambios de contratos o autenticación.

## Cambios

- La portada recupera las órbitas CSS, con etiquetas conceptuales y movimiento reducido.
- Conectar mi agente abre un diálogo con el mismo contenido que /hub. Reinicia Comprar al abrir; cierra con Escape, contiene el foco y devuelve el foco al disparador.
- El menú dice Conectar; /hub conserva su ruta y reduce el ancho a 960 px.
- Historial y entregas usan texto oscuro, tarjetas claras y colores del sistema, incluidos los estilos inline del acceso privado.
- Documentación conserva contenido y ejemplos, añade índice y contiene tablas/código en móvil.

## Evidencia

Compilación y tipos PASS. Regresiones history, deliverables, provider-card, provider:self-listing, webmcp:conformance y question-bridge PASS.

Navegador Edge, 1440/390: portada, conexión, pestañas, teclado, foco, Escape, copia y fallo con selección manual, catálogo y publicación; cero mutaciones API. Movimiento reducido comprobado. Capturas en docs/ui-evidence: universe, connect-dialog, hub-page y docs.

Historial sintético, 1280/390: bloqueado, cargando, vacío, error, pendiente de recuperación y pendiente de guardar; bloqueo/reentrada, sin escrituras. Capturas history-* contienen únicamente datos de prueba.

Informe histórico real, solo lectura: mismo hash original, una compra, una versión y seis eventos; otro propietario rechazado. Desde otro proceso se recupera el mismo original. Preguntas sobre informe/hallazgo: edición, copia, alternativa manual, Escape, retirada de borrador al bloquear y recuperación posterior PASS en 1280/390. No se almacenan capturas de accesos privados.

La prueba inicial en desarrollo encontró salida de foco del diálogo; corregida con ciclo explícito de Tab. Una captura durante HMR activó tráfico interno de Next; la validación final sobre compilación no registra escrituras. Permanece la advertencia previa de metadataBase en la compilación.

## Reproducción

Con servidor local compilado en 3214 y PLAYWRIGHT_MODULE/BROWSER_EXE configurados:

```powershell
$env:BASE_URL='http://127.0.0.1:3214'
$env:UI_STAGE='universe'
node scripts/test-ui-review.mjs
node scripts/test-recovery-status-browser.mjs
node scripts/test-history-visual-states.mjs
node scripts/test-question-bridge.mjs --browser
node scripts/test-live-paid-saved-report.mjs
```

Los dos últimos requieren los archivos privados locales del piloto y Redis configurado. No versionarlos. No ejecutan compras.

## Revisión humana pendiente

Aprobar personalidad visual, proporciones y comprensión de los recorridos en la versión local. PR #48 conserva sus dependencias #47 y #46; no fusionar automáticamente.
