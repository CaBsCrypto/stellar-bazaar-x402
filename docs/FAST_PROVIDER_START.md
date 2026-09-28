# Preparar un servicio para Bazaar

Esta guía prepara un borrador y su revisión. No publica automáticamente, no ejecuta pagos y no garantiza ingresos, tiempos de liquidación, seguridad ni disponibilidad. El recorrido descrito es para Stellar Testnet; no demuestra soporte Mainnet.

## 1. Define lo que entregarás

En `/publish`, describe nombre, propósito, destinatarios y resultado. El precio puede quedar por definir. Copiar las instrucciones lleva ese borrador a tu agente; no envía una solicitud de revisión ni crea una ServiceCard válida.

- Si solo tienes una idea, concreta entradas, formato de entrega, límites y una muestra identificada como ilustrativa antes de implementar.
- Si ya tienes una API, reutilízala y comprueba que produce el resultado declarado. No hace falta reemplazarla por una plantilla.
- Confirma con el proveedor el precio, activo, red, destinatario público y condiciones. No uses una dirección de ejemplo como destinatario real.

## 2. Prepara y valida la integración

El agente puede consultar las herramientas MCP disponibles y validar una ficha; el MCP no completa por sí solo el alta. Las herramientas del navegador WebMCP son una superficie distinta. Consulta la [guía para agentes](../public/llms.txt) y la documentación del repositorio correspondiente a la versión que revisas.

El desplegable **Ya tengo una integración técnica** de `/publish` permite preparar y copiar un manifest. Revisa que sus valores correspondan a tu servicio; los valores iniciales son ayudas, no condiciones aprobadas.

Desde este repositorio, con sus dependencias instaladas y Node.js 22.18 o posterior, puedes validar el archivo que hayas preparado:

```sh
npm run bazaar-cli -- validate ruta/a/mi-service-card.json
```

Este comando comprueba conformidad local. No publica, prueba el control del dominio ni verifica una transferencia. La conformidad tampoco garantiza seguridad SSRF de tu implementación, interoperabilidad con cualquier cliente ni cumplimiento de la entrega.

Para un proveedor x402, preparar el desafío 402 es solo una parte: antes de habilitar cobros se deben comprobar las condiciones completas, la autorización, el facilitador, la conservación del resultado y la recuperación sin repetir un pago incierto. No basta copiar un ejemplo que llama a `verify` y `settle`. Este recorrido de preparación no habilita pagos ni pide claves privadas.

## 3. Solicita revisión cuando esté habilitada

**Solicitar revisión manual** en el formulario técnico envía una propuesta a `/api/provider-self-listing`. La recepción está deshabilitada salvo configuración explícita del operador. Si devuelve `INTAKE_DISABLED`, conserva el borrador y coordina el siguiente paso con el operador; no intentes otro endpoint para saltar ese límite.

Una respuesta `202` significa **borrador en cola, no publicado**. Se requiere comprobar control del mismo hostname mediante DNS TXT o HTTP `.well-known` y revisión humana. La cola actual es temporal; conserva tu manifest y el identificador recibido. Que se emita un challenge no demuestra que ya se haya verificado.

El recorrido interno distingue:

`awaiting-control-proof → pending-manual-review → approved-for-staging → staged-not-public`

Una prueba de control fallida o una revisión rechazada detiene el recorrido. Incluso `staged-not-public` sigue sin activar la ficha en el catálogo.

## Registro público y límites

El registro público es un paso administrativo separado. `/api/publisher/ingest` no es un método de autopublicación para proveedores: requiere habilitación, almacenamiento configurado y una credencial del operador. No solicites ese secreto ni lo incluyas en el navegador, una ficha o un prompt. No hay herramientas MCP de escritura del registro.

Cuando el operador incorpora metadatos aceptados al registro público, discovery puede exponerlos. Eso no certifica reputación, seguridad, disponibilidad ni una compra realizada. Consulta [Provider onboarding](PROVIDER_ONBOARDING.md) para las condiciones y errores del registro.

No incluyas semillas, claves privadas, credenciales del facilitador, firmas de pago ni datos de clientes en el manifest. Las pruebas de preparación pueden usar dobles; cualquier compra Testnet debe revisarse y autorizarse aparte.
