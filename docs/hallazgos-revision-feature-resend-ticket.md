# Hallazgos de revisión: `feature/resend-ticket`

## 1. Reutilizar la clave de idempotencia al reintentar un reenvío

- **Prioridad:** P2
- **Ubicación:** `app/api/eventos/[id]/reenviar-entrada/route.ts:87`
- **Hallazgo:** Cada solicitud de reenvío genera una clave de idempotencia nueva mediante `randomUUID()`. Si Resend acepta el correo pero se pierde su respuesta, la ruta devuelve un error. Cuando la persona organizadora reintenta la operación, la clave cambia y Resend puede enviar una segunda copia de la misma entrada.
- **Recomendación:** Mantener la misma clave para los reintentos de un mismo intento de reenvío y generar otra únicamente cuando la persona organizadora inicie un reenvío posterior de forma intencional.
