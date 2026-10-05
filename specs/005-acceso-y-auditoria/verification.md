# Verificación — 2026-10-05

## Entorno y comandos

- Next.js 16.3.3, Supabase CLI 2.116.0, PostgreSQL 17 y Chromium/Playwright local.
- `node tests/db/run-constitutional.mjs`: PASS en proyecto temporal local con puertos 554xx, datos sintéticos y Resend simulado. No se aplicó ninguna migración al remoto ni al proyecto de desarrollo.
- `npm run lint`: PASS, sin warnings después de excluir scripts vendorizados de skills.
- `npm run build`: PASS, incluyendo TypeScript y las rutas nuevas.
- `git diff --check`: PASS. Las once migraciones anteriores a 2026-10-05 y la constitución 1.0.0 permanecen intactas.

## Evidencia común

- Upgrade del historial original a las cinco migraciones de corrección. Snapshots preservan Registrations, TicketTypes e identidades/fechas/estados de Tickets; se comprueban campos de calendario y paso a borrador de publicación sin tipos.
- pgTAP: **61/61** comprobaciones de comportamiento y permisos.
- Sesiones psql independientes: último cupo con un ganador (consumo 1/1), token confirmado una sola vez (un Ticket), ingreso bloqueado hasta después del cierre rechazado, y SQLSTATE `0A000` en reserva/confirmación bajo REPEATABLE READ y SERIALIZABLE. Barreras observan espera real en `pg_stat_activity`; no se deduce concurrencia de promesas HTTP.
- Playwright: **4/4** pruebas: fechas/DST; reservas y caducidad/error de correo; staff/auditoría; publicar→reservar→email→confirmar→email con QR→cámara simulada→check-in.

## Límites

Prueba local con cámara y correo simulados; no demuestra entrega del proveedor real ni operación de una cámara física. No se ejecutó lector de pantalla. La operación conjunta de límites y su PATCH de spec 001 se verificaron independientemente; ver [evidencia de 001](../001-proteger-limites-aforo/quickstart.md).

## Criterios específicos

Staff verificado asignado inmediatamente en A: búsqueda/check-in admitidos, B y export/edición de A rechazados. Cuenta inexistente/no verificada no asignable. Retirada impide siguiente búsqueda/check-in. RPC pública y página sin nombre/email. Ticket revocado excluido de búsqueda/lista/CSV operativo y presente en auditoría; nueva fecha de revocación conocida, histórica vacía. Event/Type con Tickets no borrables por cascada. Código público 64 hex generado e inmutable.

Capturas de organizador y Ticket inspeccionadas a 1280 y 390 px: sin desbordamiento, textos/controles legibles y anatomía/tokens conservados. Tab desde email de colaborador enfoca el botón de asignación; alertas/éxitos tienen roles accesibles y labels asociados. No se añadió animación; se conserva el comportamiento de movimiento reducido existente.

Migración: `20261005130000_door_access_audit_privacy.sql`.
