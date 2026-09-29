# GOAL de la sesión — Publicar un servicio mediante un agente

## Objetivo general

**Lograr que un desarrollador que llega a Bazaar desde la URL pública o el QR pueda copiar las instrucciones de Publicar, entregarlas a su propio agente y completar un alta revisada y recuperable de su servicio en el catálogo de Stellar Testnet.**

El agente deberá poder seguir el recorrido sin conocer esta conversación y sin recibir el secreto administrativo de Bazaar. No añadiremos registro con GitHub, correo o wallet como requisito para preparar el servicio. El agente y la API del proveedor seguirán ejecutándose en su propia infraestructura.

El propósito es llevar Bazaar a eventos de desarrolladores con un recorrido demostrable y aportar evidencia para grants. USDT0 y multichain son objetivos posteriores; no forman parte de este cierre.

## Qué debe poder hacer una persona

1. Abrir Bazaar → Conectar mi agente → Publicar.
2. Copiar el prompt y explicar a su agente qué servicio ofrece, con una idea o una API existente.
3. Preparar la integración y validar la ficha mediante las herramientas reales del MCP.
4. Enviar una solicitud, conservar su identificador y consultar su estado después de un reinicio.
5. Demostrar control del servicio y recibir una decisión explícita del operador.
6. Tras la aprobación y activación administrativa, encontrar la misma ficha en catálogo, detalle y MCP.

**Preparar no es enviar; validar no es aprobar; aprobar no es publicar; aparecer en el catálogo no demuestra una compra exitosa.**

## Estado comprobado al iniciar este bloque

Base local: `mission/identity-pilot`, SHA `28a3c83`, más correcciones del vendedor todavía sin commit. Evidencia: [revisión anterior](validation/seller-five-sprints.md).

- Nueve suites locales, tipos y compilación Webpack aprobados; revisión independiente de preparación y validación.
- Corregidos localmente enlaces e instrucciones, dominios mal formados y transiciones de solicitudes caducadas.
- Disponible un paquete local que conserva ficha, hash y pendientes sin enviar ni publicar.
- La última comprobación pública encontró instrucciones desactualizadas; las correcciones locales no están desplegadas.
- La cola actual vive en memoria del proceso. La verificación de control y revisión no tienen todavía un procedimiento operativo completo.
- El servicio AI Video Scriptwriter fue añadido al catálogo mediante código. Ese antecedente no acredita el alta autónoma desde el prompt.

## Siguiente bloque — Solicitud persistente y revisión operativa

**Meta inmediata:** completar localmente `solicitud → reinicio → recuperación → prueba de control → revisión → activación en registro de prueba → descubrimiento`, usando datos sintéticos y sin pagos.

| Trabajo | Resultado exigido |
| --- | --- |
| Persistencia | Conservar ficha, identificador, condiciones, estado y evidencia fuera de la memoria del proceso. Las transiciones y duplicados deben resolverse de forma atómica. |
| Acceso y límites | Definir quién puede consultar y gestionar cada solicitud; conocer un dominio no autoriza a modificarla. Mantener la revisión administrativa separada y limitar tamaño y volumen de recepción. |
| Prueba de control | Comprobar evidencia real del dominio mediante un procedimiento del operador, probado con dobles. Nunca aceptar un `verified: true` enviado por el proveedor como prueba. |
| Revisión | Registrar decisión, responsable y motivos; permitir corregir los rechazos sin sobrescribir silenciosamente una ficha ya revisada. |
| Activación | Incorporar exclusivamente la ficha aprobada al registro de prueba mediante la operación administrativa existente; comprobar su identidad y condiciones en discovery. |
| Instrucciones | Informar dónde enviar, cómo consultar y qué hacer ante recepción deshabilitada, error o vencimiento. No anunciar un canal que no exista. |

Conservar los endpoints existentes cuando sea posible. Antes de ampliar una interfaz, dejar documentado su contrato y autorización. No habilitar públicamente la cola temporal para aparentar que el recorrido está cerrado.

## Equipo y método

El Scrum Master mantiene un tablero único, integra las correcciones y decide la aceptación con evidencia. Coordina tres especialistas:

1. **Persistencia y estados:** almacenamiento, concurrencia, reinicios y recuperación.
2. **Control y revisión:** autorización del operador, verificación del dominio y activación administrativa.
3. **Experiencia y prueba independiente:** prompt, guía, MCP, formulario y recorrido desde cero.

Asignar archivos sin solapamientos. Cada corrección debe ser revisada por alguien distinto del autor. Trabajar en ciclos cortos: reproducir → corregir → probar → revisión independiente → integrar localmente.

## Pruebas de aceptación

- Una idea sin API produce un borrador con pendientes, nunca una integración ficticia aprobada.
- Una API existente se reutiliza y una ficha inválida no avanza.
- La misma solicitud concurrente no crea dos altas; repetir su identificador con otros datos produce conflicto.
- Reiniciar otro proceso permite recuperar la misma solicitud y evidencia.
- Un fallo o resultado incierto de almacenamiento no genera aprobación ni activación nuevas.
- Prueba de dominio incorrecta o vencida impide aprobar; el proveedor no puede decidir su propia revisión.
- Solo una ficha aprobada puede activarse; la cola privada no aparece en discovery.
- Catálogo, detalle y MCP coinciden en identificador, endpoint y condiciones del servicio activado de prueba.
- Un agente independiente sigue únicamente el prompt, la guía y los requisitos publicados, sin ayuda interna.
- Copia, selección manual, errores y estados funcionan en móvil y escritorio.
- Tipos, compilación y regresiones afectadas pasan sobre el candidato final.

Clasificar la evidencia como local con dobles, almacenamiento externo aislado o comprobación publicada. Ninguna sustituye a las demás.

## Límites y puertas de salida

Este bloque conserva los cambios previos y no incluye compras, fondeo, costes, push, merge ni despliegue. Las pruebas no consultarán ni modificarán operaciones históricas. Cualquier escritura externa necesita un entorno, aislamiento y presupuesto de solicitudes definidos previamente.

**Cierre local:** el recorrido completo funciona con datos sintéticos y tiene revisión independiente; no basta con que el prompt o el botón existan.

**Cierre público posterior:** publicar el candidato mediante una revisión separada y repetir el recorrido con un desarrollador externo. Hasta entonces, no anunciar el alta pública como validada. La última guía pública observada requiere corrección; esto es prioritario para quienes ya recibieron la URL.

Los pagos reales en Stellar Testnet tendrán su propia validación después. USDT0, puentes, Soroswap, escrow y fee split permanecen fuera de esta misión.
