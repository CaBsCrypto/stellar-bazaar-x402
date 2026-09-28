# Cierre de identidad y contingencia: preparación local

Fecha: 2026-09-28. Base `9d760f22ea1545dd76d8324123f7a8ccefac2a6c` sobre PR #61. Sin cambios de APIs, Redis, Vercel, cuentas existentes ni despliegues.

## Identidad que se propone aplicar

Preparar una nueva pareja de accesos para el propietario principal del piloto histórico, conservando exactamente su identificador. Antes de generarla, comprobar la asociación administrativa original, coincidencia con el propietario del diario y hashes/permisos de ambas credenciales originales. No inferir propiedad de un identificador de cliente.

La propuesta contendrá únicamente `ownerId`, `readTokenHash` y `writeTokenHash` en `BAZAAR_HISTORY_ACCOUNTS_JSON`. Los tokens nuevos se entregarán privadamente: lectura al humano; lectura/escritura al agente. Excluir cuentas negativas y sintéticas. No modificar archivos históricos ni copiar respuestas de compras. Aplicar la propuesta invalidará los accesos anteriores de esa pareja, por lo que distribución y aplicación deben coordinarse; generar el paquete no los revoca.

Estado del paquete privado: **preparado offline, no aplicado**. Tras el rechazo inicial de la revisión automática, el operador autorizó explícitamente leer los archivos privados del piloto histórico y preparar nuevos accesos para su mismo propietario. Se comprobó la coincidencia de propietario entre acceso y diario, los hashes y permisos originales; se generó una pareja nueva conservando el propietario. Los archivos históricos permanecen intactos.

El paquete reside en `review-release/identity-update-private`, fuera del repositorio, con ACL exclusiva del operador: `credentials.json` contiene los accesos privados, `account.json` y `proposed-accounts.json` contienen únicamente propietario/hashes, y `proposal-audit.json` conserva comprobaciones sin respuestas de compras. No se incorporan esos archivos al commit ni se publican enlaces con tokens.

Una segunda ejecución local comprobó ACL, integridad del archivo de configuración, una única cuenta, correspondencia de hashes y permisos de ambos roles, rechazo de escritura con lectura y rechazo de credencial desconocida. Las credenciales anteriores se rechazan bajo la propuesta, pero **siguen sin rotarse en el servidor**: ninguna configuración remota fue modificada. Cero consultas Redis y cero pagos. Esta verificación no es una segunda prueba remota ni certifica la seguridad de otras credenciales históricas.

Antes de una futura aplicación, consultar otra vez el registro de cuentas del destino. Si existen otras cuentas legítimas, conservarlas y reemplazar solo la entrada correspondiente al propietario verificado. No sobrescribir el registro completo con una propuesta de una sola cuenta. Sin prueba de asociación, detener la preparación de esa cuenta.

## Contingencia elegida: cerrar acceso sin borrar datos

La base segura de código es el candidato con autenticación estricta y controles operativos, presente desde `be9d1db` y conservado en `9d760f2`. No usar `76ba7b1` como reversión: restaura la aceptación de credenciales por prefijo.

Ante un problema de acceso después de una publicación futura, mantener esa base segura y los flags de pagos/publicación deshabilitados. Omitir `BAZAAR_HISTORY_ACCOUNTS_JSON` en el candidato de contingencia: los handlers responden 401 antes de acceder a almacenamiento. No sustituir por `[]` o cadena vacía, que son configuraciones inválidas (503).

La indisponibilidad temporal de biblioteca es deliberada. Catálogo y demostración pueden seguir visibles, pero no debe anunciarse recuperación privada mientras esté cerrada. No borrar entregas, propietarios, índices ni marcadores de pago; no restaurar respaldos Redis para revertir código.

En Vercel, una edición de variables no cambia los despliegues ya creados. El procedimiento de publicación separado deberá preparar y verificar el despliegue de contingencia, sus aliases/protección y todas las instancias o URLs aún accesibles antes de considerarlo efectivo. Hoy no existe evidencia de esa propagación ni se ha creado tal despliegue.

Para reabrir, usar la configuración legítima verificada sobre el mismo código seguro, comprobar A/otro propietario/lectura sin escritura y recuperar la misma entrega. Si el fallo está en el código, corregir sobre esa base o preparar otro candidato con las mismas protecciones; cerrar la biblioteca no arregla cualquier regresión ni reemplaza esa revisión.

## Validación y límites de cierre

```text
node scripts/test-identity-maintenance.mjs
```

Prueba aprobada en Node 22.18 y 24.14, con revisión independiente de identity_provision: configuración normal → variable ausente → configuración restaurada. Usa autenticación y handlers reales, almacenes sintéticos de solo lectura y red prohibida. Durante el cierre comprueba 401 para lecturas/escrituras de ambas cuentas y credenciales desconocidas, cero accesos a almacén y cero escrituras; al reabrir devuelve la misma entrega y mantiene aislamiento.

No prueba de nuevo Redis, esquemas de registro ni propagación remota. Complementa las 141 solicitudes Redis del ejercicio anterior; no consume presupuesto externo nuevo.

**Preparación local cerrada:** paquete privado verificado y contingencia local aprobada. Publicar sigue requiriendo elegir entorno, autorizar cambios concretos, verificar configuración efectiva y ensayar allí la contingencia. Antes de aplicar, distribuir privadamente los accesos nuevos y comprobar que no se sobrescriben otras cuentas legítimas. No se autoriza push, merge, compras ni despliegues con este documento.
