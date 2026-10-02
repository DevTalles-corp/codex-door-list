# Contract: Protección PostgreSQL

## RPC `update_event_configuration`

Argumento persistencia `p_request jsonb`, con objeto camelCase: `eventId` del selector, `event` y `ticketType` según [API](event-configuration.md). La ruta añade `eventId` validado; callers autenticados también pueden invocarla sin el panel.

Resultado JSON `{ eventId, ticketTypeId }`; errores por excepción, nunca `{ error }` después de escrituras parcialmente realizadas. `SECURITY INVOKER`, `VOLATILE`, `search_path = ''`; relaciones/nombres cualificados; revocar ejecución de PUBLIC/anon y otorgar solo a authenticated. Comprobar `auth.uid()` y `events.created_by` explícitamente, además de políticas RLS; no revelar cifras de otro owner.

### Protocolo de transacción

1. Validar shape/valores y aislamiento `READ COMMITTED`.
2. Bloquear Event `FOR UPDATE`, comprobar propiedad; después bloquear el tipo solicitado y comprobar pertenencia. Un Event por llamada.
3. En consultas posteriores al bloqueo, contar Registrations por evento/tipo y calcular suma final de cupos con bigint.
4. Agregar infracciones de cada límite solicitado, más asignación final cuando la petición afecta límites. Si falta un límite en el patch, no exigir saneamiento de su consumo legacy.
5. Si hay infracciones, lanzar excepción antes de escribir. Si no, diferir solamente `events_capacity_assignment_check` y `ticket_types_capacity_assignment_check`, aplicar campos presentes, forzar esas restricciones a IMMEDIATE y devolver éxito.
6. Cualquier error revierte toda la RPC: límites y metadatos. No capturar error para devolver éxito ni continuar tras una escritura fallida.

No mover tipos ni crear/borrar entidades en esta RPC. No usar flags para deshabilitar validación ni aforo temporal. Lecturas externas observan el commit final.

## Guardas de tabla y restricciones

| Tabla / disparo | Regla y bloqueo |
|---|---|
| Event BEFORE `UPDATE OF max_capacity` | Validar aislamiento; fila Event ya bloqueada por UPDATE; contar registros después del lock; rechazar nuevo aforo < consumo total, también mismo valor. |
| TicketType BEFORE `INSERT OR UPDATE OF event_id,max_capacity` | Obtener Event destino `FOR UPDATE NOWAIT`. Ante traslado real, coordinar también Event origen por IDs ordenados con NOWAIT; FK vigente conserva prohibición de mover tipos con registros. No confundir este trigger de bloqueo con consumo. |
| TicketType BEFORE `UPDATE OF max_capacity` | Con lock Event obtenido antes por orden explícito de triggers, contar registros del tipo; rechazar cupo < consumo, incluso mismo valor. Requerir READ COMMITTED. |
| Event AFTER constraint `UPDATE OF max_capacity` | `events_capacity_assignment_check`, DEFERRABLE INITIALLY IMMEDIATE: consultar Event final y suma final, exigir aforo ≥ suma. |
| TicketType AFTER constraint `INSERT OR UPDATE OF event_id,max_capacity` | `ticket_types_capacity_assignment_check`, DEFERRABLE INITIALLY IMMEDIATE: consultar asociación/configuración final por ID; exigir suma ≤ aforo. |

Ordenar/nombrear triggers BEFORE para que el lock se obtenga antes del conteo. Guardas de conteo/bloqueo de tabla usan SECURITY DEFINER para visión completa, con `search_path = ''` y ejecución directa revocada. No cambiar permisos de lectura/escritura ordinarios ni deshabilitar RLS.

Los validadores diferidos consultan filas actuales en su evaluación, no valores NEW históricos; si la entidad fue eliminada antes del flush, omiten su chequeo. No validan consumo de límites legacy no solicitados. Las ediciones solo `title`/`name` no activan capacidad. No añadir `WHEN OLD.max_capacity IS DISTINCT FROM NEW.max_capacity`.

