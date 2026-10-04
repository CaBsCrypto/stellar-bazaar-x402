# Conciliación de contadores USDC

`scripts/reconcile-usdc-counters.mjs` lee únicamente los informes públicos preparados del sprint. No hace HTTP, descifra credenciales, modifica Redis, firma pagos ni cambia gates del manifiesto.

Ejecutar `node scripts/reconcile-usdc-counters.mjs partial` para un corte de contadores o `node scripts/reconcile-usdc-counters.mjs final` para el cierre. Escribe `docs/evidence/sprint-marketplace/usdc-counter-reconciliation.json`. La modalidad final termina con código 1 si falta cobertura; nunca sustituye una aprobación de apertura, una prueba de venta o Freighter humano.

## Informes requeridos

- Manifiesto y `usdc-hosted-http.json`, vinculados por plan y SHA.
- `usdc-meter-*.json`, vinculados a los despliegues del manifiesto, con todas las observaciones API y SSR. Cada export debe añadir `collection:{complete:true,limit:100,rawRecords:N,meterObservationCount:M}`. N cuenta filas del CLI y debe ser menor que su límite; M cuenta todos los mensajes de medición de `row.message` y `row.logs[]` y debe coincidir exactamente con `records.length`. Una fila puede contener varios mensajes, incluidos duplicados; se conservan y después se deduplican por UUID. Para exports anteriores sin M se conserva la validación N >= records.length. Llegar al límite exige una lectura explícita acotada para conciliar la ventana, no una declaración de exhaustividad.
- Provisión de wallets, prueba del alias protegido y las seis protecciones anónimas. Cada intento debe estar confirmado; sus API, bytes y tiempo se suman una vez. Una reclamación de USDC ya está contada dentro de las llamadas HTTP del faucet: dos en la provisión original o tres acumuladas si se completa la recuperación explícita del reto perdido. El historial anterior de provisión se conserva como evidencia; sus once intentos no se suman otra vez a los contadores acumulados.
- `usdc-vercel-control.json` para las cotas separadas de comandos, despliegues, alias y secretos de Preview. El tráfico HTTP interno del CLI no se presenta como tráfico API de Bazaar.
- `usdc-toolbar-assets.json`, cuando el manifiesto tenga `browserResourceProbes`: dos GET anónimos confirmados de las URLs públicas exactas de bootstrap de Vercel Live, con hashes y tamaños de cuerpo/header. Sus dos API, bytes y tiempo se suman una sola vez fuera de proof HTTP. Estos probes nuevos no sustituyen la captura anterior del navegador ni acreditan retransmisiones o API del iframe.
- `usdc-browser-traffic.json` para el transporte del navegador, con los campos siguientes.

Cuando exista `manifest.faucetRecovery`, el CLI también lee `usdc-wallet-provision-before-recovery.json` como bytes públicos. Comprueba SHA256 del snapshot, baseline completo e idéntico en `bindingHistory`, transición antigua/nueva, once intentos anteriores inalterados y sólo tres nuevos intentos al comprador exacto: reto, claim y lectura Horizon. Exige contadores acumulados 7/2/2/3/1, sin reset de bytes/tiempo y sin cambios de las cotas globales. El snapshot no se contabiliza como actividad nueva.

```json
{
  "planId": "ID del manifiesto",
  "sourceSha": "SHA completo",
  "status": "PASS_TRAFFIC_MEASURED",
  "complete": true,
  "automaticRetries": 0,
  "activeExecutionMs": 0,
  "requests": [
    {
      "kind": "api",
      "status": "CONFIRMED",
      "deploymentId": "dpl_...",
      "requestId": "ID del header de medición",
      "path": "/api/workspaces/...",
      "requestBytes": 0,
      "responseBytes": 0
    },
    {
      "kind": "html",
      "status": "CONFIRMED",
      "path": "/history",
      "requestBytes": 0,
      "responseBytes": 0
    }
  ]
}
```

