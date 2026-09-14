# Piloto preparado y revisión visual — 14 de septiembre de 2026

## Resultado del bloque

Informe real preparado en el proveedor; sin firma, firmante ni intento de pago. La biblioteca local sigue mostrando el informe anterior sin pago y la compra histórica de datos de prueba. El informe nuevo todavía no es una entrega comprada ni se ha registrado como tal.

## Condiciones exactas para revisión final

- Preview protegido: https://website-intelligence-provider-m9jlxq3bz.vercel.app
- Despliegue: dpl_3UwfNuJ9zqoYJMp5aSGJG97MUbYs; proveedor be5c449.
- Ficha live: 1.2.0; hash 629038265959abd51abe75daf6e5b2611be0f1a7dec6befb7342703eadd8eb6e.
- Solicitud: mode=live, language=es, url=https://example.com.
- Ruta: POST https://website-intelligence-provider-m9jlxq3bz.vercel.app/v1/x402/audits.
- Stellar Testnet; exactamente 10000 unidades atómicas = 0,001 USDC.
- Destinatario: GAHOZFSDG2DW32FOUUP6XA4SMN3OCR7NOUXHAPYFN47BLJX56GJ3WCSM.
- Activo: CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA.
- Nueva operación: website-live-paid-ca166bc31d35da0ed87eba5f.
- Informe preparado el 2026-09-14T04:47:17.167Z; hash 51085d250810d36eb12338f0e9f53b438b9c1fc7ac1262434fce6460cf520219.

La ficha se deriva de VERCEL_URL únicamente cuando X402_USE_PREVIEW_ORIGIN=true y el entorno es Preview. Fuera de Preview ese modo falla cerrado. Este despliegue tiene live habilitado; producción no fue promovida ni reconfigurada. El acceso de protección Vercel permanece activo.

## Persistencia y acceso comprobados

- Preflight del comprador: aprobado sin firma ni pago; origen, ficha, destinatario, activo, importe y saldo comprobados.
- Redis real del despliegue: estado prepared, revisión 1, informe live con hash válido, sin payload ni marcador de pago.
- Ocho solicitudes simultáneas sin firma devolvieron 402 y conservaron el estado completo idéntico. Otro proceso leyó el mismo hash. No se repitió el análisis.
- La configuración privada está en work/private-website-live-paid-pilot/preview-access.json, ignorada por Git. El cliente la carga para conservar el origen y los accesos entre procesos. No contiene secretos de la cartera.
- La credencial de protección pertenece al proyecto Vercel; el transporte del comprador restringe su uso al origen HTTPS exacto revisado y rechaza redirecciones. No se afirma que Vercel emita una credencial exclusiva por dominio.
- La preparación conserva su identidad antes del primer envío. Si caduca la recuperación de 24 horas, detenerse y revisar el estado antes de decidir una operación nueva; nunca borrar un marcador de intento para volver a pagar.

## Biblioteca visual

Panel privado local: http://127.0.0.1:3214/history. Demostraciones: http://127.0.0.1:3214/history/review.

Corrección: la barra flotante técnica de WebMCP ya no tapa la biblioteca ni sus demostraciones; el registro de herramientas permanece. Preparar pregunta elimina explícitamente la cabecera de protección de Vercel si se incorpora al borrador.

- 1280 y 390 píxeles: sin desbordamiento horizontal ni superposición técnica.
- Informe anterior: Resultado primero; selección de hallazgo/informe, edición, copia, fallo de portapapeles con selección manual, teclado, bloqueo y reentrada aprobados. Cero solicitudes de escritura en ese recorrido.
- Ejemplos: navegación y copia de escenas; reproducción de video con pista de subtítulos; comparación, ampliación y descarga de afiches; tres pestañas aprobadas en ambas anchuras. Son ejemplos públicos ficticios, no compras ni pruebas de S3.
- Informes anteriores: original y conteos conservados, recuperación desde proceso nuevo y rechazo de otro propietario aprobados.

## Pruebas reproducibles

Proveedor: npm run check (56 pruebas). Bazaar: npm run build; node scripts/test-preview-access.mjs; node scripts/test-paid-live-client.mjs; npm run test:website-report; node scripts/test-question-bridge.mjs --browser; node scripts/test-library-preview.mjs; node scripts/test-pilot-saved-report.mjs; node scripts/website-live-report.mjs verify https://example.com. Las pruebas de navegador aceptan PLAYWRIGHT_MODULE y BROWSER_EXE y requieren el panel local activo.

La evidencia específica de Redis de esta preparación se conserva en el archivo privado preparation-evidence.json. No confundir las ocho solicitudes remotas sin firma de este bloque con las pruebas anteriores del facilitador simulado.

## Pendiente

Solicitar la autorización final de una única compra bajo las condiciones anteriores. Antes de firmar, volver a comprobar ficha, estado, vigencia y saldo; cualquier cambio de importe, activo, destinatario o contrato detiene la ejecución. Tras pagar, verificar transferencia, recuperar y guardar la entrega, abrirla en las tres pestañas y preparar la pregunta usando ese nuevo informe.

S3, nuevos proveedores y publicación del panel permanecen fuera de este bloque.
