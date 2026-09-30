# Prueba acotada de Redis: aprobada para el almacén de revisión

Fecha: 2026-09-29. Base cafee46 más ejecutor y guardas de este bloque. Node 24.14.0, Windows. Instancia autorizada: x402-bazaar. Ejecución d3ac6b75-dfae-455b-9400-1c8c112440ec.

## Evidencia externa

Solo se utilizó `bazaar-review:local-test:state`. Se confirmó ausencia antes de escribir y se conservó una única solicitud sintética, sin activar el catálogo. No se consultaron claves históricas ni se borraron registros.

- Solicitud creada mediante implementación nativa y almacén Redis real.
- CAS obsoleto rechazado mediante operaciones intercaladas en un mismo proceso; no equivale a concurrencia de procesos externos.
- Escritura real confirmada por Redis cuya respuesta se descartó deliberadamente en el adaptador: recuperación del mismo registro sin repetir escritura. La pérdida de respuesta fue simulada, no una caída real del servicio.
- Recuperación desde otra invocación/proceso aprobada mediante GET y TTL exclusivamente.
- TTL de la clave: -1, sin caducidad.
- Total acumulado reservado: **14 solicitudes REST, 22 comandos conservadores y 19.475 bytes de cuerpos de solicitud**. Incluye el primer GET sin respuesta confirmada. Límites: 200 solicitudes/comandos y 100 KiB. El contador incluye EVAL y sus GET/SET internos; no es una factura de Upstash.
- Pagos y activaciones externas: cero. El registro sintético se conserva para revisión.

## Ejecutor y revisión

`scripts/validate-provider-review-redis.mjs`: prepare, run, resume-preflight y check. Diario privado fuera del repositorio, con identificadores y credencial sintética antes de efectos; persistencia atómica de contadores antes de cada solicitud. Solo acepta host, clave y script CAS exactos. Estado ajeno, clave ocupada, presupuesto excedido o resultado incierto detienen ejecución. Check no admite EVAL.

Revisión independiente de redis_probe_review aprobada antes de ejecución; guardas reproducidas sin red. La primera conexión limitada falló antes de escribir. El usuario autorizó específicamente la ACL del diario; se concedió FullControl solo al operador mediante icacls y se retiró la concesión del usuario sandbox. No se cambiaron permisos de credenciales Redis o datos históricos. El ejecutor verifica ACL antes de acceder. No se eludieron rechazos de revisión automática.

```text
node scripts/test-provider-review-redis-guard.mjs
node scripts/test-provider-review-redis.mjs
node scripts/validate-provider-review-redis.mjs prepare <directorio-privado-nuevo>
node scripts/validate-provider-review-redis.mjs run <directorio-privado> <archivo-env-privado>
node scripts/validate-provider-review-redis.mjs check <mismo-directorio> <archivo-env-privado>
```

Esta ejecución usó resume-preflight tras el primer GET sin confirmar. Ese modo admite solo ese diario exacto sin escrituras y conserva contadores; no sirve para repetir una ejecución iniciada. **No repetir run con otro diario contra la clave conservada**: detenerse ante ocupación, sin borrar o sobrescribir.

## Alcance pendiente

No valida sesiones administrativas, correo, límites Lua ni activación contra almacenamiento externo; esas pruebas siguen siendo locales con dobles. No demuestra durabilidad ante pérdida/restauración de Redis ni aislamiento físico. Sin push, merge, despliegue o contratación. El siguiente bloque es revisar la configuración concreta del entorno antes de publicar.
