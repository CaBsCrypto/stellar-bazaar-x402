# Compra real Testnet y recuperación — 14 de septiembre de 2026

## Resultado

Una transferencia real de 0,001 USDC Testnet entregó el informe HTML live de example.com en español. El informe está conservado en Redis y recuperable en la biblioteca privada. La entrega requirió recuperación asistida tras un fallo de verificación; no se presenta como un recorrido automático sin incidencias.

- Operación: website-live-paid-ca166bc31d35da0ed87eba5f.
- Transacción: c5cf77fe5a0d37bcc63c642f51ed5f5f846ced4d6bfdc7e698e400a036ceb5c5.
- Ledger: 4667670. Confirmada: 2026-09-14T04:58:57Z. Resultado de red: SUCCESS.
- Importe: 10000 unidades atómicas (0,001 USDC Testnet).
- Destinatario: GAHOZFSDG2DW32FOUUP6XA4SMN3OCR7NOUXHAPYFN47BLJX56GJ3WCSM.
- Activo: CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA.
- Hash de ficha: 629038265959abd51abe75daf6e5b2611be0f1a7dec6befb7342703eadd8eb6e.
- Hash del informe: 51085d250810d36eb12338f0e9f53b438b9c1fc7ac1262434fce6460cf520219; idéntico al preparado antes del cobro.
- Preview original: https://website-intelligence-provider-m9jlxq3bz.vercel.app.

## Incidencias y resolución

Antes de la firma, el comprador todavía esperaba el dominio antiguo en su hook de validación. Los intentos de ejecución abortaron sin marcador de pago. Se corrigió el origen esperado para usar el Preview fijado y se agregó una prueba que rechaza el dominio de producción cuando está aprobado el Preview. La atribución inicial al panel local fue incorrecta; el panel estaba disponible.

El único intento de pago alcanzó settled (revisión 3). El facilitador conservó la invocación y la autorización Soroban exactas, pero cambió cuenta y secuencia del remitente de la transacción. El verificador que exigía igualdad de hash de la envoltura rechazó esa evidencia y la respuesta de compra fue 503.

La corrección verifica la transacción original o, para una envoltura patrocinada, la invocación idéntica y todas las autorizaciones de dirección Soroban firmadas, incluidos nonce, firma e invocación autorizada. Siguen siendo obligatorios éxito en cadena, activo, destinatario e importe. No basta una transferencia de igual importe. Las pruebas rechazan otra autorización y una transferencia sin autorización coincidente.

Se ejecutó localmente finalizeLive con la verificación corregida sobre el único registro confirmado, mediante comparación atómica; settled pasó a delivered (revisión 4). Se conservó el mismo payload y el mismo informe. Esa finalización no dispone de facilitador y no ejecuta pagos. Después, el endpoint remoto de recuperación devolvió el informe y el cliente lo guardó en Bazaar. La verificación independiente confirmó transferencia, éxito y ledger del comprobante.

## Validación

- Proveedor local: 57 pruebas aprobadas, incluidas envoltura patrocinada y rechazo de autorización diferente.
- Cliente: prueba del hook previo a firma aprobada para Preview y rechazo del antiguo origen.
- Proceso nuevo: una operación, una versión, seis eventos únicos, mismo original y misma transacción; otro propietario recibe 404.
- Navegador 1280 y 390 píxeles: nuevo informe comprado, Resultado inicial, actividad, enlace a la transacción exacta, pregunta con fecha de este informe y sin credenciales/comprobante, bloqueo y reapertura aprobados. Cero solicitudes de escritura durante la navegación.
- Pruebas anteriores simuladas y Redis de preparación permanecen documentadas por separado en PREVIEW_READY_QA.md. Esta transacción corresponde al informe live y es distinta de la compra histórica de datos de prueba.

## Limitación y siguiente mantenimiento

La corrección de reconciliación está guardada localmente; el Preview existente sigue usando be5c449. El registro de esta compra ya está finalizado y se recupera por su endpoint. Antes de otro piloto se debe publicar la corrección y validar la recuperación automática en esa nueva revisión; esta compra no autoriza otra transferencia.

No borrar ni reiniciar el marcador de esta operación. Si falla un registro futuro de esta misma respuesta, usar únicamente store o recover. No se publicó la biblioteca ni se configuró S3.
