# Marketplace testnet — candidato implementado

Estado 2026-10-02: implementación local verificada; apertura pendiente. Producción
no se ha sustituido ni se han enviado invitaciones. No se afirma aceptación real
de Redis, dominio del vendedor, pago ni wallet a partir de dobles locales.

## Implementado

- Servicios propiedad del espacio, HTTPS, prueba de control y cola existente de
  revisión/activación; Mis servicios y retirada. Catálogo persistente en namespace
  nuevo, sin archivo local de Vercel y sin sobreescribir fichas históricas.
- Operación congelada antes del pago, wallet Freighter del comprador, una sola
  transacción Stellar testnet al vendedor, sin comisión ni custodia. Candidato
  limitado a XLM nativo, hasta 1 XLM y texto hasta 2000 caracteres.
- Pago enviado, incierto y confirmado separados de ejecución, entrega o fallo.
  Conciliación explícita; ningún reenvío de transacción ni reejecución automática.
- Pedidos privados por comprador/vendedor, sin conversación privada completa;
  pago verificado separado del texto reportado por el agente.
- Cliente MCP vendedor externo, intento durable y conflicto de contenido.
- Pausa compartida persistente: cierra nuevas altas/publicaciones/compras/pagos,
  conserva recuperación, historial, conciliación y operaciones ya comprometidas.
- Origen HTTPS exacto por artefacto, admisión por invitación, cuotas compartidas,
  máximo histórico cinco espacios, revisión privada y protección de Preview.

## Verificado localmente

Build Webpack y TypeScript PASS. Pruebas marketplace, admisión y cuota concurrente
PASS. Servidor real Next construido y cliente MCP externo por HTTP: 27 solicitudes
app, 115 intercambios Redis simulados, 371 comandos contabilizados en el doble y
3 solicitudes Horizon simuladas. Recuperación exacta tras sustituir procesos y
pausa de compras/altas con recuperación del espacio original PASS.

En navegador local, móvil 390 px, texto de entrega, formulario, foco visible por
teclado y bloqueo que elimina la vista privada comprobados. Se corrigió etiqueta
del selector de idioma y enlaces a demos/rutas cerradas del pie. La ampliación
200 % sigue pendiente: el atajo de zoom en IAB no acreditó cambio de tamaño.
Evidencia móvil inicial: `evidence/sprint-marketplace/mobile-local.jpg`.

Las fichas públicas de Guionista de Video IA y Website Intelligence siguen
respondiendo HTTP 200. No son agentes nuevos que haya que crear desde cero.
Su adaptación está descrita en `MARKETPLACE_EXISTING_PROVIDER_ADAPTER.md`.
Conservar exactamente su contrato USDC/JSON requiere trabajo adicional de
liquidación/entrega; el candidato XLM/texto no se etiqueta como compatible.

## Condiciones que faltan para abrir

1. Configurar secretos privados nuevos para la base Free existente en Preview,
   origen exacto, namespaces nuevos y cinco hashes de admisión (dos sintéticos,
   tres participantes). Nunca reutilizar hashes/credenciales de los dobles.
2. Manifiesto REAL definitivo: claves/payloads, valores y márgenes medidos,
   contadores de app/MCP/navegador/Redis/Horizon; parar ante incertidumbre/límite.
3. Demostrar control del endpoint real reutilizado y conectar su agente vendedor
   externo. Revisión manual y activación de su ficha nueva de texto testnet.
4. Aceptación hospedada con firma de wallet, destinatario y activo reales testnet,
   fallo de entrega, reenvíos/conflictos y aislamiento de tercero.
5. Sustituir despliegue conservando Redis real; verificar Magic Link, bloqueo,
   rotación/revocación y recuperación exacta; comprobar pausa hospedada.
6. Teclado, móvil y texto al 200 % sobre candidato hospedado; guía de soporte y
   conservación de datos acordada antes de participantes reales.
7. Registrar SHA, despliegue/configuración y resultados. Sólo entonces publicar
   en bazaar.browns.studio. No contratar servicios ni contactar desarrolladores.

## Configuración del nuevo candidato

Runtime: `BAZAAR_ENABLE_MARKETPLACE`, `BAZAAR_ENABLE_MARKET_PURCHASES`,
`BAZAAR_ENABLE_OPEN_WORKSPACES`; frontend compilado con
`NEXT_PUBLIC_BAZAAR_MARKETPLACE=true`. Preview cerrada conserva tres flags runtime
en false para efectos. Para habilitar el recorrido privado, marketplace y
workspaces deben ser true; purchases sólo tras preflight aprobado.

`BAZAAR_WORKSPACE_BACKEND=redis`, `BAZAAR_PROVIDER_REVIEW_BACKEND=redis`.
Prefijos: `bazaar-workspace:pilot-<32hex>`, `bazaar-market:pilot-<32hex>`,
`bazaar-review:pilot-<32hex>` y catálogo `BAZAAR_MARKET_PREFIX + :catalog`.
Credencial dedicada por nombre de variable, compartida en permisos de la base:
`BAZAAR_WORKSPACE_REDIS_REST_URL/TOKEN` y `BAZAAR_REVIEW_REDIS_REST_URL/TOKEN`.
No cambiar los alias de integración anteriores ni sus namespaces.

Operador: hash SHA256 en `BAZAAR_MARKET_OPERATOR_HASH`, secreto HMAC en
`BAZAAR_MARKET_REVIEW_SECRET`; nunca NEXT_PUBLIC ni Git. Preview usa origen
`vercel-preview`, que sólo resuelve VERCEL_URL oficial del proyecto en Preview.
Producción exige origen literal `https://bazaar.browns.studio`.

Operador pausa: POST `/api/market/control` con `{"action":"pause"}` y bearer
privado. Leer la respuesta y verificar nuevas altas/compras rechazadas y la misma
entrega legible antes de declarar reversión. Respuesta perdida exige consulta de
estado y comprobación; no borrar registros. Variables del último despliegue por
sí solas no cierran instancias antiguas.
