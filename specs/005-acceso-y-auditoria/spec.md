# Acceso de puerta, privacidad y auditoría

## Objetivo

La puerta tiene permiso independiente por Event; la URL pública del Ticket no expone datos personales y la auditoría incluye Tickets revocados.

## Reglas

- El owner puede operar la puerta automáticamente y asignar o retirar permiso de puerta a otras cuentas Auth existentes con email verificado. La asignación es inmediata; para un email sin cuenta verificada se solicita registro previo.
- El permiso de puerta solo habilita lista de eventos de puerta, búsqueda por email y check-in de ese Event. No concede edición, panel de asistentes ni exportación. Su revocación se aplica a la siguiente solicitud.
- `get_public_ticket` devuelve código, estado, Event y TicketType; no devuelve nombre ni email. La página y el título del QR tampoco muestran esos datos. El correo privado al titular puede incluir su nombre.
- El enlace público de registro usa un código de Event de 256 bits generado con CSPRNG; los UUID internos se usan solo como identificadores de persistencia y en rutas autenticadas. Los enlaces públicos anteriores con UUID deben regenerarse desde el panel.
- Un Event o TicketType con Tickets emitidos no puede eliminarse por cascada: sus registros se conservan para auditoría, incluidos los revocados.
- La lista operativa y CSV actual siguen excluyendo revocadas. Un CSV de auditoría separado, accesible solo al owner, incluye todos los Tickets y sus estados, emisión, check-in y revocación. Las revocaciones nuevas guardan `revoked_at`; las anteriores dejan esa fecha vacía porque no se conoce con certeza.

## Criterios de aceptación

- Staff asignado a A puede buscar e ingresar en A, pero recibe 403 en B y en edición/exportación de A. Tras retirarle el permiso recibe 403 en A.
- Una cuenta no verificada o inexistente no puede ser asignada. El owner conserva acceso de puerta.
- La URL pública no contiene nombre/email en HTML ni respuesta RPC; el CSV de auditoría incluye una revocada que no figura en el CSV operativo.
