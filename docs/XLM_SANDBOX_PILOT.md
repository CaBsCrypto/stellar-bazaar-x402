# Piloto local USDC / XLM

## Estado y alcance

El Sandbox declara dos precios independientes: 0,001 USDC o 0,01 XLM de Stellar Testnet. Ambos devuelven el mismo resultado de ejemplo. No son una conversión de mercado. XLM no está validado con una transferencia real, publicado ni habilitado para otros proveedores, split-exact, staking o escrow.

La guía de Sozu y el prompt breve permanecen; XLM usa Friendbot cuando haga falta. El faucet no se ejecuta desde el panel.

## Configuración de revisión

PowerShell, en la raíz del repositorio:

```powershell
$env:NEXT_PUBLIC_X402_XLM_PILOT='true'
$env:NEXT_PUBLIC_APP_URL='http://127.0.0.1:3215'
$env:X402_PILOT_STATE_DIR=Join-Path (Get-Location) 'work/xlm-pilot/provider'
$env:X402_PILOT_PAYMENTS_ENABLED='false'
$env:X402_SELLER_ADDRESS='GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ'
$env:STELLAR_X402_FACILITATOR_API_KEY='local-review-payments-disabled'
npm run build
npm run start -- -H 127.0.0.1 -p 3215
```

El API key anterior es un marcador sin acceso, exclusivamente para permitir consultar el desafío con pagos bloqueados. No reemplaza una credencial real. La ruta rechaza liquidaciones del piloto salvo activación explícita; exige origen localhost y diario privado. NEXT_PUBLIC_X402_XLM_PILOT es configuración de compilación: al omitirlo y reconstruir se restaura USDC únicamente. No publicar la compilación de revisión.

Si se cambia destinatario, alinear X402_SELLER_ADDRESS y NEXT_PUBLIC_X402_PILOT_SELLER antes de compilar. La comprobación previa falla si ficha y desafío difieren.

## Interfaces y compatibilidad

- `payment` sigue siendo la opción principal; `paymentOptions` es opcional y contiene opciones exact con símbolo, contrato Testnet, importe decimal y destino. El contrato debe coincidir con el activo permitido.
- El desafío 402 conserva USDC primero y añade XLM cuando el piloto está habilitado. El proveedor valida todos los campos aceptados y su asociación a la solicitud.
- `BazaarAgentClient` mantiene `maxPriceAllowedUsdc`. `maxAmountByAsset` admite límites decimales explícitos para USDC/XLM; XLM requiere además `allowedAssets`.
- Para el piloto, proporcionar `paymentJournal: new FilePaymentJournal(privateDirectory)` y llamar `executeService(card, inputs, {operationId, preferredAsset?})`. Conservar operationId, ficha, entradas y propietario para reintentos. preferredAsset es opcional; USDC gana cuando tiene saldo y permiso, sin cambiar activo después de iniciar.
- `readBalances` es una dependencia opcional para pruebas. En ejecución normal, Horizon Testnet calcula saldo gastable descontando reservas, patrocinio y obligaciones de venta.
- Mantener el firmante en el entorno privado. El comprobador de recibos recibe `expected.contract` además de símbolo, importe, red y destino; debe comprobar la transferencia en la red. Usar `verifyTestnetTransfer(context, payerPublicAddress)` de `lib/verify-testnet-transfer.ts`: consulta una transacción exitosa en Horizon Testnet y contrasta hash, contrato, origen, destino e importe de la invocación transfer. Un callback que devuelve true no es una verificación real.
- El ejemplo antiguo agent:paid-execution conserva su alcance USDC y no es el runner de este piloto.
- Sin opciones, clientes/fichas antiguos conservan su recorrido. Precio máximo sin filtro de activo se interpreta como USDC; XLM necesita filtro explícito. No se mezclan unidades para comparar precios.

## Persistencia y errores

El comprador escribe un marcador antes de solicitar una firma. Conserva la respuesta recibida antes de reconciliar y antes de registrar el historial. Si falla la verificación, la misma operación vuelve a verificar la copia guardada; si falla el historial, vuelve a registrar el resultado sin consultar al proveedor. Los eventos por operación conservan identificadores estables.

El proveedor guarda su marcador antes de liquidar y conserva el resultado del facilitador. Solicitudes simultáneas compiten por un archivo creado de forma exclusiva; no se roba un bloqueo ni se reinicia un marcador automáticamente. Una operación con pago incierto y sin respuesta conservada permanece pendiente: este bloque no añade un endpoint nuevo de recuperación remota. Requiere reconciliar la evidencia antes de cualquier intervención; nunca borrar el marcador para repetir un cobro.

