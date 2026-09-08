# Validación de entregas interactivas — 8 de septiembre de 2026

## Resultado local

- Compilación Next/TypeScript correcta.
- `test:deliverables`: contrato, tipos/referencias, datos ausentes, contenido no ejecutable, propietarios aislados, reintentos idempotentes, versiones conservadas, cuotas concurrentes en un modelo, pendientes sin acceso, firmas S3 acotadas por archivo/checksum/tamaño y GET de cinco minutos. HEAD rechazó tamaños y hashes incorrectos en un doble del servicio. Una compra simulada se ejecutó una sola vez aunque fallara el guardado.
- Regresión de historial y actividad: pruebas existentes correctas, incluido fallo de telemetría sin repetir cobro y resultados privados fuera del emulador público.
- Navegador en `/history/review`: navegación por escenas y confirmación de copia completa; reproducción del MP4 real de ejemplo (8 segundos, estado de carga completo y tiempo avanzando), pista de subtítulos presente; selección de dos afiches, comparación y modal de ampliación; evento de descarga del afiche recibido; índice del informe, actividad y comprobante.
- Pantalla móvil de 390 × 844: tarjetas reorganizadas, guion/copiar escena, galería y navegación del informe sin desbordamiento horizontal (375 px de contenido incluyendo el espacio de la barra vertical). Vista temporal restaurada al terminar.
- Servidor aislado `scripts/serve-deliveries-review.mjs`, puerto 3213: el panel autenticado abrió un guion con dos versiones, permitió consultar la anterior, retiró el contenido al bloquear (cero encabezados de la entrega presentes) y recuperó las versiones al volver a introducir el acceso de prueba. Este servidor usa datos ficticios en memoria, nunca la cuenta real ni sus credenciales.

## Pendiente, sin afirmar validación real

- Redis persistente: `test:activity:redis` incluye ahora versiones, cuotas y confirmación de archivos, además de reinicio del contenedor y concurrencia. No se pudo ejecutar: Docker engine unavailable. No se afirma que la prueba en memoria demuestre persistencia real.
- S3 privado: falta configuración. No se realizó carga/descarga contra un bucket, prueba real de CORS/Range, expiración efectiva de un enlace ni interrupción de red real. Las firmas y respuestas HEAD sí están cubiertas por las pruebas locales; eso no demuestra compatibilidad de un proveedor S3 concreto.
- La renovación de acceso de medios se intenta al recibir un error; se conserva la posición del video y se limita la repetición tras fallos consecutivos. Debe validarse con URLs realmente caducadas en el bucket elegido.
- La reentrada de la prueba aislada demuestra limpieza y recuperación de la vista, no persistencia después de reiniciar Redis/S3.
- Testnet: sigue pendiente de la etapa anterior. Esta implementación no generó un nuevo pago ni una firma, y no está publicada.

Los ejemplos son públicos, ficticios y claramente etiquetados. Los archivos reales usan el flujo privado descrito en INTERACTIVE_DELIVERIES.md. Bloquear el panel retira el contenido de la página; una URL ya firmada conserva su validez breve y un archivo ya descargado no se revoca.
