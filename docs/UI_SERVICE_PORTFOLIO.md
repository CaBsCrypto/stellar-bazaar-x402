# Portafolios públicos de servicios

## Experiencia

/resources/[id] presenta una muestra antes de los contratos: presentación, ejemplo explorable, formatos y límites, precio declarado, conexión general y recorrido explicado. Detalles técnicos y herramientas Testnet quedan cerrados inicialmente. El panel de herramientas se monta únicamente al abrir su sección.

## Materiales utilizados

- Swap Risk: cálculo local existente calculateSwapRisk con XLM/USDC, monto 2500 y lado buy. Devuelve riesgo bajo, impacto 0.221% y liquidez profunda. Son categorías de referencia determinista, no datos del mercado. Se conserva el original consultable.
- Guion: demo-script de reviewDeliveries, cuatro escenas y 30 segundos. Se reutiliza DeliverableViewer con etiqueta explícita de muestra pública; no se presenta como entrega comprada ni como trabajo de AI Creative Studio.
- Capa editorial local en lib/service-portfolio.ts. Ningún cambio al contrato público, catálogo o formulario de publicación. Sin muestra registrada, la ficha indica su ausencia y conserva los formatos declarados.

## Futuro material de anunciantes (no implementado)

La presentación necesita: muestra pública autorizada, procedencia, formato, breve explicación, datos de entrada de ejemplo y límites. Una imagen de portada sería opcional; priorizar contenido explorable. Antes de exigirlo, definir consentimiento de publicación, revisión y compatibilidad de formatos. No cargar HTML arbitrario del proveedor en el visor.

## Validación

Build y tipos PASS (permanece advertencia previa metadataBase). test:deliverables, test:provider-card y test:webmcp:conformance PASS.

scripts/test-service-portfolio-browser.mjs: Edge 1440/390, ambas fichas, selección de indicadores/escenas con teclado, procedencia visible, detalles cerrados inicialmente, apertura técnica, conexión/Escape/retorno del foco y ausencia de desbordamiento. Cero llamadas a API durante las interacciones; cero errores de página. Capturas portfolio-* en docs/ui-evidence.

scripts/test-ui-review.mjs: regresión de catálogo, navegación, detalle correcto y formulario de publicación, sin pagos.

Revisión humana de comprensión y apariencia pendiente en local. No se ejecutaron compras ni se fusionó a main.
