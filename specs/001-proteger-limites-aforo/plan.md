# Implementation Plan: Proteger límites de aforo

**Branch**: `001-proteger-limites-aforo` | **Date**: 2026-10-02 | **Spec**: [spec.md](spec.md)

**Input**: `specs/001-proteger-limites-aforo/spec.md`. Diseño incremental sobre Door List existente. Plan sincronizado con la base corregida y `tasks.md`; la operación conjunta está implementada; ver evidencia ejecutada en [quickstart.md](quickstart.md).

## Summary

Proteger los límites solicitados mediante conteos de `registrations`, conservar la suma de cupos asignados y comunicar cada causa con cifras confirmadas. PostgreSQL será la autoridad: guardas de consumo y bloqueo, restricciones diferibles de asignación y una RPC autenticada para cambios conjuntos. Un Route Handler traducirá errores reconocidos a `{ error: string }` con copy español. El panel conservará sus formularios; el mínimo definitivo se resolverá dentro de la transacción.

### Base corregida (2026-10-05)

Specs 002–005 sustituyen el registro directo por reservas verificadas, añaden calendario propio, guardas de publicación, roles de puerta y auditoría. `capacity_consumption` cuenta Registrations más pendientes vigentes, sin joins a Tickets. La base anterior cubría consumo y asignación mediante validadores inmediatos con DETAIL versionado y locks. El editor ya omite límites no tocados y conserva estados de envío.

El delta implementado de esta feature es la configuración conjunta: separar consumo inmediato de asignación diferida, RPC autenticada de estado final, PATCH y matriz SQL/API/UI de las tres historias. Conservar todos los datos y la base corregida; no restaurar `register_for_event`.

## Technical Context

**Language/Version**: TypeScript 5.9.3, React 19.2.8, SQL/PLpgSQL; versiones de `package-lock.json`.

**Primary Dependencies**: Next.js 16.3.3 App Router, Tailwind 4.3.3, `@supabase/supabase-js` 2.112.4, Resend 6.25.0. Sin nuevas dependencias de runtime. Context7 no indexa específicamente Next.js 16.3.3; se consultó documentación oficial actual sobre fronteras servidor/cliente, sin introducir APIs de versión dudosa.

**Storage**: Supabase PostgreSQL, Auth y RLS. PostgreSQL 17 configurado localmente en `supabase/config.toml`; no se inspeccionó ni modificó el remoto. Reutilizar tablas e índices; agregados `bigint`.

**Testing**: ESLint/build existentes; Playwright 1.63.0 y Resend simulado. Añadir pgTAP en `supabase/tests/` y runners locales con dos sesiones `psql` para concurrencia y upgrade.

**Target Platform**: Web; navegador para formularios; Route Handler Node.js y PostgreSQL para autenticación/transacciones.

**Project Type**: Aplicación existente con APIs Next.js y Data API Supabase.

**Performance Goals**: La spec no define SLO numérico. Reutilizar índices por evento/email y tipo, conteos sin N+1 ni joins a Tickets. Conservar serialización por evento existente; eventos distintos independientes.

**Constraints**: Migración nueva; Server Components por defecto; contratos nuevos camelCase; errores propios `{ error: string }`; conteos posteriores a locks; ningún saneamiento automático. FR-012 requiere `READ COMMITTED` en registro, toda RPC de configuración y DML que active guardas de límites/asociación, y rechaza otros aislamientos para evitar aceptación con snapshots antiguos.

**Scale/Scope**: Un Event y opcionalmente un TicketType existente por petición conjunta. Ediciones, mensajes y pruebas; sin reconstruir panel ni cambiar calendario, ventas, cancelación, email, roles, listas o exportaciones.

## Constitution Check

Reevaluación del 2026-10-05 tras las correcciones autorizadas por el usuario. Sin enmienda ni excepción constitucional.

| Principio | Base corregida y evidencia |
|---|---|
| I | Specs 002–005 y migraciones nuevas; once migraciones originales intactas. |
| II | Zona propia, cierre/ingreso explícitos y DST; ver spec 002 y verificación. |
| III | Email confirmado, una entrada/evento y caducidad/liberación; ver spec 003. |
| IV | Publicación con tipo, cupos declarados, guardas de consumo y aforo global; ver specs 003/004. 001 demuestra sus propios criterios con upgrade, SQL, API, UI y concurrencia. |
| V | Códigos públicos 256 bits, sin PII, staff separado, revocadas conservadas/exportadas; ver spec 005. |

T001 se cerró con evidencia de las specs previas. Las tareas de 001 se verifican independientemente; su evidencia y la reevaluación constitucional final están en [quickstart.md](quickstart.md).

## Diseño de la operación

