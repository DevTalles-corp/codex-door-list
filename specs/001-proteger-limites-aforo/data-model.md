# Data model: Proteger límites de aforo

**Spec**: [spec.md](spec.md) | **Contratos**: [API](contracts/event-configuration.md), [PostgreSQL](contracts/database-capacity.md)

## Entidades existentes

No se crean tablas, columnas, enums de negocio ni contadores persistidos. Los nombres snake_case siguientes pertenecen a persistencia; contratos nuevos y tipos del producto usan camelCase en `lib/`.

| Entidad / tabla | Campos relevantes existentes | Relaciones y validación |
|---|---|---|
| Event / `events` | `id uuid`, `created_by uuid`, `title text`, `description text?`, `event_date timestamptz`, `venue text`, `status event_status`, `max_capacity integer`, `published_at timestamptz?`, `time_zone`, `registration_closes_at`, `entry_opens_at`, `entry_closes_at`, `public_code`, timestamps | Owner en Auth; `max_capacity > 0`; título/lugar no vacíos; reúne TicketTypes y Registrations. |
| TicketType / `ticket_types` | `id uuid`, `event_id uuid`, `name text`, `max_capacity integer`, timestamps | FK Event; nombre no vacío; cupo > 0; únicos `(event_id,name)` y `(event_id,id)`; cupo vigente tratado como estricto. |
| Registration / `registrations` | `id uuid`, `event_id uuid`, `ticket_type_id uuid`, `attendee_name text`, `attendee_email text`, `created_at timestamptz` | FK compuesto a `(ticket_types.event_id,id)`; email normalizado único por evento; nombre 1–120 y email 3–254/formato vigente; cada fila ocupa una unidad. |
| Ticket / `tickets` | `id uuid`, `registration_id uuid`, `code text`, `status ticket_status`, `checked_in_at timestamptz?`, `revoked_at timestamptz?`, timestamps | FK Registration única; código aleatorio 32 bytes en hex, único; estado `valid`, `used`, `revoked`. Ninguno altera consumo mientras existe Registration. |

La FK compuesta evita mover un tipo con registros a otro evento bajo el esquema vigente. La spec 005 impide borrar Event/TicketType con Tickets emitidos. La spec 003 define caducidad/liberación de pendientes; esta feature conserva ambas reglas. Los tipos existentes `Event`/`TicketType` contienen campos de persistencia; no se redefine su significado ni se reescribe toda la aplicación para esta feature.

Configurar el cupo numérico obligatorio (`maxCapacity` en UI/API, `ticket_types.max_capacity` en persistencia) constituye la declaración de un límite estricto. Todos los valores heredados se interpretan como límites configurados vigentes. No se añade un modo no estricto, ni se determina la estrictez por consumo o estado de Ticket (FR-003, US1.6).

## Valores derivados autoritativos

| Valor | Cálculo en PostgreSQL después de bloquear Event |
|---|---|
| Event consumption | Registrations del Event más reservas pendientes vigentes del Event. |
| TicketType consumption | Registrations del tipo más reservas pendientes vigentes del tipo. |
| Assigned capacity | Suma `bigint` de todos los cupos del Event. |
| Final assigned capacity | Suma actual − cupo almacenado del tipo solicitado + cupo solicitado; sin patch de cupo de tipo, suma actual. |
| Event minimum when requested | Máximo entre consumo del evento y suma final asignada. Comunicar cada causa por separado. |
| TicketType minimum when requested | Consumo del tipo; además, la configuración final debe respetar asignación. |

Cada Registration y cada reserva pendiente vigente cuentan una sola vez; confirmar sustituye una por otra sin duplicar consumo. No join a Tickets, filtrado de estado, reutilización de métricas operativas ni datos de pantalla. No guardar mínimos: pueden cambiar con nuevas ventas entre intentos.

## Objetos compartidos nuevos (no persistidos)

- `EventConfigurationRequest`: patches opcionales `event` y `ticketType`, definidos en el contrato API. Presencia de `maxCapacity` representa una solicitud explícita; omisión conserva el límite sin validarlo por consumo.
- `EventConfigurationResponse`: `{ eventId: string; ticketTypeId: string | null }`.
- `CapacityViolation`: `scope: "event" | "ticketType"`, `reason: "registrationConsumption" | "assignedCapacity"`, `requestedCapacity: number`, `minimumCapacity: number`, `ticketTypeId?`, `ticketTypeName?`.
- `CapacityErrorDetails`: `{ kind: "capacityViolation"; version: 1; violations: CapacityViolation[] }`. Datos internos normalizados desde SQL; no amplían el sobre público de error.
- `ApiErrorResponse` ya existente: `{ error: string }`. Reutilizarlo, no crear una redefinición local.

## Reglas nuevas y conservadas

1. Al establecer aforo, incluso al número guardado: valor positivo integer ≥ consumo total y ≥ suma final asignada.
2. Al establecer cupo estricto, incluso al número guardado: valor positivo integer ≥ consumo del tipo. La asignación final no puede superar aforo vigente/solicitado.
3. Igualdad permitida; sin consumo, solo restringen configuración y asignación existentes.
4. Cambios conjuntos validan todos los límites presentes; cualquier infracción revierte toda la petición.
5. Un límite legacy no solicitado no obliga a sanearse por consumo. Las reglas de asignación aplicables al cambio siguen vigentes. Título/nombre sin límite/asociación no activan guardas de capacidad.
6. Activación conserva todos los datos; no backfill, aumento automático ni CHECK que valide masivamente filas anteriores.
7. FR-012 requiere READ COMMITTED para registro, toda RPC de configuración y DML que active guardas de límites/asociación. Otros aislamientos producen `0A000` sin persistir escrituras propias de la operación; exige nueva transacción. DML exclusivo de metadatos sin esas guardas conserva comportamiento. Es una modificación explícita del contrato técnico, no del conteo ni de las reglas de venta.

## Transiciones

| Operación | Estado anterior → posterior |
|---|---|
| Reserva pendiente | Añade reserva privada con vencimiento de 10 minutos; consumo +1. |
| Confirmación válida | Sustituye pendiente por Registration y Ticket `valid`; consumo sin cambio. |
| Vencimiento | Pendiente deja de contar; Registration no se borra. |
| Uso/revocación de Ticket | Estado de Ticket cambia; consumo de Registration permanece. |
| Edición aceptada | Reemplaza solo campos solicitados; todo límite establecido cubre consumo y asignación aplicable. |
| Edición rechazada | Límites y metadatos conservan valores anteriores; no se emite ni revoca Ticket. |
| Activación sobre legacy | Ningún cambio de límites, registros o Tickets. |

## Migraciones implementadas

`supabase/migrations/20261005150000_protect_capacity_limits.sql` reemplaza funciones/definiciones de triggers mediante DDL versionado. `20261005151000_authorize_configuration_before_lock.sql` corrige la autorización anterior al lock sin reescribir la primera. Incluye guardas inmediatas de consumo y bloqueo, dos constraint triggers de asignación, RPC de configuración, grants y guardia de aislamiento de configuración; registro conserva la guardia previa de 003. Conservar RLS en las cuatro tablas; no modificar políticas de listas/puerta/exportación. Los agregados usan bigint; límites siguen siendo integer positivos.

Ver [contrato de base de datos](contracts/database-capacity.md) para eventos exactos, permisos y rollback. Ambas se aplicaron únicamente en instalaciones locales de pruebas; ver [evidencia](quickstart.md).
