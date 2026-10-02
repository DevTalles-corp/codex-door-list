# Implementation Plan: Proteger límites de aforo

**Branch**: `001-proteger-limites-aforo` | **Date**: 2026-10-02 | **Spec**: [spec.md](spec.md)

**Input**: `specs/001-proteger-limites-aforo/spec.md`. Diseño incremental sobre Door List existente. Termina en Phase 1, sin implementación ni generación de `tasks.md`.

## Summary

Proteger los límites solicitados mediante conteos de `registrations`, conservar la suma de cupos asignados y comunicar cada causa con cifras confirmadas. PostgreSQL será la autoridad: guardas de consumo y bloqueo, restricciones diferibles de asignación y una RPC autenticada para cambios conjuntos. Un Route Handler traducirá errores reconocidos a `{ error: string }` con copy español. El panel conservará sus formularios; el mínimo definitivo se resolverá dentro de la transacción.

### Base existente inspeccionada

Se leyeron las once migraciones, el editor, sus errores y tipos, el registro/API, el dashboard, las rutas de puerta/exportación y las pruebas E2E. La definición efectiva de aforo y registro está en `supabase/migrations/20260905120000_rename_tickets_types_to_ticket_types.sql`, que reemplaza funciones anteriores tras renombrar la tabla.

- `validate_ticket_type_capacity` (líneas 79–99) bloquea Event y valida suma de cupos, sin consultar ventas. `validate_event_capacity` (101–113) solo compara esa suma.
- Los triggers de `20260828120000_add_event_capacity_guard.sql` escuchan columnas concretas, incluso cuando se les asigna el mismo valor.
- `register_for_event` (206–311) bloquea Event y después TicketType; cuenta todos los registros del tipo; conserva unicidad por evento/email y emite Ticket. No compara explícitamente consumo total con aforo: desde datos consistentes, el límite global resulta de cupos estrictos y suma asignada ≤ aforo.
- `app/organizer.tsx:23` y `:26` guardan Event y TicketType por operaciones independientes. Siempre envían `max_capacity`, incluso al editar nombres; el tipo siempre envía `event_id`.
- `lib/errors.ts:24` convierte cualquier `23514` en «El aforo del evento no puede ser menor que las entradas ya asignadas.» o «La capacidad asignada no puede superar el aforo del evento.». No comunica cifras ni distingue consumo de asignación.
- `lib/organizer-dashboard.ts` filtra Tickets `valid`/`used` para métricas y lista; esas cifras no sirven como mínimo porque excluyen revocadas.
- No existe columna de modo estricto. Configurar el cupo numérico obligatorio declara el límite estricto según la definición de la spec; todos los valores actuales se interpretan como límites configurados. Proteger este comportamiento, sin añadir modos nuevos.

### Criterios ya cumplidos: conservar

| Spec | Evidencia y alcance actual |
|---|---|
| FR-001 | Desde configuración consistente: cupos estrictos + suma asignada ≤ aforo limitan ventas globales. No añadir una regla diferente para vender en legacy inconsistente. |
| FR-008, reglas de negocio | Firma, estados, validaciones, fechas, unicidad evento/email y emisión de `register_for_event`; email/QR vigentes. La compatibilidad de aislamiento cambia bajo FR-012. |
| FR-009, cambios individuales | Guardas SQL impiden aforo < suma asignada y permiten igualdad. |
| FR-010, conteo de venta | `count(*)` sobre `registrations`, sin filtrar Tickets. Extender este criterio a ediciones. |
| US1.2, US1.3, US2.2 | Las reducciones positivas descritas ya se aceptan cuando cubren asignación. Añadir regresiones. |
| US2.4, persistencia | Rechazo actual de aforo 6→3 con suma 6; mensaje incompleto. |
| FR-011, activación | Añadir/reemplazar guardas no exige reescribir datos previos. Formalizar esta garantía. |

### Criterios cuyo comportamiento cambia

| Spec | Cambio |
|---|---|
| FR-002 / US2.1, US2.3, US2.5 | Mínimo por registros del evento; validar también mismo valor explícito. |
| FR-003 / US1.1, US1.4, US1.5 | Mínimo por registros del tipo, incluidas revocadas. |
| FR-006 / SC-003, SC-005 | Sustituir mapeo indiscriminado de `23514` por causa reconocida, límite, nombre y cifras. |
| FR-007 / US3.2, US3.3 / SC-004 | Serializar ventas y ediciones con Event; resolver inversión de locks de DML directo y snapshots después de la espera. |
| FR-009, ejecución | Conservar desigualdad; comprobar asignación al final de sentencia por defecto y al final de la RPC conjunta. |
| FR-011, metadatos | Omitir límites no solicitados. Una intención explícita de establecer el mismo número sigue validándose. |
| FR-012 / US3.4–US3.5 | Exigir READ COMMITTED en registro, RPC de configuración y DML que active guardas de límites/asociación; rechazar otros aislamientos con `0A000`. Es un cambio técnico de compatibilidad, no una regla de venta conservada. |

### Criterios y superficies nuevos

| Spec | Nuevo diseño |
|---|---|
| FR-004 | Petición conjunta Event + un TicketType existente; transacción y rollback completo. |
| FR-005 / US3.1 | Guardas de consumo en tablas, comprobables mediante DML fuera del panel. |
| FR-006, múltiples errores | Agregar todas las infracciones de la petición antes de escribir. |
| FR-010, ediciones | Consumo separado de métricas operativas, sin cambiar sus filtros. |
| FR-011, legacy | Upgrade sin saneamiento; mismo valor explícito inválido rechazado; metadatos aislados editables. |
| SC-001, SC-002 | Cobertura numérica de todas las aceptaciones, igualdad, revocadas y asignación; SC-003–005 con copy y órdenes de confirmación forzados. |

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

