# Biblioteca y preguntas para el chat

El panel prioriza Resultado. La actividad permanece en su pestaña; las tareas sin entrega mantienen una vista de actividad para mostrar avances o errores. Las tarjetas usan los metadatos originales disponibles, fecha local y estado; cuentan operaciones, sin presentar consultas gratuitas como compras. Cuando un registro antiguo no conserva metadatos, se mantiene su título declarado.

Los informes ofrecen «Preparar pregunta» para el conjunto o una sección. Las plantillas Entender, Priorizar y Evaluar una mejora incluyen solo título, URL, fecha y contexto del informe. El borrador es editable, se limita a 6.000 caracteres y señala recortes y omisiones. Cambiar la intención sustituye las ediciones y se advierte antes. No se envía ninguna solicitud a un chat o proveedor.

No se serializan objetos de pago, archivos, accesos ni el original completo para generar preguntas. Se omiten patrones reconocibles de credenciales, referencias largas y enlaces con parámetros privados. Si una edición introduce esos patrones, el primer intento de copia muestra el texto depurado para revisión; el siguiente copia el texto visible. El usuario debe revisar el contexto antes de llevarlo a otro servicio.

El diálogo usa foco modal nativo, cierre con Escape, retorno al botón de origen y selección manual si falla el portapapeles. Los borradores viven en memoria; bloquear o abandonar el resultado desmonta el diálogo. No se puede retirar contenido ya copiado al portapapeles del usuario.

## Validación local

- `node scripts/test-question-bridge.mjs`: selección de contexto, las tres intenciones, recorte, omisión de credenciales y exclusión de comprobantes.
- `node scripts/test-question-bridge.mjs --browser`: requiere Playwright y el piloto privado configurado. Se pueden indicar `PLAYWRIGHT_MODULE` y `BROWSER_EXE` para un runtime local. Comprueba escritorio 1280×900 y móvil 390×844: resultado primero, edición, copia controlada, rechazo de portapapeles, selección manual, teclado, bloqueo y recuperación. Solo permite solicitudes GET durante el recorrido.
- Pasaron las pruebas existentes de entregas, actividad e informes y la compilación de producción. El informe real y la compra Testnet anterior se recuperaron sin alteraciones desde Redis; otro propietario no pudo leerlos.

La integración es local, sin publicación ni cambios de contratos públicos o migraciones. La conversación de origen todavía no se conoce; el humano pega la pregunta en su chat.