Los diarios son archivos privados locales, fuera del control de versiones, con permisos restrictivos donde el sistema los soporte. Protege también la carpeta con permisos de usuario del sistema operativo. No contienen seeds ni accesos de historial: la asociación se guarda mediante hash. Están pensados para procesos de una instalación local, no para múltiples instancias serverless ni almacenamiento efímero. Una publicación futura necesitará un almacén duradero compartido equivalente.

## Evidencia

- `npm run test:xlm:pilot`: selección, reservas XLM, esquema antiguo, contratos/importes/red/destino alterados, concurrencia, bloqueo de segundo cobro, respuesta perdida, recuperación desde otro proceso, aislamiento lógico de propietario y fallo de historial. Firma y facilitador simulados; cero transferencias.
- El test integrado recorre el comprador real y el handler HTTP; sustituye únicamente firma y facilitador. Comprueba la allowlist interna de x402, sin desactivar controles de gasto.
- `node scripts/prepare-xlm-pilot.mjs`: consulta la ficha y el 402 local, compara precios/destino y confirma el SAC nativo en RPC Testnet. No carga claves ni firma. Usar BASE_URL si cambia el puerto local.
- Contrato nativo derivado con `Asset.native().contractId(Networks.TESTNET)`: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`. Confirmado por RPC, ledger 4807944 durante esta revisión.
- Pruebas de UI revisan catálogo, detalle y conexión en móvil/escritorio; las pruebas de historial cubren formato XLM y USDC sin migrar registros anteriores.
- La actualización del test MCP es independiente: ya existían siete pilotos y dos declarados activos. La paginación compara posiciones porque el catálogo estático y el registro dinámico pueden repetir un id; deduplicar esos orígenes queda fuera del piloto.

## Condiciones de la validación autorizada

Revisar antes de habilitar una sola compra: Sandbox, Stellar Testnet, 0,01 XLM (100000 unidades), contrato anterior, destinatario `GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ`, facilitador `https://channels.openzeppelin.com/x402/testnet`. Volver a comprobar las condiciones y la wallet del comprador cuando se autorice; no reutilizar operaciones históricas.

La compra real deberá reconciliar transferencia y entrega y abrir su resultado en la biblioteca privada. El preflight, la simulación y las capturas no son evidencia de esa compra.


### Configuración del comprador

```typescript
const buyer = new BazaarAgentClient({
  baseUrl: "http://127.0.0.1:3215",
  payerSecretKey: process.env.X402_PAYER_SECRET,
  allowedAssets: ["USDC", "XLM"],
  maxAmountByAsset: { USDC: "0.001", XLM: "0.01" },
  paymentJournal: new FilePaymentJournal("work/xlm-pilot/buyer-private"),
  receiptVerifier: context => verifyTestnetTransfer(context, payerPublicAddress),
  history: privateHistoryConfiguration,
});
// Conservar operationId en el archivo privado de la tarea antes de esta llamada.
// Esta llamada intentaría pagar: NO forma parte de la revisión sin transferencias.
const result = await buyer.executeService(card, {pair:"XLM/USDC", amount:2500, side:"buy"}, {
  operationId: savedOperationId,
  preferredAsset: "XLM",
});
```

`card` debe ser la ficha conservada de esta operación y `privateHistoryConfiguration` los accesos existentes separados del humano y del agente, nunca una credencial escrita en código. Las reejecuciones usan los mismos datos y el mismo diario.

Validación local completada: compilación y tipos; pruebas de piloto, verificador sintético, historial, entregas, provider-kit, preservación de fichas, seguridad, registro, WebMCP, comprador, recuperación, protocolo 402, políticas del agente y MCP. Capturas locales en `work/xlm-catalog-{360,390,1440}.png`, `work/xlm-detail-{360,390,1440}.png` y `work/xlm-connect-{360,390,1440}.png`. La exploración visual no realizó llamadas a APIs. Esta batería simulada no ejecutó faucets ni transferencias; las compras autorizadas se documentan por separado a continuación.


## Compras reales autorizadas — 22 de septiembre de 2026

Se ejecutó exactamente una compra por activo, primero USDC y después XLM, con wallet existente, operaciones nuevas, sin faucet ni conversión:

| Activo | Importe | Transacción Testnet |
|---|---:|---|
| USDC | 0.001 (10000 unidades) | `0cbd08e863ef5f23c30a3be27a46fef5c6948005cd1a731b564c6d99999496eb` |
| XLM | 0.01 (100000 unidades) | `cb358b31c7042b147543a88c5e49014a51bd1a4516a86e0dfbcb993fc2635aea` |

