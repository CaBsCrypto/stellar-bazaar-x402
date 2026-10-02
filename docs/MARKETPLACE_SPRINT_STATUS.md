# Marketplace testnet — candidato implementado

Estado 2026-10-02: implementación local verificada; apertura pendiente. Producción
no se ha sustituido ni se han enviado invitaciones. No se afirma aceptación real
de Redis, dominio del vendedor, pago ni wallet a partir de dobles locales.

Preview protegida READY y HTTPS cerrado comprobado:
`https://stellar-bazaar-x402-9495o7673-cabscryptocontacto-6028s-projects.vercel.app`.
Despliegue `dpl_wASY6jpNsQ2zD5yCj7swvWYsz42U`, fuente
`a3f1d847b0d69f8e193225cb4887e0945219dbf6` (implementación `48d561b`).
Payload auditado: 265 archivos / 4.660.407 bytes, SHA256
`a51329cdc30f7dfe9ea2dc780217cb72461224b3e49c889867a109ec5c2dab55`.
GET /pilot 200, POST /api/workspaces 503, POST /api/market/orders 404, GET / 307
a /pilot; privacidad/no-store y protección conservadas. Cuatro comprobaciones
CLI exitosas más una lectura inicial cuyo comprobador local de header se corrigió;
dos lecturas sin credenciales para comprobar protección (la primera esperaba 401,
pero Vercel devuelve 302). La segunda confirmó redirección a vercel.com/sso-api,
sin seguirla ni guardar su query. Total siete comprobaciones HTTP de aplicación
por terminal y una navegación del navegador. Los recursos estáticos no se
contabilizaron individualmente: no afirmar una cuota HTTP total a partir de ello.
Cero solicitudes Redis reales y cero pagos en esta fase cerrada.

Un intento anterior fue BLOCKED antes de compilar por atribución Git. No se
modificaron permisos: el commit siguiente utilizó la identidad ya aceptada por
Vercel. Se conserva el recibo del bloqueo y no se presenta como respuesta perdida.

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
Evidencia móvil final: `evidence/sprint-marketplace/mobile-final-local.jpg`; 390 px,
ancho documental 375 px y cero campos sin etiqueta. La prueba confirmó eliminación
del fragmento de acceso y desaparición de la vista tras Bloquear espacio.

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

La preparación REAL está en `evidence/sprint-marketplace/real-preparation-manifest.json`.
Tiene prefixes nuevos, límites propuestos frente al recorrido medido y lista de
claves; `canExecute=false`: no constituye payloads exactos ni aceptación hospedada.
Pendiente confirmación de acceso por navegador para conectar la credencial de la
base Free a Preview, manteniendo las altas y pagos cerrados. La política de control
del navegador exige confirmación al ampliar acceso a un sistema sensible.

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