DML independiente valida consumo inmediatamente y asignación al fin de sentencia. SQL conjunto externo puede diferir las dos restricciones por nombre; debe satisfacerlas al commit. No puede diferir la protección inmediata de consumo. La RPC constituye la superficie conjunta del producto y agrega todos sus errores; dos sentencias DML independientes no son una única petición conjunta del panel.

## Registro y concurrencia

`register_for_event(uuid,uuid,text,text)` conserva firma `(status, registration_id, ticket_code)`, estados, cuenta por tipo, unicidad y emisión. En nueva migración añadir la guardia de aislamiento especificada en FR-012; no alterar cuerpo de negocio. Usa Event→TicketType y mantiene ambos locks hasta fin de transacción.

Desde datos consistentes, ventas y edición válidas se serializan: venta primero incrementa conteo visto por la edición; edición primero cambia cupo visto por registro. Nunca contar en la misma consulta que puede esperar por Event. Functions de escritura/conteo son VOLATILE.

DML directo de tipo ya sostiene lock del tipo y no puede reordenarlo. NOWAIT sobre Event evita círculo; `55P03` aborta y requiere reintentar la transacción completa. No prometer ausencia total de errores técnicos en transacciones externas arbitrarias ni convertirlos en «vendidas».

**Contrato de aislamiento (FR-012, US3.4–US3.5)**: READ COMMITTED es obligatorio para `register_for_event`, toda `update_event_configuration` (incluidos patches de solo metadatos) y DML que active guardas de aforo, cupo o asociación de TicketType. Otros aislamientos se rechazan con `0A000` antes de persistir escrituras propias de la operación, conservando sus límites, Registrations y Tickets. DML de solo metadatos que no active guardas mantiene comportamiento vigente. Este rechazo modifica la compatibilidad técnica de callers SQL; no es falta de cupo ni contención transitoria y requiere una nueva transacción READ COMMITTED. Los flujos HTTP ordinarios usan READ COMMITTED; si el endpoint recibe `0A000`, devuelve 500 propio y no lo normaliza como 503 reintentable por contención.

## Error interno de capacidad

SQLSTATE `23514`; `DETAIL` JSON:

```json
{
  "kind": "capacityViolation",
  "version": 1,
  "violations": [
    { "scope": "event", "reason": "registrationConsumption", "requestedCapacity": 3, "minimumCapacity": 4 },
    { "scope": "ticketType", "reason": "registrationConsumption", "ticketTypeId": "<uuid>", "ticketTypeName": "VIP", "requestedCapacity": 1, "minimumCapacity": 2 }
  ]
}
```

`assignedCapacity` es causa separada, de scope event, con mínimo igual a suma final. Validar marcador, versión, enums, identificadores, nombres y números antes de formatear. Unknown/malformed DETAIL produce fallback propio; no mostrar `.message`/`.hint` del proveedor. `lib/types.ts` centraliza los tipos; `lib/errors.ts` decodifica y compone copy; la API devuelve solo `{ error: string }`.

Supabase Data API mantiene sobre PostgREST y status nativo: capacidad `23514` normalmente 400; contención `55P03` normalmente 500. El contrato HTTP del producto normaliza respectivamente 409 y 503. No confundir ambos contratos.

## Upgrade, permisos y límites

Todos los DDL exclusivamente en nueva migración versionada. Reemplazar las definiciones actuales en esa migración; no editar historial, no ejecutar SQL suelto como mecanismo de esquema. Sin backfill ni scan para validar registros previos. Mantener tablas, índices, constraints de valores positivos, FK/unique y RLS. Los límites y filas legacy se conservan al aplicar; sus solicitudes posteriores explícitas sí se validan.

La garantía cubre vías normales de aplicación y DML con guardas habilitadas, también roles privilegiados que no las deshabiliten. No promete impedir que un administrador altere/desactive el esquema. Operaciones de escritura necesitan READ COMMITTED; pruebas deben comprobar rechazo de otros aislamientos.
