# Recorrido de navegador USDC: ejecutado con transporte incompleto

El recorrido funcional se completó en la Preview de sustitución: A/B recuperaron
las dos operaciones, bloquearon la vista, usaron teclado y viewport 390×844. Los
logs acreditan 14 API privadas y 78 intercambios Redis, sin resultados inciertos
del servidor. Se reservó además una solicitud para el prime con token vacío que
mostró UNAUTHORIZED sin UUID observado. No hubo nueva compra ni ejecución.

El tráfico completo del navegador, la ampliación nativa al 200 % y Freighter humano
siguen pendientes. Toolbar/JWE continúa observado. El guion siguiente conserva la
previsión original y no autoriza repetirlo. Consulte usdc-browser-functional.json,
usdc-browser-traffic.json y usdc-counter-reconciliation.json.

Este guion comprueba lectura y presentación del Preview protegido ya sustituido. No crea pedidos, no firma, no paga, no invoca el proveedor y no modifica fichas. Freighter humano sigue siendo un control separado pendiente.

El operador comprobó antes el SHA, el despliegue READY y el presupuesto acumulado en el manifiesto y los registros HTTP. Se requirió el PASS de `usdc-bazaar-replacement-protection-check.json`, ligado al ID, SHA y URL del despliegue de recuperación, con una denegación anónima confirmada de `/history`; la ausencia del campo de protección en v13 no acredita ni refuta ese control. La reserva fue **20 API / 80 intercambios Redis / 400 comandos de cota superior**. Las 14 lecturas previstas más el prime suman una previsión conservadora de 15. No consumir la reserva restante mientras el transporte no tenga una cota demostrada.

| Acción | API previstas | Acumulado |
| --- | ---: | ---: |
| Recuperar A: operaciones, actividad/tareas, actividad/operaciones, servicios, pedidos | 5 | 5 |
| Actualizar marketplace de A una sola vez: servicios y pedidos | 2 | 7 |
| Recuperar B: las mismas cinco lecturas privadas | 5 | 12 |
| Actualizar marketplace de B una sola vez: servicios y pedidos | 2 | 14 |

Contar las solicitudes reales y su metering; la tabla es una previsión, no evidencia de ejecución. Registrar aparte HTML, recursos, redirecciones de protección y SSR con sus contadores. La cola compartida serializa las lecturas del mismo acceso. No abrir tareas anteriores, paginar, cambiar filtros, actualizar actividad ni navegar al catálogo durante este guion: esas acciones consumen lecturas adicionales.

1. Preparar el navegador existente en la sesión autenticada de Vercel. Lanzar `scripts/serve-usdc-recovery-once.mjs A` con el Node aprobado. Su salida contiene únicamente `port`, `id` y el origen público. Navegar a `http://127.0.0.1:<port>/recover/<id>` y activar «Abrir historial privado de A». El servidor sólo acepta una visita, se cierra después de servirla y caduca en 60 segundos. No imprime ni escribe el token.
2. No emitir capturas ni el árbol AX de la página local. Leer AX con `emit:false`, localizar sólo la etiqueta pública del enlace y omitir el href del resultado visible. En el destino comprobar que el fragmento fue retirado por la aplicación antes de emitir cualquier captura. El acceso debe quedar en campos de contraseña; los enlaces a chat también pueden contener acceso y deben redactarse antes de imprimir AX. No imprimir parámetros, valores de acceso, headers Authorization ni cuerpos de peticiones.
3. En A comprobar «Mis servicios» y dos ventas del mismo servicio USDC: primera «Entrega disponible» con texto y comprobante; segunda «Pago verificado · entrega fallida» sin texto de entrega. Comprobar 0,01 USDC, destinatario A, Circle testnet, emisor y SAC; el historial del vendedor no debe incluir conversación privada de B. Comparar identificadores, hashes, fechas y texto con la evidencia hospedada. Actualizar marketplace una vez y comprobar que conserva los mismos estados. Usar Tab y Shift+Tab para alcanzar y abrir/cerrar «Identidad del activo», con foco visible; no activar controles de escritura.
4. Bloquear A mediante «Bloquear espacio». Comprobar «Biblioteca bloqueada», desaparición de texto, identificadores y wallet privados, y que ninguna respuesta tardía restaura datos. No debería producir API. Lanzar de nuevo el helper con `B` y recuperar B por el mismo procedimiento, sin reutilizar el enlace de A.
5. En B comprobar dos compras, mismos identificadores y comprobantes, texto exacto único y el fallo de entrega separado del pago confirmado. Comprobar una actualización de marketplace. Revisar teclado sobre acordeones y bloqueo. En escritorio, fijar base real 100 %, medir DPR/innerWidth/visualViewport antes y después del atajo de zoom, y acreditar **zoom real de página a 200 %** con DPR ×2 y viewport CSS ÷2, sin pinch; un font-size CSS idéntico no descarta zoom. Revisar lectura, foco y desbordamiento; restaurar y medir 100 %. Después cambiar el viewport a 390 × 844 para comprobar móvil. Un viewport menor o CSS artificial no acreditan zoom. Seguir la preparación en `usdc-browser-dom-observations.md` y conservar PerformanceResourceTiming sanitizado como observación auxiliar, sin presentarlo como captura completa de red. Ninguna de estas acciones locales debería consultar una API.
6. Bloquear B y comprobar borrado de la vista. Conservar capturas sanitizadas, resultado de teclado/móvil/zoom, SHA, ID del despliegue y contadores reales. Informar explícitamente cualquier control sin ejecutar. Después de aprobar este recorrido, el operador podrá ejecutar la retirada/revocación prevista por el manifiesto y comprobar el acceso conservado de B mediante el ejecutor hospedado; esas API pertenecen al tramo reservado del ejecutor, no a este guion.

No presentar este documento como prueba pasada. La generación algorítmica y las firmas sintéticas acreditan backend; no acreditan uso humano de Freighter ni apertura pública.
