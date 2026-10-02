# Research: Proteger límites de aforo

**Date**: 2026-10-02 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Investigación sobre archivos locales, documentación actual de Context7 y fuentes primarias PostgreSQL/PostgREST. Se despachó un agente de investigación de solo lectura para contrastar concurrencia, legacy y atomicidad. No se ejecutaron consultas contra una base remota ni cambios de esquema. Las decisiones técnicas están documentadas; la resolución del gate constitucional sigue pendiente y la ejecución se validará después de autorizar implementación conforme a ese gate.

## 1. Aprovechar la aplicación existente

**Decision**: Mantener Next.js 16.3.3, React 19.2.8, TypeScript 5.9.3, Tailwind 4.3.3, Supabase JS 2.112.4 y Resend 6.25.0, resueltos en `package-lock.json`. Server Components por defecto, editor cliente existente como frontera interactiva; nuevo Route Handler servidor para traducción de contratos.

**Rationale**: `/organizador/page.tsx` ya es Server Component y `app/organizer.tsx` requiere estado, handlers, efectos y sesión del navegador. No hace falta una migración de autenticación a cookies ni otro framework. Context7 confirma la composición de páginas servidor con subárboles cliente. El índice no tiene una versión exacta 16.3.3, limitación registrada sin asumir APIs específicas.

**Alternatives considered**: Convertir la página en cliente; reescribir el editor con Server Actions; introducir `@supabase/ssr`. Amplían alcance sin resolver una regla que debe estar en PostgreSQL.

**Source**: [Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components).

## 2. Consumo y vocabulario

**Decision**: Contar `registrations` directamente con `count(*)`, por `event_id` o `ticket_type_id`, sin join/filtro por Tickets. Mantener cuatro entidades y todos los cupos estrictos actualmente configurados.

**Declaration semantics**: Según la spec aclarada, el organizador declara el límite estricto al configurar el cupo numérico obligatorio. `maxCapacity` se persiste en `ticket_types.max_capacity`; los valores heredados se interpretan como límites configurados, sin afirmar que existe una auditoría de su autoría. No se añade indicador de modo ni se infiere estrictez del consumo o estado de Ticket. US1.6 comprueba tipos nuevos y existentes.

**Rationale**: La definición efectiva de `register_for_event` en la migración de renombrado cuenta registros guardados del tipo. Revocar/utilizar un Ticket no elimina Registration. `lib/organizer-dashboard.ts` filtra revocadas y no puede proporcionar el mínimo. Los índices por evento/email y tipo ya sirven para los conteos. Aforo global está garantizado desde datos consistentes por cupos estrictos + suma asignada ≤ aforo; no añadir una regla de venta global nueva para legacy.

**Alternatives considered**: Contar solo Tickets activos; usar cifras del dashboard; mantener contadores nuevos; crear modo de cupo. Cambian FR-008/010 o añaden estado sincronizado innecesario.

## 3. Autoridad y errores

**Decision**: Guardas SQL para toda edición; RPC `update_event_configuration` para peticiones conjuntas; endpoint de producto `PATCH /api/eventos/[id]/configuracion` con contratos camelCase y errores `{ error: string }`. Normalizar `DETAIL` JSON reconocido y versionado; renderizar mensajes propios mediante `lib/errors.ts`.

**Rationale**: El panel actual usa DML independiente y reduce cualquier `23514` a una frase genérica sin cifras. RPC agrega todas las infracciones antes de escribir; trigger protege operaciones que no pasan por el endpoint. Auth validado y propiedad comprobada antes de devolver consumo. La RPC será `SECURITY INVOKER`, con RLS y grants solo autenticados. Las guardas de tabla que cuentan registros usarán `SECURITY DEFINER` con `search_path = ''` y nombres cualificados, para que un escritor no obtenga una validación parcial por su visibilidad RLS; no estarán expuestas como RPC de consulta.

**Alternatives considered**: Validación solamente React; mostrar `error.message` del proveedor; regex de texto SQL español; inferir aforo de cualquier `23514`; exponer PostgREST sin normalización. Son insuficientes para autoridad, múltiples causas y contrato API.

