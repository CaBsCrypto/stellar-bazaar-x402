# Identidad privada: aprovisionamiento autorizado

Solo un operador con acceso administrativo a la configuración del servidor puede registrar cuentas. No existe un endpoint público de aprovisionamiento. Conocer un ownerId no otorga permisos.

Runtime: Node.js 22.18 o posterior (incluido Node 24), con soporte nativo de eliminación de tipos para los imports locales `.ts`. CI usa Node 22. `npm run test:agent-chat` comprueba tanto el acceso HTTP como el aprovisionamiento offline, sin transferencias ni almacenamiento externo.

El operador ejecuta `node scripts/provision-history-account.mjs --out <directorio-privado-nuevo>` desde un equipo confiable. El comando crea un propietario aleatorio y guarda un archivo con las credenciales y una propuesta de hashes. No imprime secretos ni modifica variables del despliegue. El directorio se crea sin sobrescribir rutas existentes, con permisos de usuario (0700/0600 en POSIX; ACL exclusiva del usuario actual en Windows).

Registrar manualmente la entrada de `account.json` en BAZAAR_HISTORY_ACCOUNTS_JSON, preservando todas las entradas existentes. Revisar el propietario antes de guardar y distribuir cada credencial por un canal privado: escritura al agente y lectura al humano. No subir archivos a Git ni pegar secretos en logs. El directorio debe estar fuera del repositorio.

Ambos hashes registrados apuntan al mismo propietario. Las cuentas explícitas y sus enlaces siguen válidos. Las credenciales antiguas aceptadas únicamente por su prefijo se rechazan: no hay evidencia que permita relacionarlas de forma segura. Conservar registros históricos; una eventual recuperación requiere verificar su procedencia antes de registrar cualquier asociación, nunca deducirla de un ownerId enviado por el cliente.

El chat público es una demostración, no un agente autónomo. No genera tokens ni afirma compras, almacenamiento o entregas reales. Retira el almacenamiento local de su sesión ficticia anterior. El enlace público abre la demostración; los enlaces privados proceden del agente correctamente configurado.

La prueba test-agent-chat-flow usa handlers HTTP reales con cuentas efímeras y un doble de Redis en memoria. No demuestra persistencia externa ni transferencias.
