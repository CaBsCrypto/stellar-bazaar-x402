# Revisión de recuperación explícita del faucet

Fecha: 2026-10-04. Revisor: `review_usdc_hosted`. Alcance: código y metadatos públicos locales. No se leyó DPAPI ni se ejecutaron solicitudes, provisión o pagos desde esta revisión.

Dictamen de código: **PASS_LOCAL_RECOVERY_REVIEW** para `scripts/provision-usdc-sale-wallets.mjs`, SHA256 exacto `ed434a6b46d97c896d7d53642c16cf89d8ea11e8996c465fa6d79087b2aca9b8`, y el binder local revisado `scripts/bind-usdc-faucet-recovery.mjs`. No queda un fallo concreto bloqueante identificado en estos controles. El efecto exige primero la transición local congelada y sus gates; este PASS no acredita financiación o venta hospedada.

Dictamen de alcance: **la recuperación revisada puede continuar dentro de la tarea autorizada después de congelar su manifiesto**. No amplía las dos identidades, la financiación Friendbot/trustlines, el único claim USDC, las dos ventas ni el límite global de 120 API. El sublímite técnico de HTTP al faucet pasa de dos a tres para incluir una única lectura explícita de desafío adicional; la proyección pasa de 115 a 116. El CPU sigue dentro de los 300 segundos acumulados. No se autoriza una repetición automática.

## Hecho confirmado y estado conservado

El reporte público conserva once intercambios HTTP, todos CONFIRMED: seis lecturas Horizon, dos Friendbot, dos trustlines y un desafío del faucet. Tiene cero intentos de claim USDC; el contador aumenta y se persiste antes del POST, por lo que la parada en CPU ocurrió antes de transmitir una solicitud de financiación USDC. El estado es `PAUSED_LOCAL_POW_EXHAUSTED`, no una respuesta de financiación perdida.

SHA de aplicación: `a741937b6d389edbd333ff51bac95b68e654d40e`. Binding inicial de provisión: `93a3a5276d00cc17e475d190fe55655ee17888f015e66bd74b2d162efb400eda`. Hash SHA256 observado de los bytes del reporte pausado: `ad7779e6136ce5c3947c77806e08ba0133341928c1100139db791ce7c250b65e`. El desafío anterior no se conservó antes del solver; no puede darse por recuperado ni reconstruirse su respuesta.

Los 37.582 ms de provisión incluyen el CPU agotado. El agregado de los informes públicos disponibles al corte de esta revisión es 57.550 ms. Reservar 90.000 ms de CPU deja 152.450 ms bajo el máximo de 300.000, antes de las llamadas restantes. La guardia debe recalcular el agregado antes de cada paso; esta observación no sustituye esa guardia.

## Puertas antes del efecto

1. Exponer `recover-faucet` como método separado del alta ordinaria. No debe entrar al loop Friendbot/trustlines ni firmar o reenviar sus XDR. Confirmar las dos wallets y sus recibos completos, cero claims y ausencia de PENDING/UNCERTAIN.
2. Congelar una intención única de recuperación, vinculada al mismo plan, SHA, activo Circle testnet, wallet B exacta y hash del reporte previo. Persistir su consumo antes del GET/POST del nuevo desafío, con el bloqueo común. Volver a invocar el método debe fallar antes de fetch, también si vuelve a agotarse CPU.
3. Revisar `faucetApiRequests=3`, la proyección 116/120 y el binding activo nuevo. Mantener `friendbotClaims=2`, `trustlineSubmissions=2`, `usdcFaucetClaims=1`, `marketPaymentSubmissions=2`, cero reintentos y todos los topes globales de bytes/tiempo.
4. Reservar el solver local medido, como máximo 90 segundos, dentro de los 300 segundos acumulados, y reservar cada llamada HTTP antes de enviarla. El trabajo local del solver no debe introducir red, compras de cómputo, extensiones de transporte o CPU sin límite.
5. Validar y conservar la nueva respuesta del desafío antes de empezar a resolverla: prefijo/protocolo esperado, challenge ID acotado, dificultad permitida y destinatario B exacto. Respetar la caducidad documentada cuando esté disponible. Una respuesta ajena o rechazada detiene el flujo.
6. Guardar solución, desafío, destino y payload/hash exacto del claim antes del único POST. El contador de claim y el intento PENDING se escriben primero. Recibo semántico perdido/inválido conserva UNCERTAIN; no se envía un segundo claim ni se solicita otro desafío automáticamente.
7. Conservar el único GET posterior de Horizon ya previsto para comprobar el saldo de la trustline de B, del emisor Circle exacto. No repetir las lecturas iniciales de las wallets ni agregar polling. Los siete GET de provisión y dieciséis intercambios de backend conservan la cota Horizon 23/24.

