# Plan: publicación con cupo

## Implementación

Migración `20261005120000_published_event_ticket_type.sql`: saneamiento explícito de publicaciones sin tipos y constraint triggers de estado final. El editor crea borradores y explica recuperación. El error reconocido usa copy propio y no expone errores del proveedor.

## Verificación

Upgrade conserva `published_at` y cambia solo eventos publicados sin tipos. DML directo verifica publicación sin tipos, publicación con cupo 2 y rechazo al borrar el último tipo.

## Constitution Check

IV: evento publicado tiene cupo definido. I: cambio de comportamiento respaldado por spec y migración. Ejecución registrada en `verification.md`.
