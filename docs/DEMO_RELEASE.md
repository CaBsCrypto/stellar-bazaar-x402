# Candidato de demo pública Testnet

Base de implementación: checkout beta-open-build, commit 7f7ab2b. Los cambios
posteriores del candidato deben fijarse en un SHA antes de cualquier publicación.
No reutilizar evidencias de aceptación anteriores como prueba de este candidato.

## Configuración a revisar antes de publicar

Activar BAZAAR_PUBLIC_DEMO, BAZAAR_ENABLE_OPEN_WORKSPACES,
BAZAAR_ENABLE_MARKETPLACE y BAZAAR_X402_MARKETPLACE_ENABLED en el candidato. Activar tambi�n
BAZAAR_ENABLE_MARKET_PURCHASES y NEXT_PUBLIC_BAZAAR_MARKETPLACE. Configurar
BAZAAR_PROVIDER_REVIEW_BACKEND=redis y BAZAAR_DYNAMIC_PREFIX=BAZAAR_MARKET_PREFIX:catalog.
Usar BAZAAR_WORKSPACE_ADMISSION=open, BAZAAR_WORKSPACE_BACKEND=redis y el origen
HTTPS público exacto. Mantener namespaces separados de workspace, revisión,
marketplace y catálogo. Mantener revisión manual y control del endpoint antes
de activar vendedores. No cambiar las credenciales de administración existentes.

Ejecutar `npm run demo:preflight` con el entorno configurado. Sólo muestra booleanos;
no carga .env automáticamente ni valida servicios externos. Verificar en consola
la cuota actual de Upstash y que todas las claves necesarias están en la base
correcta antes de configurar variables. El perfil público no requiere copiar
historiales privados a preview. Vercel permanece sin pausa automática.

## Aceptación y autorizaciones pendientes

1. Fijar SHA final; ejecutar tipos, build y pruebas demo/MCP/comprador/cuotas/x402.
2. Comparar GET /api/mcp y tools/list de producción con el contrato 0.9.0.
3. Preview con namespaces independientes y usuarios sintéticos: registro,
   recuperación, firma de wallet, catálogo, historial y rechazo entre cuentas.
4. Presentar SHA, diff, resultados, variables y coste previsto; solicitar la
   autorización de publicación. No push, merge ni deploy implícitos.
5. Seleccionar un servicio de texto activo con precio 0.01 USDC Testnet y confirmar
   su control, vendedor y disponibilidad. Autorizar por separado una transacción,
   con el agente y wallet del desarrollador; no usar una wallet del servidor.
6. Comprobar pago, entrega, recibo y recuperación sin cobro duplicado; capturar
   evidencia saneada. Sólo entonces marcar la demo completa para el hackathon.

Ante fallos cerrar nuevas admisiones u órdenes con sus flags; conservar lectura
y conciliación. No borrar claves ni degradar autenticación. Un rollback debe
mantener compatibilidad con el nuevo esquema wallet/queries: versiones anteriores
con esquemas estrictos no pueden leer estos campos. Corregir hacia adelante o
usar un namespace independiente conservando el historial; no volver ciegamente
al código anterior después de crear cuentas con wallets verificadas.

El catálogo de capacidades informa flags habilitados; éstos no certifican conexión
Redis, saldo de wallet, servicios activos ni aceptación de pagos externos.
