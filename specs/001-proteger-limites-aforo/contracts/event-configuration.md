# Contract: Configuración de Event y TicketType

## PATCH `/api/eventos/[id]/configuracion`

Nueva interfaz para editar un Event existente y opcionalmente un TicketType del mismo evento en una transacción. Los formularios individuales también la usan con un solo patch. No añade un editor conjunto nuevo: la petición conjunta puede realizarse mediante API y probarse independientemente del panel.

**Auth**: `Authorization: Bearer <session.access_token>`. Validar token con Supabase Auth y propiedad del Event. Nunca usar service-role para suplir permisos de usuario.

**Content-Type**: `application/json`. Identificador de ruta UUID.

### Request

```json
{
  "event": { "maxCapacity": 2 },
  "ticketType": { "id": "<ticket-type-uuid>", "maxCapacity": 1 }
}
```

| Campo | Semántica |
|---|---|
| `event` | Patch opcional: `title`, `description`, `eventDate`, `venue`, `status`, `maxCapacity`. Al menos un campo permitido si está presente. |
| `ticketType` | Patch opcional: `id` requerido, `name`, `maxCapacity`. Debe pertenecer al Event de ruta y contener al menos un campo a editar. |
| `maxCapacity` | Integer positivo ≤ 2147483647; null, cadenas y fracciones rechazados. En TicketType, configurar este número declara el límite estricto; los cupos heredados conservan esa interpretación. Presencia solicita validación aunque sea el valor guardado; omisión significa no establecer el límite. |
| `description` | String o null, preservando semántica del editor actual. |
| `eventDate` | Fecha válida con offset, normalizada a UTC; reutilizar helpers actuales. No crear nueva política de calendario. |
| `status` | `draft` o `published`; no introducir nueva condición de publicación. |
| `title`, `venue`, `name` | Strings no vacíos conforme a validación vigente. |

Rechazar campos desconocidos y request vacío. Esta operación no crea/borrar entidades ni mueve tipos entre eventos. Las vías existentes de creación/borrado/traslado conservan comportamiento y guardas de tabla; sus errores también deben normalizarse si pasan por el panel.

### Response y errores

Éxito `200`:

```json
{ "eventId": "<event-uuid>", "ticketTypeId": "<ticket-type-uuid-or-null>" }
```

`ticketTypeId` será JSON null si la petición no incluye tipo; el ejemplo representa el marcador, no un UUID válido.

Todo error de esta API tiene exactamente `{ "error": "<mensaje español del producto>" }`.

| HTTP | Causa |
|---|---|
| 400 | UUID/JSON/campos/valores inválidos. |
| 401 | Sin sesión válida. |
| 403 | Usuario válido sin propiedad de un Event visible. No devolver conteos. |
| 404 | Event inexistente/inaccesible por RLS, o tipo inexistente/no perteneciente al evento autorizado. |
| 409 | Configuración incompatible con consumo/asignación confirmados, o conflicto de datos reconocido como nombre duplicado. |
| 503 | Servicio indisponible o contención transitoria reconocida (`55P03`, `40P01`, `40001`); pedir reintento sin atribuirlo a ventas. |
| 500 | Fallo inesperado o `0A000` por aislamiento mal configurado; fallback propio, sin mensajes crudos del proveedor. `0A000` no es contención ni falta de cupo. |

El status 409 corresponde al estado confirmado que impide aceptar la configuración. Esta traducción pertenece al Route Handler; no asumir que el Data API directo de Supabase utiliza el mismo sobre/status.

El cliente HTTP no elige aislamiento. La RPC requiere READ COMMITTED para toda petición, incluso solo metadatos (FR-012); callers SQL externos deben cumplir ese contrato y abrir una nueva transacción READ COMMITTED ante `0A000`, sin repetir en la transacción rechazada.

### Copy de rechazos por capacidad

- Tipo: «No puedes fijar el cupo VIP en 1: ya hay 2 entradas VIP que ocupan cupo.»
- Evento: «No puedes fijar el aforo del evento en 2: ya hay 3 entradas en total que ocupan cupo.»
- Asignación: «No puedes fijar el aforo del evento en 3: los cupos asignados suman 6.»
- Múltiples: incluir cada frase correspondiente en un solo resumen; no detenerse en el primer límite inválido. Para aforo 3 y VIP 1 con cuatro registros totales/dos VIP, mostrar ambas cifras 4 y 2; añadir suma asignada si también infringe esa regla.

Cuando corresponda a un rechazo por consumo, aclarar que las entradas revocadas con registro guardado siguen contando. Nombre del tipo tomado de PostgreSQL, sin interpretar HTML. No usar cifras del dashboard ni proveedor `.message` como copy.

## Adaptación del panel

- Conservar inputs y editar estado ante rechazo; feedback `role="alert"` cerca del formulario. Éxito propio con `role="status"`.
- Modelar `idle`, `submitting`, `success`, `error`; deshabilitar envío/acciones conflictivas durante operación, anunciar «Guardando evento…» o «Guardando tipo de entrada…».
- Registrar intención de establecer cada límite. Límite no tocado en edición de metadatos se omite; límite tocado/reestablecido al valor original se incluye. No decidir solo mediante desigualdad de valores.
- Comprobar `response.ok` antes de interpretar el resultado; en fallo leer el sobre de error propio; cuerpos desconocidos usan fallback.
- La lista operativa y métricas `valid`/`used` se conservan. No usar un `min` HTML basado en ellas como autoridad; la cifra de rechazo procede del intento confirmado.
- Mantener `/organizador/page.tsx` servidor. El editor conserva cliente por estado/handlers/sesión de navegador; no convertir páginas o layouts nuevos en cliente.

## Registro existente

`POST /api/registrations` conserva request `eventId`, `ticketTypeId`, `name`, `email`; respuesta `201` con `registrationId`, `ticketCode`, `emailSent`; errores existentes 400/404/409/500/503. No añadir un estado de venta global nuevo ni modificar unicidad, email/QR o conteo. FR-012 modifica solo el contrato de aislamiento de `register_for_event`: callers SQL fuera de READ COMMITTED reciben `0A000` sin emisión ni registro; la ruta HTTP sigue usando READ COMMITTED.