Hash SHA-256 del mismo resultado Sandbox conservado: `9f93f93f0ede23704e86bc1f21a98074553533a021024f1f304754417c0b8ba5`.

### Evidencia separada

- Red: Horizon confirmó éxito y se contrastaron hash de transacción, contrato, pagador, destinatario e importe de transfer. Son pagos reales de Testnet por un resultado de ejemplo, no análisis financiero real.
- Redis real: una operación por activo; resultados recuperables desde procesos nuevos, con los mismos hashes; el segundo propietario no obtiene las operaciones del primero.
- Recuperación: se ejecutó de nuevo para ambos activos con firma bloqueada y llamadas al proveedor, verify y settle rechazadas por el ejecutor. Se recuperaron las respuestas conservadas, sin otro cobro.
- Simulaciones: `test:xlm:pilot` y `test:history` pasaron de nuevo después del ajuste de identificadores estables de eventos de tarea. No son evidencia de transferencia.
- El panel mantiene el estado contractual reportado del pago. La verificación independiente anterior no se convierte artificialmente en un estado verificado de la API.

### Ejecutor privado local

`scripts/validate-two-assets.mjs` separa prepare, preflight, buy, recover, check y disable. Las operaciones completadas no deben volver a comprarse. Los estados, respuestas y accesos están en `work/private-dual-asset-pilot`, ignorado por Git; nunca adjuntarlos a un PR.

El proveedor dedicado usa HTTPS local en 3216, con certificado local de prueba y la misma ruta y handler existentes. Esto conserva la validación del historial, que rechaza entregas pagadas mediante HTTP local. La UI funciona en 3215. La credencial real del facilitador permanece en el servidor; el permiso temporal está limitado a operación y activo y se deshabilita en finally. Al cierre, `check` confirmó `gateEnabled: false`.

Para consultar evidencia existente sin pagar: `node scripts/validate-two-assets.mjs check`. Para recuperar, usar `recover USDC` o `recover XLM` con el certificado local mediante NODE_EXTRA_CA_CERTS. Nunca borrar marcadores para reintentar una compra. No hay publicación, push ni cambios en main.

- Biblioteca privada comprobada mediante navegador en 1440 px y 390 px: dos tareas, Resultado inicial, contenido Sandbox, actividad, comprobante con el activo e importe correctos y enlace a cada transacción. Bloquear retira el contenido; reabrir el Magic Link recupera ambas tareas y elimina el token de la dirección. No se tomaron capturas de respuestas privadas.

## Cierre de revisión local

- Stellar Expert abrió ambos comprobantes con estado Successful: USDC invoca su contrato con 10000 unidades y XLM con 100000, hacia el destinatario autorizado. La cuenta que envía/paga comisiones del facilitador no debe confundirse con el pagador del argumento transfer.
- Se repitieron recover USDC y recover XLM desde procesos independientes, sin firmas ni liquidaciones. Se conservan las dos transacciones y resultados.
- Biblioteca revisada en navegador: resultado de ambos activos, importes, actividad, bloqueo y reentrada. A 390 px no hubo desbordamiento horizontal. Se dejó Resultado abierto para revisión humana; no se tomó una captura privada.
- Catálogo y detalle identifican la validación como piloto local USDC/XLM exclusivamente para Swap Risk Sandbox. No se modificó el contrato de disponibilidad MCP ni el estado reportado del historial.
- Compilación con comprobación de tipos, test:xlm:pilot, test:history y git diff --check correctos. Advertencia previa de metadataBase sin configurar, ajena a este cierre.
- La actividad conserva dos pares históricos de inicio/finalización generados antes de fijar los identificadores de esos eventos. Son evidencia anterior de recuperación, no compras adicionales. Los nuevos reintentos conservan los eventos estables y una sola operación por activo.

### Grupos de cambios para revisar

1. Ayuda Testnet y guía Sozu: cambios anteriores conservados, separados de la validación monetaria.
2. Opciones USDC/XLM y comprador: contratos opcionales, selección y presupuesto por activo, desafíos y persistencia local antes de firmar.
3. Evidencia y recuperación: ejecutor controlado, verificador de transferencias, pruebas y este registro.
4. Presentación: importe por activo en historial y etiquetas del piloto local en catálogo y detalle.

Sin commits, push, merge ni despliegue en este cierre. Para salir de localhost sigue pendiente un almacén compartido duradero de marcadores con exclusión atómica; el diario local no acredita seguridad multiinstancia.
