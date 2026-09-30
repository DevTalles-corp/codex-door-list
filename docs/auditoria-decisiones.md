# Auditoría de decisiones de producto implícitas

**Fecha:** 30 de septiembre de 2026  
**Alcance:** comportamiento implementado en `app/`, `lib/` y migraciones. Se comparó con `PRODUCT.md` y la documentación del repositorio. Aquí «implícita» significa que el código fija una política concreta que no aparece decidida con ese grado de precisión en la documentación de producto. No implica que la política sea incorrecta ni que haya que cambiarla.

## Descubrimiento y publicación

### 1. La Paz es la zona horaria de todos los eventos

- **Dónde vive:** [`lib/dates.ts`](../lib/dates.ts#L3) y las comprobaciones SQL de [registro](../supabase/migrations/20260831120000_add_public_registrations.sql#L77) y [acceso](../supabase/migrations/20260923155132_add_ticket_check_in.sql#L42).
- **Supuesto al escribirla:** todos los eventos y organizadores operan con el calendario de Bolivia; «hoy» y el cierre de un evento significan lo mismo para todos.
- **Otra opción razonable:** guardar una zona horaria por evento y usarla para mostrar fechas, abrir o cerrar registros y permitir el ingreso.

### 2. El registro sigue abierto durante todo el día del evento

- **Dónde vive:** [`registrationIsOpen`](../lib/dates.ts#L81) y [`register_for_event`](../supabase/migrations/20260901120000_emit_registration_tickets.sql#L100).
- **Supuesto al escribirla:** un evento publicado acepta nuevas inscripciones incluso después de su hora de inicio, hasta que termina la fecha local.
- **Otra opción razonable:** cerrar a la hora de inicio, o permitir que el organizador configure una hora de cierre independiente.

### 3. Publicar no exige tener entradas configuradas

- **Dónde vive:** selector de estado de [`app/organizer.tsx`](../app/organizer.tsx#L33), consulta de eventos [publicados](../supabase/migrations/20260915170000_add_public_event_list.sql#L34) y estado de [registro sin tipos](../app/eventos/%5Bid%5D/registro/public-registration.tsx#L276).
- **Supuesto al escribirla:** es aceptable que un evento sea visible mientras todavía no ofrece una entrada reservable.
- **Otra opción razonable:** exigir al menos un tipo de entrada con cupo antes de publicar, o mantener el evento oculto hasta completar esa configuración.

### 4. El catálogo público conserva eventos agotados, pero retira los pasados

- **Dónde vive:** filtro de [`app/event-list.tsx`](../app/event-list.tsx#L113) y render de su [acción de reserva](../app/event-list.tsx#L29).
- **Supuesto al escribirla:** un evento agotado todavía merece visibilidad, aunque ya no permita reservar; uno cuya fecha pasó deja de ser útil para descubrir.
- **Otra opción razonable:** ocultar también los agotados para mostrar solo acciones posibles, o conservar los eventos pasados como archivo o referencia del organizador. El enlace directo de un evento publicado sigue siendo una superficie distinta del catálogo.

### 5. «Publicado» puede revertirse y la primera publicación sigue siendo la fecha de referencia

- **Dónde vive:** edición del estado en [`app/organizer.tsx`](../app/organizer.tsx#L33) y trigger de [`published_at`](../supabase/migrations/20260910120000_add_event_publication_timestamp.sql#L8); la [métrica diaria](../app/api/eventos/%5Bid%5D/registros-por-dia/route.ts#L82) usa esa fecha.
- **Supuesto al escribirla:** retirar y volver a publicar es una pausa del mismo lanzamiento, no una publicación nueva; el historial de actividad debe arrancar en la primera vez.
- **Otra opción razonable:** hacer irreversible la publicación, o registrar cada período publicado y mostrar métricas por período.

## Cupos y registro

### 6. El aforo se reparte en cupos rígidos por tipo

- **Dónde vive:** validación de suma en [`validate_ticket_type_capacity`](../supabase/migrations/20260828120000_add_event_capacity_guard.sql#L4) y control de cupo por tipo en [`register_for_event`](../supabase/migrations/20260901120000_emit_registration_tickets.sql#L115).
- **Supuesto al escribirla:** cada tipo reserva una porción exclusiva del aforo; si uno se agota, no toma lugares sin usar de otro, aunque el evento aún tenga capacidad física.
- **Otra opción razonable:** usar el aforo global como límite y aplicar cupos por tipo solo cuando el organizador los configure como cuotas estrictas.

### 7. Un email solo puede reservar una vez por evento

- **Dónde vive:** índice único de [`registrations`](../supabase/migrations/20260831120000_add_public_registrations.sql#L24) y respuesta `duplicate_registration` de [`register_for_event`](../supabase/migrations/20260901120000_emit_registration_tickets.sql#L127).
- **Supuesto al escribirla:** email equivale a una persona y a una sola plaza, sin importar el tipo de entrada elegido.
- **Otra opción razonable:** permitir varias entradas por email para familias o grupos y distinguir a cada asistente por nombre o por entrada.

### 8. Cada registro emite exactamente una entrada individual

- **Dónde vive:** relación única `tickets.registration_id` en la [migración de entradas](../supabase/migrations/20260901120000_emit_registration_tickets.sql#L3), inserción de una entrada en [`register_for_event`](../supabase/migrations/20260901120000_emit_registration_tickets.sql#L147) y formulario sin cantidad en [`public-registration.tsx`](../app/eventos/%5Bid%5D/registro/public-registration.tsx#L282).
- **Supuesto al escribirla:** quien completa el formulario reserva su propia entrada; no existe una compra o reserva de varias plazas en una operación.
- **Otra opción razonable:** permitir seleccionar cantidad e identificar a cada asistente, o emitir varias entradas administradas por un contacto principal.

### 9. La dirección de email no se verifica antes de reservar el cupo

- **Dónde vive:** [`register_for_event`](../supabase/migrations/20260901120000_emit_registration_tickets.sql#L88) crea registro y entrada en la misma operación; el [envío de email](../app/api/registrations/route.ts#L95) sucede después.
- **Supuesto al escribirla:** reducir pasos de registro pesa más que comprobar la titularidad del correo antes de consumir capacidad.
- **Otra opción razonable:** reservar provisionalmente y confirmar el cupo al verificar el email, con una caducidad para reservas sin confirmar.

### 10. La reserva cuenta como éxito aunque falle la entrega por email

- **Dónde vive:** la API devuelve `201` con [`emailSent: false`](../app/api/registrations/route.ts#L99), y la [confirmación](../app/eventos/%5Bid%5D/registro/public-registration.tsx#L228) ofrece el enlace de entrada.
- **Supuesto al escribirla:** el resultado principal es la entrada creada; el correo es un canal adicional y la persona puede guardar el enlace en la visita actual.
- **Otra opción razonable:** dejar la reserva pendiente hasta confirmar la entrega, o añadir un mecanismo de recuperación autónoma cuando el email no llegue.

## Entrada y operación en puerta

### 11. Poseer el enlace equivale a poder consultar la entrada

- **Dónde vive:** [`get_public_ticket`](../supabase/migrations/20260901120000_emit_registration_tickets.sql#L30) permite consulta pública por código e incluye nombre y email; la [página de entrada](../app/entradas/%5Bcode%5D/public-ticket.tsx#L179) los presenta en sus datos de respaldo.
- **Supuesto al escribirla:** un código aleatorio y difícil de adivinar basta como credencial; compartir el enlace también comparte el acceso a esos datos y al QR.
- **Otra opción razonable:** pedir una segunda comprobación para ver datos personales, o entregar una vista pública mínima que solo muestre lo necesario para ingresar.

### 12. Solo el creador del evento puede operar la puerta

- **Dónde vive:** comprobación `created_by = auth.uid()` en [`check_in_ticket`](../supabase/migrations/20260923155132_add_ticket_check_in.sql#L13), autorización de la [API de ingreso](../app/api/entradas/check-in/route.ts#L43) y filtro de eventos del [lector](../app/scan/scan-screen.tsx#L233).
- **Supuesto al escribirla:** la cuenta del organizador también es la cuenta de quien valida entradas; no hay personal de puerta con permisos delegados.
- **Otra opción razonable:** invitar operadores por evento con un rol limitado a búsqueda y check-in, sin acceso a edición o exportación.

### 13. El ingreso es único, automático y solo vale el día del evento

- **Dónde vive:** [`check_in_ticket`](../supabase/migrations/20260923155132_add_ticket_check_in.sql#L42) cambia `valid` a `used` en la validación; el [lector](../app/scan/scan-screen.tsx#L47) envía el código al leerlo y muestra «Ingreso registrado».
- **Supuesto al escribirla:** cada entrada autoriza un solo acceso en una única fecha local; escanearla es suficiente para registrar el ingreso, sin confirmación adicional del personal.
- **Otra opción razonable:** separar consulta y confirmación, permitir reingresos controlados o configurar una ventana de acceso para eventos que cruzan la medianoche.

### 14. Los estados revocados desaparecen de la lista operativa y del CSV

- **Dónde vive:** filtro de entradas activas en [`getOrganizerEventDashboard`](../lib/organizer-dashboard.ts#L40), construcción de [registros visibles](../lib/organizer-dashboard.ts#L118) y [exportación](../app/api/eventos/%5Bid%5D/asistentes/route.ts#L44) desde esa misma lista.
- **Supuesto al escribirla:** una entrada revocada ya no forma parte de los asistentes que la operación necesita ver o exportar.
- **Otra opción razonable:** mostrarla como revocada con un filtro y conservarla en una exportación de auditoría, separada de la lista de acceso vigente.

### 15. Reenviar significa mandar la misma entrada al email original

- **Dónde vive:** acción de [reenviar](../app/dashboard/%5Bid%5D/event-dashboard.tsx#L423) y armado del destinatario a partir del registro en la [API](../app/api/eventos/%5Bid%5D/reenviar-entrada/route.ts#L68).
- **Supuesto al escribirla:** el problema de entrega se resuelve repitiendo el envío; el nombre, email y código del registro no necesitan corregirse durante ese flujo.
- **Otra opción razonable:** permitir corregir el email bajo control del organizador antes de reenviar, con constancia del cambio.

## Para decidir explícitamente

Las decisiones con mayor efecto en políticas futuras son **identidad y cantidad de entradas** (7–9), **calendario de registro e ingreso** (1–2, 13), **delegación de acceso** (12) y **visibilidad de datos y revocaciones** (11, 14). Este documento registra opciones para discusión; no propone cambiar el comportamiento actual sin una decisión de producto.
