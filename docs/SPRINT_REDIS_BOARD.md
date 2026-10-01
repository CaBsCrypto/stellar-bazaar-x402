# Tablero único — validación compartida de Bazaar

Fecha: 2026-10-01. Base preservada: `61bcb685f6e359e8f756c5226399d3a6bc8202fa`;
código anterior: `c92e084430065ae76a152a39570e3ab1727b521d`.
Código integrado: `6c60391d271a57b04ec8621470237c9ca2f522e2`;
build `WxPu0FGeFg7y3k_ufOvHy`, Node 22.18.0.
Coordinación del nuevo sprint: agente principal con tres especialistas activos,
archivos de implementación y revisión separados en `mission-consolidation`.
La revisión nativa usa verificadores propios y no se presenta como reproducción
en otro checkout. No publicar, push, merge ni despliegue.

| Trabajo | Responsable / checkout | Estado | Dependencia / aceptación |
|---|---|---|---|
| Ejecutor Redis, claves y presupuesto congelados | Identidad / `sprint-redis` | Integrado y aprobado con dobles | Allowlist, presupuesto, CAS e incertidumbre; autorización antes de efectos reales |
| Paquete externo sintético y guía | MCP/producto / `sprint-product` | Aprobado en el candidato integrado | Una respuesta definitiva, permisos separados, reenvío del registro conservado; 85 intentos HTTP |
| Reproducción independiente | Revisión / `sprint-review` | Aprobada localmente en SHA final | Next construido/SDK reales con file aislado y Redis REST con dobles; dos propietarios, procesos/reinicio, scopes y tombstones |
| Navegador y texto 200 % | Coordinador + producto | Aprobado; ocho capturas revisadas | Navbar/filtros dentro de viewport; computed text x2; teclado, bloqueo/reentrada y respuesta tardía; file aislado |
| Redis real aislado | Identidad + revisión | **Pendiente de autorización del plan final** | Base dedicada existente, Free $0 y margen actual comprobados; credencial guardada con ACL exclusiva fuera del repo |
| Next nativo con Redis real | Identidad + revisión | **Preparación nativa en curso** | Store de producción y propietarios congelados revisados con dobles; build y recorrido nativo completo antes de autorizar Redis |
| Magic Link en navegador con Redis real | Coordinador + revisión | **Verificador preparado** | Chromium preflight pasó sin HTTP; assets grandes por rangos nativos <=64KiB con hash exacto; recorrido completo aún pendiente |
| Manifiesto y reversión | Coordinador + revisión | Preparados y revisados | SHA exacto, configuración sin secretos, comandos/conteos, resultado y pendientes; sin publicación |

La preparación no equivale a una aceptación. La instancia, credencial y margen
gratuito actual ya se comprobaron: `bazaar-validacion-20261001`, AWS `us-east-1`,
origen `https://smooth-dory-323957.upstash.io`, Free Tier, 0/500.000 comandos,
0 B/10 GB de tráfico y 0 B/256 MB almacenados, eviction desactivado y sin regiones
de lectura adicionales. No se emitieron comandos Redis externos.
Condición de desbloqueo: candidato final y build revisados, plan nuevo congelado
y autorización explícita de ese plan
(prefijo, cinco claves exactas, máximos de requests/comandos/datos y cero retries).
La instancia compartida no se modifica para inducir fallos. No se crea una instancia
ni se cambia un plan por iniciativa de esta sesión.

Hallazgos: guía pedía dos respuestas diferentes para la misma tarea; transporte MCP
dejaba reconexión automática; texto 200 % expuso enlaces de navbar y filtros de
biblioteca fuera del área visible. Las correcciones se integraron tras revisión.

Categorías del expediente: local con dobles, HTTP/MCP con file aislado, navegador
Chromium real con datos sintéticos, Redis real pendiente. Un dispositivo físico y
respaldo/durabilidad de Redis no se certifican.
