# Identidad privada: aprovisionamiento autorizado

Solo un operador con acceso administrativo a la configuración del servidor puede registrar cuentas. No existe un endpoint público de aprovisionamiento. Conocer un ownerId no otorga permisos.

Runtime: Node.js 22.18 o posterior (incluido Node 24), con soporte nativo de eliminación de tipos para los imports locales `.ts`. CI usa Node 22. `npm run test:agent-chat` comprueba tanto el acceso HTTP como el aprovisionamiento offline, sin transferencias ni almacenamiento externo.

El operador ejecuta `node scripts/provision-history-account.mjs --out <directorio-privado-nuevo>` desde un equipo confiable. El comando crea un propietario aleatorio y guarda un archivo con las credenciales y una propuesta de hashes. No imprime secretos ni modifica variables del despliegue. El directorio se crea sin sobrescribir rutas existentes, con permisos de usuario (0700/0600 en POSIX; ACL exclusiva del usuario actual en Windows).

Registrar manualmente la entrada de `account.json` en BAZAAR_HISTORY_ACCOUNTS_JSON, preservando todas las entradas existentes. Revisar el propietario antes de guardar y distribuir cada credencial por un canal privado: escritura al agente y lectura al humano. No subir archivos a Git ni pegar secretos en logs. El directorio debe estar fuera del repositorio.

Ambos hashes registrados apuntan al mismo propietario. Las cuentas explícitas y sus enlaces siguen válidos. Las credenciales antiguas aceptadas únicamente por su prefijo se rechazan: no hay evidencia que permita relacionarlas de forma segura. Conservar registros históricos; una eventual recuperación requiere verificar su procedencia antes de registrar cualquier asociación, nunca deducirla de un ownerId enviado por el cliente.

El chat público es una demostración, no un agente autónomo. No genera tokens ni afirma compras, almacenamiento o entregas reales. Retira el almacenamiento local de su sesión ficticia anterior. El enlace público abre la demostración; los enlaces privados proceden del agente correctamente configurado.

La prueba test-agent-chat-flow usa handlers HTTP reales con cuentas efímeras y un doble de Redis en memoria. No demuestra persistencia externa ni transferencias.

## Piloto controlado, bloqueo y revocación

El Magic Link de biblioteca es un acceso por posesión reutilizable, sin caducidad automática. Usar `/history#token=…`: el navegador captura el token y retira el fragmento; no compartir el enlace públicamente. No es el enlace administrativo de un solo uso. Lectura permite consultar; escritura permite registrar y consultar. Ninguna de estas credenciales firma transacciones, autoriza pagos ni concede administración.

Bloquear elimina el acceso en memoria del navegador y sus borradores; no revoca enlaces conservados. Para revocar, el operador retira la entrada exacta de `BAZAAR_HISTORY_ACCOUNTS_JSON`, preservando las demás y todos los registros de entregas. Si no quedan cuentas, retirar la variable: una lista vacía se considera configuración inválida. Una credencial desconocida nunca recupera un propietario por inferencia.

## Rotación offline

Conservar una copia administrativa verificable de `account.json` y las credenciales correspondientes fuera del repositorio. La procedencia de esa copia la comprueba el operador: la consistencia criptográfica del archivo no demuestra por sí sola autorización administrativa. El comando no lee ni cambia configuración remota.

```sh
node scripts/rotate-history-account.mjs --account <cuenta-administrativa-verificada.json> --credentials <credenciales-privadas.json> --role read --out <directorio-privado-nuevo>
```

`--role write` renueva escritura; `--role both` renueva ambos accesos. Se requieren ambas credenciales originales consistentes con la entrada administrativa, incluso al renovar un solo rol. Se conserva el propietario y la credencial del rol no renovado. Si falta evidencia, se rechaza sin generar una propuesta; conocer el ownerId no sirve para recuperación. Se rechazan directorios existentes o internos al repositorio. La ACL resultante se verifica antes de escribir secretos; un fallo detiene la operación.

Revisar la propuesta y sustituir solamente la entrada correspondiente en el proceso local de pruebas. Reiniciar ese proceso con los hashes nuevos, sin imprimir tokens. Entregar el nuevo acceso por canal privado. La revocación no queda completa en un entorno de varias instancias hasta que todas usan la configuración nueva; esta fase no aplica cambios publicados.

Restauración después de revocar: verificar primero la copia administrativa y su procedencia; generar con `--role both`, registrar la misma identidad con hashes nuevos y recuperar las entregas existentes. Nunca reinstalar los hashes revocados ni borrar entregas para restablecer el acceso. Sin copia verificable y credenciales consistentes, este procedimiento no ofrece recuperación automática.

Validación reproducible: `node scripts/test-history-rotation.mjs` usa cuentas sintéticas, procesos separados y directorios temporales privados, sin red ni configuración histórica. Comprueba permisos, rotación por rol, rechazo de credenciales anteriores, asociación alterada y sobrescritura. Los directorios sintéticos se conservan para inspección; no contienen acceso a servicios reales. La configuración de una futura Preview incluirá solo hashes de cuentas sintéticas independientes, nunca cuentas históricas; todavía no se aplica.