1. Añadir `PATCH /api/eventos/[id]/configuracion` con Bearer del panel, validación estricta de campos y cliente de usuario en `lib/supabase/`. Validar Auth y propiedad antes de exponer cifras; sin service-role normal.
2. RPC `update_event_configuration`, request JSON camelCase, `SECURITY INVOKER`, `VOLATILE`, `search_path = ''`, ejecución solo `authenticated`; comprobar `auth.uid()` y propiedad además de RLS. Una llamada = una transacción.
3. Bloquear Event y después el tipo solicitado; consultar consumo y asignación en sentencias posteriores. Validar todos los límites presentes y suma final; agregar infracciones antes de escribir.
4. Diferir únicamente `events_capacity_assignment_check` y `ticket_types_capacity_assignment_check`; aplicar patches; forzar `IMMEDIATE` antes de éxito. Consumo permanece inmediato. Propagar excepciones para rollback total. Sin bypass de triggers ni aforos temporales.
5. Separar guardas BEFORE de consumo (`UPDATE OF max_capacity`) de bloqueo de tipo (`INSERT OR UPDATE OF event_id,max_capacity`). No usar diferencia OLD/NEW para decidir consumo. DML directo ya bloqueó el tipo: obtener Event `FOR UPDATE NOWAIT` evita espera circular. Un `55P03` es reintentable por transacción completa, no un rechazo por ventas.
6. Restricciones de asignación AFTER, `CONSTRAINT TRIGGER`, `DEFERRABLE INITIALLY IMMEDIATE`, dirigidas a columnas de aforo/asociación. Leer filas finales por ID y suma final, no `NEW` histórico; una fila eliminada antes de evaluación se omite. DML normal valida al finalizar sentencia; SQL que difiera esas restricciones valida al commit.
7. Conservar `reserve_for_event` y `confirm_reservation` de spec 003, su consumo conjunto, locks y READ COMMITTED. `0A000` exige nueva transacción READ COMMITTED y es 500 propio en configuración, distinto de contención 503. No restaurar emisión pública directa; la confirmación sustituye pendiente por Registration sin incrementar consumo.
8. Errores SQL con `DETAIL` JSON reconocido/versionado; normalizar a copy y HTTP propios. Un `23514` sin marcador no permite inferir aforo. El cliente comprueba `response.ok` antes de procesar éxito/error.
9. Registrar intención de editar límites, incluso si el valor termina igual al original. En creación enviar todo límite requerido. Mantener la vía actual de traslado de tipo cuando cambia su evento, protegida por guardas; el endpoint conjunto no incluye traslados.

## Project Structure

### Documentation (this feature)

```text
specs/001-proteger-limites-aforo/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── event-configuration.md
    └── database-capacity.md
```

### Source Code (repository root, cambios previstos)

```text
app/
├── organizador/page.tsx                   # Server Component existente
├── organizer.tsx                         # Editor cliente existente
└── api/eventos/[id]/configuracion/route.ts # Nuevo PATCH
lib/
├── types.ts                              # Contratos compartidos
├── errors.ts                             # Decoder y mensajes propios
└── supabase/server.ts                    # Cliente por request con JWT
supabase/
├── migrations/<timestamp>_protect_capacity_limits.sql # Nueva
└── tests/capacity_limits.test.sql         # Nueva pgTAP
tests/
├── db/run-capacity-concurrency.mjs        # Nuevo; dos sesiones psql
├── db/run-capacity-upgrade.mjs            # Nuevo; esquema anterior → nuevo
└── e2e/capacity-limits.spec.ts            # Nueva; runner existente
```

**Structure Decision**: Extender organización actual sin ORM/tablas/capas adicionales de producto. La página conserva Server Component; el editor necesita estado, efectos, sesión y handlers, por lo que conserva frontera cliente. Feedback local junto al editor; compartir solo si aparece un segundo consumidor real. Tipos en `lib/types.ts`, formatos en `lib/dates.ts`. Aplicar `door-list-ui` a feedback de formularios y leer referencias visuales antes de cambiar estilos; no migrar UI ajena.

## Entrega y validación

Phase 0 resuelta en [research.md](research.md). Phase 1: [data-model.md](data-model.md), [contratos](contracts/event-configuration.md) y [quickstart.md](quickstart.md). Implementados: migraciones/guardas, pruebas SQL, RPC/endpoint, editor/mensajes y runners locales. La ejecución y sus resultados están en [quickstart.md](quickstart.md).

## Complexity Tracking

| Decisión | Motivo | Alternativa descartada |
|---|---|---|
| RPC + guardas de tabla | Atomicidad y protección externa | Solo React/API permite DML inválido y conteos obsoletos. |
| Asignación diferible | Estado final, también al corregir legacy | Orden de updates no resuelve todos los legacy; staging añade escrituras y límites de integer. |
| Endpoint autenticado | camelCase y errores `{ error: string }` | Errores PostgREST crudos no cumplen contrato del producto. |

Sin excepciones constitucionales. Las correcciones previas tienen evidencia independiente; la entrega de aforo conjunto tiene evidencia independiente en quickstart.

## Instalación histórica de prueba

La fixture versionada `20261005095000_capacity_legacy_fixture.sql` se aplica exclusivamente en un proyecto aislado después de las once migraciones originales y antes de 002–005. Importa los tres estados históricos exigidos retirando y restaurando dentro de esa migración las guardas originales de asignación; nunca deshabilita las guardas nuevas ni modifica migraciones de producto. Luego se aplican 002–005, se captura el snapshot completo y se aplica 001. Este orden permite reproducir aforo 2/VIP 3 y aforo 3/VIP 10 sin fabricar estados inválidos bajo la protección nueva.

## Ajustes verificados de implementación (2026-10-05)

- `20261005150000_protect_capacity_limits.sql` conserva consumo inmediato, añade asignación diferible y RPC invoker. El helper autorizado `configuration_capacity_consumption` cuenta pendientes privadas sin dar acceso a reservas o tokens.
- La primera ejecución SQL detectó que RLS ocultaba el Event ajeno en `SELECT FOR UPDATE`, produciendo 404 para un recurso visible. La corrección está en otra migración, `20261005151000_authorize_configuration_before_lock.sql`: comprobar visibilidad/propiedad antes de bloquear y repetir la comprobación después del lock. La migración ya aplicada no se reescribió.
- El editor omite fechas no tocadas además de límites no tocados, conservando los instantes históricos completos. Cambiar zona sin tocar fechas conserva UTC.
- Los tests de contención HTTP usan simulación declarada; las carreras SQL fuerzan locks reales, ambas órdenes y lectura final independiente.
