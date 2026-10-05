# Reservas verificadas por email

## Objetivo

Una persona reserva una entrada, demuestra control del email mediante enlace y solo entonces recibe Registration y Ticket. Un email puede tener una entrada confirmada por evento.

## Reglas

- Una reserva pendiente retiene un cupo durante exactamente 10 minutos. El enlace contiene un token aleatorio de al menos 256 bits; la base guarda solo su hash. La respuesta pública no contiene token ni código de Ticket.
- Confirmar requiere token vigente y de un solo uso. La operación convierte la reserva en Registration y Ticket en una transacción. Al vencer, deja de contar para el cupo; un nuevo intento puede reemplazarla.
- Reservas y registros confirmados se cuentan juntos para disponibilidad y validaciones de aforo. Una Registration confirmada sigue consumiendo cupo aunque su Ticket esté revocado. Las reservas pendientes nunca aparecen como asistentes ni en auditoría de Tickets.
- Reserva y confirmación se serializan mediante el lock del Event, con conteos posteriores al lock y aislamiento READ COMMITTED. El vencimiento se comprueba con el reloj real después de la espera.
- Toda reserva nueva comprueba también el aforo global, incluso en eventos heredados cuya suma de cupos exceda el aforo. No se sanea el pasado: con aforo 2, cupos General 1 y VIP 1, y consumo General 2/VIP 0, la tercera reserva se rechaza; una confirmación convierte su cupo pendiente en confirmado sin consumir otro lugar. La disponibilidad pública no anuncia más lugares que el aforo global restante.
- Se conserva la unicidad de Registration por email normalizado y evento. Los Tickets emitidos antes del cambio se conservan como confirmados; no se exige verificación retroactiva.
- Si falla el envío del correo de confirmación antes de aceptar la solicitud, la reserva se cancela y libera cupo. Si falla el correo de Ticket tras confirmar, el Ticket permanece emitido y el enlace de entrada puede mostrarse al titular que confirmó.
- La RPC pública de emisión directa deja de ser ejecutable por `anon` y `authenticated`; toda emisión nueva pasa por la confirmación.

## Contrato

- `POST /api/registrations` acepta `{ eventId, ticketTypeId, name, email }` y responde `202 { status: "pending", expiresAt }` sin Ticket.
- `POST /api/registrations/confirmar` acepta `{ token }`; responde `200 { registrationId, ticketCode, emailSent }` tras confirmar. Los errores son `{ error: string }` con HTTP real.
- El enlace abre una página de confirmación que exige un botón POST, evitando que una vista previa de correo consuma el token.

## Criterios de aceptación

- Con cupo 2, una Registration y una reserva pendiente impiden una tercera reserva; tras 10 minutos la tercera se acepta sin borrar la Registration.
- Dos confirmaciones simultáneas del mismo token emiten un solo Ticket. Un token vencido o repetido no emite otro.
- Con aforo heredado 2, cupos General 1/VIP 1 y dos registros General, una reserva VIP se rechaza aunque VIP no tenga consumo; las dos ocupaciones originales permanecen intactas.
- Un email con Ticket confirmado no obtiene otra entrada para el mismo evento; una reserva vencida de ese email permite un intento nuevo si no hay Registration.
- El recorrido E2E captura el correo de confirmación simulado, confirma y recibe después el Ticket con QR.