Los valores de bytes y tiempo deben ser mediciones, no ceros puestos para completar campos. Los tipos permitidos son `api`, `html`, `static` y `redirect`; registrar cada intercambio real. Una solicitud API necesita el ID de su header y el despliegue exacto. No guardar URLs con query o fragmento, Magic Links, headers privados, cookies, tokens, cuerpos o textos de las entregas en este informe.

Las protecciones originales son `usdc-bazaar-protection-check.json` (probe) y `usdc-provider-protection-check.json` (initial). El CLI añade `usdc-provider-proof-protection-check.json` y los tres informes `usdc-bazaar-candidate-protection-check.json`, `usdc-bazaar-replacement-protection-check.json` y `usdc-bazaar-closed-protection-check.json`. El módulo acepta esos cuatro a través de `additionalProtectionReports[]`; cada uno requiere una API, SHA/ID/path exactos, intento confirmado y rechazo anónimo. Una copia literal de un recibo original no aumenta los contadores; una copia contradictoria se rechaza. Estas seis lecturas de protección se cuentan como API; los dos checks posteriores del alias y el verify de dominio conservan su contador proof HTTP separado.

## Criterio de conciliación

El conciliador deduplica observaciones idénticas por despliegue/ID y rechaza las contradictorias. Todo ID confirmado del driver debe existir en los logs con los mismos contadores. Los registros API restantes deben pertenecer al navegador y caber en sus reservas: 20 API privadas, 80 Redis y 400 comandos.

Los bytes de Redis/servicios externos ya incluidos en el driver no se vuelven a sumar. Los registros API restantes y SSR se suman aparte, junto con el transporte medido del navegador, provisión y pruebas. La persistencia utiliza el máximo de cada partición, conservando la cota agregada de los cuatro namespaces.

`PASS_COUNTERS` requiere cobertura de logs, transporte de navegador, todas las fases hospedadas, recibos de provisión/protección y ausencia de agotamiento o incertidumbre. Sin esas evidencias devuelve `PARTIAL_COUNTERS` o `INCOMPLETE_EVIDENCE` y señala los pendientes. Estos resultados describen contadores observados; no acreditan por sí solos la apertura del marketplace.

## Limitación de la superficie de navegador disponible

En esta sesión, la lectura DOM de CUA no expone `performance` ni una captura completa de intercambios de red. Los logs del servidor pueden acreditar API privadas, UUID y Redis/SSR, pero no el transporte de HTML, archivos estáticos ni redirecciones del navegador. Tampoco demuestran por sí solos que el navegador no haya repetido un transporte. No convertir una observación DOM, una reserva o un cálculo sobre archivos del build en un intercambio medido.

Mientras falte esa cobertura, omitir el informe de tráfico o conservar `complete:false` y los pendientes correspondientes. Los totales parciales son el coste observado; no prueban una cota completa de todo el navegador. Una cota conservadora documentada puede servir para una decisión limitada de cleanup si se demuestra su cobertura y margen, pero no se convierte en `PASS_COUNTERS` ni en una medición exacta.

Para sumar sólo tiempo funcional observado por DOM, usar `status:"PARTIAL_DOM_OBSERVATIONS"`, `complete:false`, `requests:[]`, `activeExecutionMs` medido, `automaticRetries:null`, `automaticRetriesConfigured:0` y `automaticRetriesScope:"configured-application-only"`. El valor nulo conserva desconocidos los reenvíos reales del navegador. La lista vacía no inventa intercambios ni bytes y no atribuye UUID del servidor a headers que no se leyeron. El resultado sigue incompleto aunque los controles funcionales pasen.

Los controles funcionales del navegador, su transporte y las condiciones de apertura mantienen dictámenes separados. `PASS_FUNCTIONAL_BROWSER` no acredita zoom real al 200 %, Freighter humano ni cobertura del transporte. El cleanup sintético puede tener una puerta propia con pruebas y presupuesto suficientes; esa puerta nunca habilita publicación, invitaciones o nuevas compras. Si no se puede demostrar el coste pendiente, la puerta de cleanup permanece cerrada.