*Gate antes de Phase 0 y reevaluación después de Phase 1. Corrección de la revisión del 2026-10-02: estado global FAIL; implementación BLOCKED hasta resolución explícita de los conflictos siguientes.*

| Principio | Antes | Después |
|---|---|---|
| I. Spec y migraciones | PASS: spec y esquema leídos | PASS: FR trazables; nueva migración exclusivamente; ninguna existente modificada. |
| II. Calendario | FAIL: zona global y ausencia de campos por evento | FAIL: conservar el calendario actual no satisface zona propia ni cierre/ingreso explícitos. |
| III. Identidad/reservas | FAIL: emails sin verificar sin caducidad | FAIL: FR-008/010 conservan reservas que no caducan ni liberan cupo; política por email pendiente de su spec propia. |
| IV. Aforo verificable | FAIL: se puede publicar sin tipo con cupo | FAIL: escenarios numéricos y declaración mediante cupo configurado aclarados; publicación sin tipo sigue permitida. |
| V. Acceso/auditoría | FAIL: PII pública, rol de puerta y exportación | FAIL: conservar esas superficies mantiene los incumplimientos de privacidad, permiso independiente y auditoría de revocadas. |
| Verificación | Spec contiene criterios | Diseño de pruebas trazable; ejecución pendiente. No demuestra cumplimiento constitucional del producto. |

Registrar deuda no convierte un incumplimiento MUST en PASS. Los conflictos heredados constan en «Estado existente y desviaciones pendientes» de `spec.md` y deben resolverse antes de implementar o aprobar este cambio. La instrucción de conservar reglas de venta impide asumir aquí cambios de caducidad/publicación. T001 verifica como prerrequisito una resolución explícita y revisada: specs y correcciones correspondientes, o una enmienda constitucional separada con motivo e impacto. Ninguna de esas decisiones se adopta en estos ajustes; las tareas de código y pruebas quedan condicionadas a reevaluar el gate sin conflictos abiertos. No se concede una excepción por ser deuda previa.

## Diseño de la operación

1. Añadir `PATCH /api/eventos/[id]/configuracion` con Bearer del panel, validación estricta de campos y cliente de usuario en `lib/supabase/`. Validar Auth y propiedad antes de exponer cifras; sin service-role normal.
2. RPC `update_event_configuration`, request JSON camelCase, `SECURITY INVOKER`, `VOLATILE`, `search_path = ''`, ejecución solo `authenticated`; comprobar `auth.uid()` y propiedad además de RLS. Una llamada = una transacción.
3. Bloquear Event y después el tipo solicitado; consultar consumo y asignación en sentencias posteriores. Validar todos los límites presentes y suma final; agregar infracciones antes de escribir.
4. Diferir únicamente `events_capacity_assignment_check` y `ticket_types_capacity_assignment_check`; aplicar patches; forzar `IMMEDIATE` antes de éxito. Consumo permanece inmediato. Propagar excepciones para rollback total. Sin bypass de triggers ni aforos temporales.
5. Separar guardas BEFORE de consumo (`UPDATE OF max_capacity`) de bloqueo de tipo (`INSERT OR UPDATE OF event_id,max_capacity`). No usar diferencia OLD/NEW para decidir consumo. DML directo ya bloqueó el tipo: obtener Event `FOR UPDATE NOWAIT` evita espera circular. Un `55P03` es reintentable por transacción completa, no un rechazo por ventas.
6. Restricciones de asignación AFTER, `CONSTRAINT TRIGGER`, `DEFERRABLE INITIALLY IMMEDIATE`, dirigidas a columnas de aforo/asociación. Leer filas finales por ID y suma final, no `NEW` histórico; una fila eliminada antes de evaluación se omite. DML normal valida al finalizar sentencia; SQL que difiera esas restricciones valida al commit.
7. Conservar firma/cuerpo de negocio de `register_for_event`; añadir la guardia técnica de aislamiento especificada en FR-012. `0A000` exige nueva transacción READ COMMITTED, no reintento en la misma ni rechazo por falta de cupo; en el endpoint es 500 propio, distinto de contención 503. Sin nuevo veto global de venta en legacy: desde datos consistentes, cupos estrictos y asignación protegen el aforo global.
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

Phase 0 resuelta en [research.md](research.md). Phase 1: [data-model.md](data-model.md), [contratos](contracts/event-configuration.md) y [quickstart.md](quickstart.md). Implementación posterior: migración/guardas y pruebas SQL, RPC/endpoint, editor/mensajes y guía completa. Los runners nuevos citados son trabajo futuro: no se ejecutaron ni se crearon en este plan.

## Complexity Tracking

| Decisión | Motivo | Alternativa descartada |
|---|---|---|
| RPC + guardas de tabla | Atomicidad y protección externa | Solo React/API permite DML inválido y conteos obsoletos. |
| Asignación diferible | Estado final, también al corregir legacy | Orden de updates no resuelve todos los legacy; staging añade escrituras y límites de integer. |
| Endpoint autenticado | camelCase y errores `{ error: string }` | Errores PostgREST crudos no cumplen contrato del producto. |

No se conceden excepciones constitucionales. La deuda heredada registrada en la spec mantiene el gate en FAIL y la implementación bloqueada hasta su resolución revisada.
