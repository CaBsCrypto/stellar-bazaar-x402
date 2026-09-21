# Sistema visual Bazaar

## Dirección
Paper claro, ink oscuro, violet para acciones. Mint comunica confirmación, amber avisos, blue información. Un servicio listado lleva información, no un sello de compra verificada. Tokens únicos en styles/tokens.css; styles/ui.css contiene los primitivos. Hojas heredadas se conservan para flujos no migrados.

## Tipografía
Sans del sistema/Inter si está instalada: cuerpo 16px, etiqueta 12px, auxiliar 14px, título de tarjeta 20px, sección 25.6–36px. Georgia solo para hero de portada (40–72px). Mono para datos técnicos. No se añade descarga de fuentes.

## Primitivos
PageShell: contenedor común; Button/ButtonLink: primary, secondary, quiet; Card/ServiceCard: contenido y condición declarada; Pill: neutral, info, success, warning; SectionHeading: jerarquía; Modal: dialog nativo, panel inferior móvil.

Botones: hover, foco visible, disabled y busy. Enlaces no simulan disabled. Catálogo: vacío y reset, resultados anunciados. El catálogo estático no requiere spinner ni estado de red ficticio. Modal: Escape, foco contenido, fondo inerte y restauración al disparador; bloqueo de scroll se restituye al cerrar.

## Uso
Usar Button para acciones y ButtonLink para navegación. Usar tokens y clases; no agregar colores o tipografía inline. Cards blancas sobre paper, radio 8–12px. No usar color como único indicador. Mantener etiquetas de estado explícitas. No mostrar 'disponible' o 'verificado' por el mero hecho de estar indexado.

## Migración
Portada, navegación, pie y catálogo usan los primitivos. Los formularios de pago/publicación y las vistas privadas conservan lógica y estilos heredados. Revisión del Hub en el siguiente PR. Las capturas son evidencia visual; no sustituyen pruebas de compra, almacenamiento real ni comprensión del usuario.