## Binding e historia

Antes de cambiar el binding activo, archivar bytes exactos del reporte pausado, comprobar su hash y registrar una transición `oldBinding -> newBinding` con la razón, límites anteriores/revisados e índice de inicio del nuevo tramo: once intentos existentes, primer intento nuevo con índice 11. Mantener los intentos, hashes de transacciones, contadores, bytes y tiempo anteriores sin modificarlos.

El reporte acumulado puede actualizar su binding activo sólo después de esa transición verificable. Los recibos anteriores siguen ligados al binding original mediante el snapshot y el rango de intentos; no deben reetiquetarse como efectos ejecutados bajo el nuevo manifiesto. La historia de binding debe enlazar de forma continua con la revisión congelada y rechazar cambios de SHA, wallet, activo, destinos, comisiones o límites no revisados.

El uso de recuperación se guarda fuera de `counts`. Los cinco contadores actuales ya cubren las solicitudes; añadir un contador de recuperación dentro de `counts` podría contar por segunda vez la lectura del desafío. La conciliación final suma la tercera llamada al faucet, preserva los once intentos iniciales y exige PASS_PROVISIONED antes de acreditar provisión completa.

## Validación local requerida

Antes de cualquier efecto, revisar el diff del método y comprobar con dobles: desafío/solución guardados antes de CPU/claim; dirección e identidad exactas; un único desafío adicional y un único claim; cero Friendbot/trustlines adicionales; repetición del método rechazada; incertidumbre del claim conservada sin reenvío; agotamiento de CPU/API/bytes/tiempo detenido antes del paso correspondiente; binding inicial y snapshot íntegros después del éxito o fallo.

Comprobar la optimización del solver contra vectores o una implementación de referencia de SHA256 y medirla localmente. Un benchmark no garantiza encontrar una solución: otro agotamiento conocido debe dejar el claim sin transmitir y conservar toda la evidencia para una decisión explícita posterior.

## Validación final ejecutada y binding revisado

Este revisor ejecutó `test-usdc-wallet-provision.mjs` y `test-usdc-provision-global-budget.mjs` sobre el helper de hash exacto indicado: ambos PASS, con dobles, sin HTTP externo, sin lectura DPAPI y sin semillas guardadas. El recorrido de recuperación añade exactamente desafío, claim y un GET Horizon; conserva el baseline completo, mantiene dos Friendbot/dos trustlines, consume una sola recuperación y rechaza replay, incertidumbre, cambio de baseline, caducidad y cambio de límites primarios antes del efecto correspondiente. El test comprueba payload/hash DPAPI congelados antes del único POST de claim.

`provider-faucet-pow-local.json` vincula la medición al mismo hash exacto del helper: dificultad 24, prefijo de 160 bytes, cuatro workers, nonce `20177376`, digest `000000ff83bce26c10e850a763695c379d0d61f06dac51489198847783a73514` y 20.449 ms. Cero solicitudes externas, DPAPI o semillas en ese benchmark. Los workers reciben únicamente parámetros públicos, `env:{}` y `execArgv:[]`; el padre termina todos ante timeout y verifica de nuevo nonce/digest antes de permitir el claim. Una sola fixture no garantiza encontrar la siguiente solución.

El binder hace sólo lectura/escritura local del manifiesto. Exige reporte pausado y snapshot íntegro de hash `ad7779e6136ce5c3947c77806e08ba0133341928c1100139db791ce7c250b65e`, once intentos confirmados, cero claims, binding original exacto, medición del helper de hash actual y este marcador de revisión. Congela `fromBinding -> toBinding`, límites anteriores/revisados, `firstNewAttemptIndex:11`, hashes de snapshot/medición/revisión y proyección 116; abre exclusivamente `canRecoverFaucet`. El método recuperador conserva todos los contadores previos y vuelve a comprobar identidad, baseline, caps primarios, tiempo, API y payloads antes de transmitir.
