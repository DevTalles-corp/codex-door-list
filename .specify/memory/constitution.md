<!--
Sync Impact Report
- Version change: unversioned scaffold → 1.0.0 (initial constitution).
- Modified principles: five template placeholders → I. Especificación y migraciones;
  II. Calendario por evento; III. Identidad y reservas; IV. Aforo verificable;
  V. Acceso, roles y auditoría.
- Added sections: Requisitos de verificación; Flujo de desarrollo.
- Removed sections: none; the prior document contained only template placeholders.
- Follow-up TODOs: none.
-->
# Door List Constitution

## Core Principles

### I. Especificación y migraciones

Toda feature nueva o cambio de comportamiento MUST tener una spec en `specs/` antes de
implementarse. Toda regla de negocio implementada en código, triggers o funciones SQL MUST
estar explicada también en una spec. Todo cambio de esquema MUST introducir una migración
versionada nueva; las migraciones ya aplicadas MUST conservarse sin reescritura. Estas reglas
mantienen el comportamiento revisable y el historial de datos reproducible.

### II. Calendario por evento

Todas las fechas persistidas MUST guardarse en UTC y cada evento MUST guardar su propia zona
horaria. La presentación de fechas, la apertura y el cierre del registro, y la ventana de
ingreso MUST calcularse con la zona horaria del evento; una constante global de zona horaria
MUST NOT decidir esos resultados. El cierre del registro y la ventana de ingreso MUST ser
campos explícitos del evento y MUST NOT deducirse del día del evento. Esto evita que una fecha
local cambie de significado entre eventos o entornos.

### III. Identidad y reservas

Cada entrada MUST identificar a un asistente. La spec de cada flujo de reserva MUST definir
cuántas entradas puede reservar un email; un índice único MUST NOT decidir esa política por
sí solo. Toda reserva asociada a un email sin verificar MUST caducar y liberar el cupo que
ocupa. Estas condiciones permiten contabilizar asistentes y recuperar capacidad no confirmada.

### IV. Aforo verificable

Toda regla de aforo MUST tener al menos un criterio de aceptación con cantidades numéricas.
El aforo del evento MUST ser el límite global. El cupo de un tipo de entrada MUST tratarse
como límite estricto solo cuando el organizador lo declare como tal. Ningún límite MUST
reducirse por debajo de la cantidad ya consumida. Un evento MUST NOT publicarse sin al menos
un tipo de entrada con cupo. Estas reglas hacen comprobables las ventas y evitan publicar
eventos sin disponibilidad definida.

### V. Acceso, roles y auditoría

Todo identificador incluido en un QR o URL pública MUST ser criptográficamente aleatorio,
tener al menos 128 bits de entropía y no poder enumerarse. La vista pública de ese
identificador MUST NOT mostrar nombre ni email. El permiso para operar la puerta MUST
asignarse por evento y ser independiente de los permisos para editar y exportar. Una entrada
revocada MUST conservarse con su estado en la base de datos y en la exportación de auditoría,
pero MUST excluirse de la lista operativa de puerta. Esto protege la privacidad y conserva
la trazabilidad de las revocaciones.

## Requisitos de verificación

Cada spec MUST incluir criterios de aceptación que demuestren las reglas de negocio que
introduce o modifica. Los criterios de aforo MUST usar números concretos para capacidad,
consumo y resultado esperado. Los criterios de calendario MUST comprobar la zona horaria
propia del evento y los campos explícitos de cierre e ingreso. Los criterios de reservas y
acceso MUST comprobar caducidad, liberación de cupo, permisos por evento y tratamiento de
entradas revocadas cuando esos comportamientos estén afectados.

## Flujo de desarrollo

Antes de implementar, la revisión de una feature MUST comprobar que su spec existe y
documenta las reglas afectadas. Todo cambio de esquema MUST revisarse junto con una nueva
migración versionada, sin modificar las ya aplicadas. Antes de dar por terminado un cambio,
la revisión MUST contrastar el comportamiento implementado con los criterios de aceptación
de la spec y con esta constitución. Cualquier conflicto MUST resolverse actualizando la spec
o el cambio antes de considerarlo completo.

## Governance

Esta constitución prevalece sobre otras guías del proyecto cuando hay conflicto. Toda
enmienda MUST documentar el cambio, su motivo y el impacto sobre specs y comportamiento
existentes; MUST someterse a revisión antes de adoptarse. La versión sigue SemVer: MAJOR
para retirar o redefinir principios de forma incompatible, MINOR para añadir principios o
ampliar materialmente obligaciones, y PATCH para aclaraciones sin cambio de obligación.
Toda revisión de producto MUST comprobar conformidad con esta constitución y registrar las
desviaciones pendientes en la spec correspondiente antes de aprobar la implementación.

**Version**: 1.0.0 | **Ratified**: 2026-09-30 | **Last Amended**: 2026-09-30
