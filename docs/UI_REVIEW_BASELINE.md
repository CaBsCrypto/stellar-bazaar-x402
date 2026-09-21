# Base de revisión UI — 2026-09-21

Base: 60c3a28. Sincronización fast-forward desde 2816704 (13 commits).

## Cambios incorporados
Desde b8b88a1: almacenamiento privado S3/R2 y sus pruebas, enlaces de historial, chat humano/agente, adaptador WebMCP, Provider Kit/CLI, administración y navegación móvil. Los 13 commits de esta sincronización incorporan indexación del guionista, ingest, catálogo, documentación, navegación, historial y ajustes móviles. Esta revisión no vuelve a certificar su despliegue ni compras.

## Evidencia previa a editar
- Build: pasa; aviso previo de metadataBase sin configurar.
- WebMCP conformance: pasa (7 herramientas del adaptador; no equivale al número de herramientas del servidor MCP).
- Preservación de fichas, self-listing y contrato de flujo de pago: pasan, sin pagos.
- Historial: pruebas de dominio y cliente pasan; prueba de render falla importando @/components/Navbar en su cargador VM antiguo. Fallo preexistente, independiente del rediseño.

## Brief v3 contrastado
- Pendiente: claims 99/1, cuatro segundos, contador fijo; siete enlaces en nav, estilos inline, Hub único y Lab.
- Resuelto parcialmente: catálogo estático reducido a Swap Sandbox y Scriptwriter; rutas resources existen para ambos.
- Defecto encontrado: PaymentDemo invocaba Swap también desde la ficha de Scriptwriter. Se limita su presentación a Swap; no se cambia su lógica.
- Pendiente: promoción staking/APY montada en Publicar. Se oculta por defecto con BAZAAR_UI_SHOW_EXPERIMENTAL_STAKING; el componente se conserva.
- Dependencia backend: catálogo estático y discovery dinámico pueden diferir. No se modifica registro, APIs ni esquema; mostrar 'listado' no implica verificación de disponibilidad.

## Límites
Sin cambios en app/api, contratos, pagos o validaciones. Sin transacciones, credenciales ni despliegue a producción. No se considera la existencia de una prueba como prueba de almacenamiento remoto real en esta sesión.

## Cierre
El arnés VM del historial se adaptó en ui/agent-hub y vuelve a pasar. Ver docs/UI_REVIEW_QA.md para evidencia final, recuperación real de solo lectura y límites.
