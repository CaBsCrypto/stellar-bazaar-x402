# 🛡️ Guía de Administración & Centro de Control Privado (`/admin`)

Esta documentación describe la arquitectura de seguridad y el procedimiento de acceso al **Operations & Admin Center** de **Stellar Bazaar x402**.

---

## 1. Arquitectura de Seguridad

El panel `/admin` y su API de telemetría `/api/admin/stats` están protegidos mediante el mecanismo **Zero-Knowledge Admin Token Authentication**:

1. **Ruta Oculta:** El enlace `/admin` no aparece en la barra de navegación pública principal.
2. **Lock Screen Criptográfico:** Si el usuario no posee la clave, la interfaz muestra una pantalla bloqueada solicitando la clave de acceso.
3. **Validación Constant-Time en Servidor:**
   - La función [`verifyAdminAccess`](file:///C:/Users/MGC/Documents/Codex/2026-08-12/stellar-bazaar-x402/lib/admin-guard.ts) compara el hash SHA-256 del token enviado contra la variable de entorno `BAZAAR_ADMIN_KEY` utilizando `timingSafeEqual` (prevención de ataques side-channel de temporización).
4. **Almacenamiento Seguro en Sesión:**
   - Una vez autenticado, el token se guarda únicamente en el `localStorage` del navegador del administrador para sesiones persistentes.
   - El botón **🔒 Cerrar Sesión** purga inmediatamente el token local y bloquea la interfaz.

---

## 2. Métodos de Acceso para Administradores

### Método A: Magic Link Directo (Recomendado)
Puedes ingresar directamente abriendo en tu navegador:
```
https://stellar-bazaar-x402.vercel.app/admin#key=bz_admin_stellar_bazaar_sec_2026
```
*(o en tu dominio personalizado: `https://bazaar.browns.studio/admin#key=bz_admin_stellar_bazaar_sec_2026`)*

> [!NOTE]
> Al entrar con `#key=...`, la aplicación captura la clave, la guarda de forma segura en tu sesión local y limpia automáticamente el fragmento hash de la barra de direcciones para no dejar rastros en el historial del navegador.

### Método B: Desbloqueo Manual
1. Navega a `https://stellar-bazaar-x402.vercel.app/admin`.
2. Ingresa la clave de acceso configurada en el prompt de desbloqueo.
3. Presiona **Desbloquear Centro de Control →**.

---

## 3. Configuración de Variables de Entorno en Producción

Para rotar o personalizar la clave en Vercel:

| Variable | Valor por Defecto | Descripción |
| :--- | :--- | :--- |
| `BAZAAR_ADMIN_KEY` | `bz_admin_stellar_bazaar_sec_2026` | Clave secreta maestra para validar llamadas a `/api/admin/stats` y desbloquear `/admin`. |

Para actualizar la clave en Vercel CLI:
```bash
npx vercel env add BAZAAR_ADMIN_KEY production
```