**Sources**: [Supabase: Database Functions](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). PostgREST usa un sobre de error propio; `23514` cae en HTTP 400, `55*` en 500 y permisos autenticados en 403. El endpoint normaliza restricciones de capacidad a 409 y contención a 503, sin alterar el Data API externo. [PostgREST: Errors](https://docs.postgrest.org/en/stable/references/errors.html).

## 4. Locks, snapshots y vías externas

**Decision**: Usar Event como exclusión por evento. RPC y registro toman Event antes de TicketType. Guardas de tipo que llegan desde DML directo obtienen Event con `NOWAIT`; contención aborta la transacción, que puede reintentarse completa. Conteos después del lock en consultas separadas y funciones `VOLATILE`; exigir `READ COMMITTED` en registro y escritura de límites.

**Rationale**: UPDATE directo bloquea primero TicketType y su BEFORE trigger intenta Event: el orden actual se invierte respecto del registro y puede formar un deadlock. `NOWAIT` evita la espera circular sin fingir que un trigger reordena locks ya adquiridos. Consultar conteo en la misma sentencia que espera por lock puede usar snapshot anterior; separar consultas en funciones VOLATILE permite el snapshot actualizado bajo READ COMMITTED. FR-012 documenta el cambio de compatibilidad: otros aislamientos se rechazan con `0A000` antes de persistir escrituras propias de la operación, también para patches de solo metadatos por RPC; DML aislado de metadatos que no active guardas no cambia. No se interpreta como falta de cupo ni contención; exige nueva transacción READ COMMITTED. La firma/estados y reglas de negocio del registro siguen iguales. US3.4–US3.5 contrastan funcionamiento ordinario y rechazos técnicos.

**Alternatives considered**: Confiar solo en detección de deadlocks; contar antes del lock; marcar validadores STABLE; prometer seguridad bajo cualquier aislamiento sin versionado adicional. Un token/version nuevo o serialización con reintentos también sería viable, pero añade escrituras y modifica más la operación vigente.

**Sources**: [PostgreSQL 17: Explicit Locking](https://www.postgresql.org/docs/17/explicit-locking.html), [Function Volatility](https://www.postgresql.org/docs/17/xfunc-volatility.html), [Transaction Isolation](https://www.postgresql.org/docs/17/transaction-iso.html).

## 5. Atomicidad y suma final

**Decision**: Separar consumo inmediato y asignación diferible. Consumo escucha únicamente `UPDATE OF max_capacity`. Bloqueo de tipo escucha `INSERT OR UPDATE OF event_id,max_capacity`. Nuevos constraint triggers AFTER, DEFERRABLE INITIALLY IMMEDIATE, conservan suma de cupos ≤ aforo; la RPC difiere solo esas dos restricciones, aplica patches y fuerza comprobación inmediata antes de éxito. Leer filas finales, no valores NEW históricos.

**Rationale**: Para legacy con aforo 3 y tipo con cupo 10, solicitar conjuntamente 5 y 5 puede ser válido aunque ningún orden pase las guardas actuales: evento primero no cubre suma 10; tipo primero no cabe en aforo 3. Diferir únicamente asignación permite validar el resultado final sin suspender consumo. Consultar fila final también permite múltiples escrituras de una fila en una transacción diferida. Si se borró la fila antes de evaluación, se omite su validación. Números agregados bigint evitan overflow de sumas; columnas positivas integer se conservan.

**Alternatives considered**: Dos requests; ordenar siempre reducciones tipo→evento; staging con aforo temporal; flag que salte validación. Dos requests pierden atomicidad, el orden falla en legacy, staging añade escrituras y puede no representar sumas anteriores superiores a integer, y un bypass debilita autoridad.

**Source**: [PostgreSQL 17: CREATE TRIGGER](https://www.postgresql.org/docs/17/sql-createtrigger.html).

## 6. Activación y solicitudes al mismo valor

**Decision**: Migración nueva sin backfill ni validación masiva de filas previas. Presencia de `maxCapacity` en request significa establecer el límite, incluso si coincide con el almacenado. El editor registra intención/touched del control, no solo comparación de números. Ediciones de metadatos omiten límite y asociación no solicitados.

**Rationale**: FR-011 conserva datos al activar y exige validación de toda nueva solicitud explícita. `UPDATE OF` ya se activa con mismo valor; añadir `OLD IS DISTINCT FROM NEW` ocultaría esas solicitudes. El panel actual siempre envía límites y requiere ajustar el payload para no impedir cambios ajenos a aforo en legacy.

**Alternatives considered**: Sanear con aumentos automáticos; imponer corrección de cualquier límite al editar título; validar solo si número cambia. Contradicen FR-011.

## 7. Validación y límites del plan

**Decision**: pgTAP para reglas, permisos y errores; dos sesiones psql con barreras explícitas para concurrencia; upgrade de copia local anterior; Playwright para feedback y regresión del flujo existente. Runners aún por implementar; no afirmar pruebas pasadas en esta fase.

**Rationale**: Dos promesas HTTP simultáneas no demuestran ambos órdenes. Hay que retener locks, confirmar/abortar y comprobar estado final. Legacy debe cargarse antes de activar la migración, conservando fixtures y sin deshabilitar guardas nuevas para simularlo. Supabase CLI soporta migraciones versionadas y pruebas pgTAP.

**Alternatives considered**: Tests que solo comparen funciones de formato; azar temporal con sleeps; desactivar triggers nuevos para fabricar legacy. No prueban las garantías requeridas.

**Sources**: [Supabase: Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations), [Database Testing](https://supabase.com/docs/guides/local-development/testing/overview).

Las desviaciones constitucionales heredadas están registradas en la spec y mantienen el gate en FAIL. Contratos y modelo describen el diseño propuesto, no una aprobación. Resolver los conflictos mediante correcciones revisadas o una enmienda constitucional separada es prerrequisito de implementación; no se adopta aquí ninguna excepción.
