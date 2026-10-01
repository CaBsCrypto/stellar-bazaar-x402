# Transcripción de la reproducción independiente inicial

Estos cuatro scripts conservan la ejecución del revisor sobre la base y los parches
revisados. Contienen rutas y origen sintéticos fijos de esa ejecución. Sus directorios
privados ya existen; no son comandos listos para una nueva ejecución y no se incluyen
sus credenciales. No repetirlos sobre esos datos para preparar otra aceptación.

Para una reproducción nueva del candidato usar la guía copiable
`docs/OPEN_BAZAAR_SYNTHETIC_HANDOFF.md`, una carpeta privada nueva y los gates del
expediente final. `review-sprint-redis-guard.mjs` acepta explícitamente el checkout
de fuentes como argumento y solo usa dobles. El informe de revisión distingue la
reproducción inicial de los gates ejecutados sobre el SHA de código final.
