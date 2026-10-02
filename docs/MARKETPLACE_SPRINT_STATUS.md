# Marketplace testnet — candidato implementado

Estado 2026-10-02: recorrido de espacios y MCP hospedado con Redis real PASS;
apertura del marketplace pendiente. Producción no se ha sustituido ni se han
enviado invitaciones. No hay todavía una venta hospedada ni pago testnet real.

Preview actual protegida: `dpl_6jZfgXCqt28X1jwyiw4JKUcX75qQ`, fuente comprobada
en metadatos Vercel `61dfbe17a41ea059f991adac18de59429124302f`.
URL: https://stellar-bazaar-x402-cnauhic63-cabscryptocontacto-6028s-projects.vercel.app.
BUILD_ID de la compilación local de ese código: `4T7ze_3W-wu7HzcnRX9TR`;
no se presenta como BUILD_ID remoto. Node 22.18.0 / Next 16.3.1.

Dos propietarios creados; reenvíos idénticos sin duplicación, conflictos de
contenido, aislamiento B/tercero, cliente SDK MCP externo por HTTPS, conversación
y entrega exactas tras sustituir el despliegue PASS. Magic Link elimina fragmento;
acceso humano y agente rotados invalidan los anteriores; recuperación del acceso
rotado y bloqueo que retira toda la vista privada PASS en navegador real.
La entrega se distingue como reportada por agente, sin pago ni verificación
independiente. Prueba móvil 390×844 y foco visible PASS; texto real al 200 % sigue
pendiente. Evidencia: `evidence/sprint-marketplace/hosted-redis-delivery-mobile.jpg`.

Pausa de creación en la Preview actual PASS: alta nueva 503, replay idéntico
conserva propietario, conversación/historial exactos siguen accesibles. Marketplace,
compras y activación siguen deshabilitados. Esto no certifica aún el control de
pausa compartido del marketplace en todas las instancias. Revocación completa
pospuesta hasta terminar la venta: ambos participantes siguen activos y no se
consumen espacios adicionales para reemplazarlos.

Contadores de cuatro despliegues conciliados con todos los IDs del ejecutor:
53 solicitudes API (41 ejecutor + 12 navegador), 186 intercambios Redis,
888 comandos como cota superior, 427.433/510.898 bytes JSON enviados/recibidos;
5.379 bytes almacenados como cota superior y cero resultados inciertos/reintentos,
pagos o solicitudes al facilitador. El tráfico HTML, recursos estáticos y
redirecciones de la plataforma no se midió por completo; no afirmar conteo HTTP
total. Límites del manifiesto se conservan y los namespaces históricos no se usan.
Evidencia: `hosted-workspace-http.json` y `hosted-server-meter.json`.

Se corrigió el transporte del navegador a APIs del mismo origen para conservar
la cookie SSO de Vercel; cada API privada sigue exigiendo su bearer. La protección
de Preview no se desactivó. Las lecturas de detalles de actividad son secuenciales
para evitar conflictos de cuota; no hay polling ni reintentos automáticos.

Guionista existente localizado en el mismo equipo: proyecto `ai-video-scriptwriter`,
despliegue `dpl_8Pv5kWHWzkYVCiV7ouBUM9NQsWVC`. Inventario y fuente principal
confirman HTTP x402 (`/api/script`, `/v1/script`) y ficha pública; no incluyen
MCP ni well-known de control. Fuentes recuperadas: 17 archivos, 18 lecturas API,
268.630 bytes, cero archivos de entorno y cero cambios remotos. Recuperación local
en `../provider-guionista-recovered`, con hashes por archivo en
`provider-source-recovery.json`. Su generador algorítmico existente permite ofrecer
un producto nuevo de texto sin modelos remotos. Adaptación local probada con tres
entradas: 490/677/440 caracteres; igualdad al repetir entrada y rechazo de límites
inválidos. Cero llamadas de red/modelo/pago. No se ha desplegado la adaptación ni
alterado las rutas USDC/JSON existentes. Fuente preservada en
`evidence/sprint-marketplace/provider-text-adapter.ts.txt` y prueba reproducible
`node scripts/test-recovered-provider-text.mjs` después de recuperar fuentes.

Los registros de fases cerradas anteriores se conservan abajo como antecedentes.

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

1. Secretos Preview, origen HTTPS y namespaces nuevos configurados y comprobados
   con dos admisiones sintéticas. Añadir las tres admisiones reales antes de abrir;
   nunca reutilizar hashes/credenciales de los dobles.
2. Manifiesto REAL definitivo: claves/payloads, valores y márgenes medidos,
   contadores de app/MCP/navegador/Redis/Horizon; parar ante incertidumbre/límite.
3. Demostrar control del endpoint real reutilizado y conectar su agente vendedor
   externo. Revisión manual y activación de su ficha nueva de texto testnet.
4. Aceptación hospedada con firma de wallet, destinatario y activo reales testnet,
   fallo de entrega, reenvíos/conflictos y aislamiento de tercero.
5. Espacios: sustitución, Magic Link, bloqueo, rotación y pausa PASS con Redis real.
   Completar recuperación de las compras/ventas, revocación íntegra y control de
   pausa compartido después del recorrido pagado.
6. Teclado, móvil y texto al 200 % sobre candidato hospedado; guía de soporte y
   conservación de datos acordada antes de participantes reales.
7. Registrar SHA, despliegue/configuración y resultados. Sólo entonces publicar
   en bazaar.browns.studio. No contratar servicios ni contactar desarrolladores.

La preparación REAL está en `evidence/sprint-marketplace/real-preparation-manifest.json`.
Tiene prefixes nuevos, límites propuestos frente al recorrido medido y lista de
claves; `canExecute=false`: no constituye payloads exactos ni aceptación hospedada.
La conexión de Redis Free a Preview ya está autorizada y completada. El manifiesto
de espacios separado sí se ejecutó con medición real; el manifiesto de venta
todavía requiere payloads, prueba del vendedor y límites de liquidación definitivos.

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

## Configuración de Preview — 2026-10-02

Autorización recibida para las credenciales de Redis Free en Preview. Se guardaron como Secret las cuatro variables BAZAAR_WORKSPACE_REDIS_REST_{URL,TOKEN} y BAZAAR_REVIEW_REDIS_REST_{URL,TOKEN}. No se cambiaron las variables de producción.

Nuevo candidato cerrado: dpl_3FXPifvMdxBcAvjuL4SFH48XiWYF, fuente 0a3c1f9, https://stellar-bazaar-x402-bhwkphap5-cabscryptocontacto-6028s-projects.vercel.app. Hereda los secretos únicamente en runtime; build recibe valores vacíos. Namespaces pilot-be8432d7255e0a3b0dca564d8aa769a0. Altas, marketplace, compras, intake y activación siguen deshabilitados. Configuración no demuestra aún persistencia real.

La revisión automática rechazó almacenar el token completo de Redis en un archivo temporal de texto. No se creó esa copia ni se reintentó por otro mecanismo. El camino de validación usa los secretos de Vercel sin copiar el token a archivos locales.

El manifiesto real sigue canExecute=false: faltan payloads exactos, contadores hospedados y prueba de control/conexión del agente vendedor. No se ejecutaron solicitudes Redis, pagos ni invitaciones en esta fase.
`nResultado: Preview Ready; cuatro comprobaciones HTTP PASS y navegación /pilot correcta. Sin verificación de persistencia real todavía.
