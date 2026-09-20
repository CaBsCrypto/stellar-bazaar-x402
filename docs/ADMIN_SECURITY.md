# 🛡️ Guía de Administración & Centro de Control Privado (`/admin`)

Esta documentación describe la arquitectura de seguridad y los procedimientos de acceso al **Operations & Admin Center** de **Stellar Bazaar x402**.

---

## 1. Arquitectura de Seguridad y Métodos de Acceso

El panel `/admin` y su API de telemetría `/api/admin/stats` están protegidos mediante una arquitectura dual:

### Método A: Magic Link por Email a `@browns.studio` *(Recomendado para el equipo)*
1. El usuario entra a `/admin`.
2. Ingresa su correo corporativo autorizado (ej. `cristian@browns.studio`).
3. El endpoint `/api/admin/magic-link` valida que el correo pertenezca a la whitelist corporativa y genera un token OTP único (`bz_magic_...`) con TTL de 15 minutos almacenado en Upstash Redis.
4. El usuario recibe un correo formateado con el botón **"Desbloquear Panel Admin →"**.
5. Al hacer clic, el token se valida y se consume de inmediato (un solo uso), desbloqueando la sesión en ese navegador.

### Método B: Master Access Key & Magic Hash Link
1. Acceso directo con hash: `/admin#key=bz_admin_stellar_bazaar_sec_2026`.
2. O ingreso manual de la Master Key en la pestaña **"Master Key"**.
3. Validación en servidor en tiempo constante (`timingSafeEqual` en [`lib/admin-guard.ts`](file:///C:/Users/MGC/Documents/Codex/2026-08-12/stellar-bazaar-x402/lib/admin-guard.ts)).

---

## 2. Whitelist de Correos Autorizados

Por defecto, los correos autorizados son:
- `cristian@browns.studio`
- `cabscryptocontacto@gmail.com`
- Correos adicionales listados en la variable de entorno `ADMIN_ALLOWED_EMAILS` (separados por coma).

---

## 3. Configuración de Variables de Entorno en Vercel

| Variable | Requerida | Descripción |
| :--- | :--- | :--- |
| `RESEND_API_KEY` | Opcional | API Key de [Resend.com](https://resend.com) para el envío real de correos desde `@browns.studio`. |
| `ADMIN_ALLOWED_EMAILS` | Opcional | Lista de correos autorizados separados por coma (ej: `cristian@browns.studio,admin@browns.studio`). |
| `BAZAAR_ADMIN_KEY` | Opcional | Clave maestra por defecto: `bz_admin_stellar_bazaar_sec_2026`. |

Para agregar `RESEND_API_KEY` en producción:
```bash
npx vercel env add RESEND_API_KEY production
```
