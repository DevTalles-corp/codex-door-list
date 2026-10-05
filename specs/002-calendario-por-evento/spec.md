# Calendario por evento

## Objetivo

Cada Event define su zona IANA, el instante de cierre de registro y el inicio y fin de ingreso. Todos los instantes se guardan en UTC; la zona se usa para presentar y editar horas locales. Ningún flujo deduce cierre o ingreso del día del evento.

## Reglas

- `time_zone` es una zona IANA válida; `registration_closes_at`, `entry_opens_at` y `entry_closes_at` son instantes obligatorios. `entry_opens_at < entry_closes_at`.
- El registro se admite mientras `now() < registration_closes_at` y el evento esté publicado. Una reserva iniciada antes del cierre puede confirmarse hasta su vencimiento.
- El ingreso se admite en `[entry_opens_at, entry_closes_at)` y solo si el evento está publicado y el Ticket es válido.
- El reloj de ingreso se comprueba después de obtener el lock del Ticket; esperar un lock no permite ingresar después del cierre.
- La zona se muestra junto a las horas en editor, eventos, entrada y correo. Cambiar solo la zona conserva los instantes UTC; cambiar una hora local requiere un valor con offset explícito. Una hora local ambigua o inexistente se rechaza hasta que el organizador elija un offset válido.
- Migración: todos los Event existentes reciben `America/La_Paz`. El cierre y fin de ingreso quedan al inicio del día local siguiente al `event_date`; el inicio de ingreso al inicio del día local del `event_date`. No se altera `event_date`.

## Criterios de aceptación

- Dos eventos con igual `event_date` y zonas distintas muestran horas locales distintas y respetan sus propios cierres.
- En el instante exacto del cierre no se crea una reserva; una creada un segundo antes sigue confirmable hasta su vencimiento.
- El check-in se rechaza un segundo antes de abrir y en el instante exacto de cerrar; se acepta dentro de la ventana.
- Un evento anterior a la migración conserva apertura e ingreso equivalentes a su comportamiento por día de La Paz.
