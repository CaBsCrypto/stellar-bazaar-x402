# UI revisada: mercado, publicación y biblioteca

Esta evidencia usa exclusivamente ejemplos públicos y borradores vacíos. No contiene entregas privadas ni accesos.

- Portada: plaza Three.js, persona en computador y dos agentes; recorrido de ejemplo con pausa y selección manual.
- Catálogo y conexión: jerarquía compacta, fichas completas clickeables y conexión en diálogo.
- Publicación: borrador humano local y formulario técnico conservado en un desplegable.
- Historial: ejemplos sin acceso y biblioteca privada mediante Magic Link; bloqueo y borradores solo en memoria.

## Validación

Build, tipos, historial, entregas, chat, WebMCP, contrato visual de pagos, validación de publicación y revisión manual: PASS. No se realizaron pagos. Publicación comprobada en localhost:3214 y con respuestas simuladas; la primera ejecución usó erróneamente el puerto 3000 y se repitió en el puerto correcto.

Navegador: 1440×900, 1366×768, 1024×768, 390×844, 360×800; zoom 200 %, teclado, foco y diálogos. Biblioteca: ejemplos públicos, acceso válido/inválido, errores simulados y bloqueo. Portada: cuatro historias, pausa exacta, reducción de movimiento, respaldo sin WebGL y suspensión fuera de pantalla. Visibilidad de pestaña simulada; no se midió rendimiento en hardware móvil físico.

`npm run test:market:visitor` comprueba destinos, continuidad, espera lateral y pausa. CI del PR 46 necesitaba incorporar los dobles de navegación ya presentes en la rama final; se corrigió sin cambiar la aplicación.

Escaneo de secretos: sin coincidencias en archivos actuales o build; el escáner informa un commit histórico preexistente, sin reescribir historia.

## Capturas

| Superficie | Escritorio | Móvil |
|---|---|---|
| Mercado | [Captura](market-desktop.png) | [Captura](market-mobile.png) |
| Biblioteca pública | [Captura](library-desktop.png) | [Captura](library-mobile.png) |
| Publicación | [Captura](publish-desktop.png) | [Captura](publish-mobile.png) |
