# Plan: calendario por evento

## Implementación

Migración `20261005100000_event_calendar.sql`: campos obligatorios, backfill por día local anterior y validación de zona/ventana. `lib/dates.ts` centraliza conversión y presentación. El editor conserva instantes al cambiar zona y exige offset para horas ambiguas. Las consultas públicas, email, dashboard, CSV y puerta usan los campos del Event.

## Verificación

`supabase/tests/constitutional_corrections.test.sql` comprueba upgrade y ventanas; `tests/e2e/constitutional-corrections.spec.ts` comprueba zonas y DST; `registration-to-check-in.spec.ts` comprueba el recorrido completo. Ejecutar mediante `node tests/db/run-constitutional.mjs`, exclusivamente contra una instalación temporal local.

## Constitution Check

II: campos UTC explícitos y zona propia. I: spec y migración nuevas; no se reescribe historial preexistente. Conformidad verificada; resultados en `verification.md`.
