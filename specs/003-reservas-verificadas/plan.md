# Plan: reservas verificadas

## Implementación

Migración `20261005110000_verified_reservations.sql`: reservas privadas con hash, caducidad, consumo conjunto, reserva/confirmación transaccionales bajo lock del Event. Solo service_role puede ejecutar las RPC de emisión. Rutas POST con contratos camelCase; correo de confirmación y correo de Ticket separados. Página GET sin mutación y botón de confirmación explícito.

## Verificación

Casos SQL y HTTP comprueban 10 minutos, unicidad, consumo, caducidad y liberación tras error de email. El recorrido Playwright captura ambos correos simulados y escanea el Ticket. Las carreras deben demostrar una sola emisión y un solo ganador para el último cupo mediante sesiones independientes.

## Constitution Check

III: política explícita de una entrada por email/evento y liberación de pendientes. IV: pendientes vigentes más Registration consumen cupo; revocadas conservan consumo. I: reglas documentadas antes de implementar y migración nueva. Evidencia ejecutada en `verification.md`.
