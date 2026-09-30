# Revisión de infraestructura para alta controlada

Fecha de consulta: 2026-09-29 (America/Santiago). Candidato local: `cafee4693953e6560cdff40e2589266f763de107`. Solo lectura de paneles; sin consultas a datos Redis, escrituras, cambios de variables, contratación ni despliegue.

## Observado en Upstash

Instancia `x402-bazaar`, ID `642bb693-0d9f-4806-9ee6-7fdf6b23f48e`, cuenta Personal, AWS us-east-1, Global.

- Free Tier; coste mostrado $0.00.
- Comandos: aproximadamente 13 mil de 500 mil al mes (contador redondeado del panel).
- Almacenamiento: 118 KB de 256 MB. Ancho de banda: 0 B de 10 GB según panel.
- TLS habilitado; eviction desactivado.
- Backups: lista vacía; Daily Backup deshabilitado en el panel.

Existe margen observado para preparar una prueba pequeña, no una garantía futura de cuota. No se activaron respaldos, upgrades ni credenciales. La capacidad no demuestra durabilidad o restauración. No se leyó el contenido de claves históricas.

## Observado en Vercel

Proyecto `stellar-bazaar-x402`, equipo Pro existente. Producción Ready, dominio `bazaar.browns.studio`, origen `main` commit `76ba7b19eacb424d8c9e872a2d01569e1eb45b3d` (25 de septiembre). No es el candidato local.

La lista Project muestra estas variables en Production y Preview (solo nombres y entornos, valores no revelados):

- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `BAZAAR_PROVIDER_SECRET`
- `STELLAR_X402_FACILITATOR_API_KEY`, `STELLAR_X402_FACILITATOR_URL`
- `X402_SELLER_ADDRESS`

Shared: «No shared variables linked». No aparecen en la lista las nuevas variables de revisión, sesión administrativa, allowlist/correo u origen. Su presencia y valores efectivos en un futuro despliegue deben comprobarse, no inferirse de este listado. No se comprobó qué valores usa exactamente el despliegue histórico ya creado.

El resumen del equipo indica $8.89 de $20 de crédito incluido usado y $0 de cargos bajo demanda. Es cuota compartida con otros proyectos; no equivale a reservar capacidad para Bazaar ni autoriza gasto adicional.

## Decisión y siguiente ejecución propuesta

**No desplegar todavía.** El código está validado localmente; faltan configuración y evidencia externa específica de este almacén.

1. Preparar un ejecutor acotado para Redis real: prefijo `bazaar-review:local-test`, claves vacías verificadas previamente, datos sintéticos, máximo propuesto 200 solicitudes REST y 100 KB. Contabilizar también los comandos dentro de Lua; el presupuesto REST no equivale por sí solo a comandos facturados. Sin escanear claves históricas, sin activación del catálogo real, sin reintentos automáticos.
2. Presentar el ejecutor y sus claves/comandos antes de autorizar escrituras. El uso histórico de esta instancia no autoriza este nuevo ejercicio. Si hay claves previas bajo el prefijo, detenerse; no sobrescribir ni borrar.
3. Validar Lua/CAS, sesiones, límites y recuperación entre procesos. Registro público y prueba DNS seguirán simulados. Ante fallo, conservar el mismo identificador y marcador.
4. Preparar manifiesto de Preview: origen, SHA, Redis de revisión y destino del catálogo, OTP, correo/allowlist y cuotas. Evitar heredar credenciales operativas del facilitador; todos los flags de pago deshabilitados. El prefijo aísla lógicamente, no físicamente, y no aísla automáticamente el registro público.
5. Revisión y autorización separadas antes de configurar o desplegar. Comprobar protección, límites de plataforma, pausa de builds y reversión en esa revisión; no se han revalidado aquí.

No es necesario contratar otro plan para avanzar con preparación local. El permiso pendiente inmediato corresponde a una prueba externa acotada y concreta, no a publicar ni habilitar pagos.

Fuentes administrativas consultadas: panel Details/Settings/Backups de la instancia en console.upstash.com; Overview y Environment Variables (Project/Shared) del proyecto en vercel.com. No se guardan tokens, valores secretos ni capturas de conexiones.
