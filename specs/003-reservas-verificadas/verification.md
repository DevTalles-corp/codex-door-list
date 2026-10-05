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

Duración 10 minutos; respuesta 202 sin token/Ticket; hash privado; emisión directa anon/auth retirada. Confirmación consume token; replay y email normalizado duplicado rechazados. Cupo 2 con una confirmada y una pendiente impide tercera; vencer/cancelar libera lugar. Confirmación antes del vencimiento después del cierre funciona. Aforo global heredado 2 con dos registros General y VIP vacío rechaza VIP y disponibilidad anuncia 0. Registrations revocadas siguen contando. Carreras de reserva y confirmación verificadas con locks reales.

Migraciones: `20261005110000_verified_reservations.sql` y `20261005140000_global_reservation_and_entry_clock.sql`.
