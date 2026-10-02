# Feature Specification: Reglas de aforo

**Feature Branch**: `001-proteger-limites-aforo`

**Created**: 2026-10-02

**Status**: Draft

**Implementation gate**: BLOCKED por conflictos constitucionales heredados; ver «Estado existente y desviaciones pendientes» y el Constitution Check del plan. Estos ajustes no constituyen una aprobación de implementación.

**Input**: Impedir que el organizador reduzca el aforo del evento o el cupo de un tipo de entrada por debajo de las entradas ya vendidas, incluso fuera del panel y durante registros simultáneos, sin cambiar las reglas de venta actuales.

## Clarifications

### Session 2026-10-02

- Q: ¿Debe seguir prohibido bajar el aforo por debajo de la suma de los cupos asignados a los tipos de entrada? → A: Sí; el aforo debe cubrir tanto las ventas como la suma de cupos asignados.
- Q: ¿Una entrada revocada cuyo registro sigue guardado debe seguir contando al calcular el mínimo permitido de aforo y cupo? → A: Sí; se cuentan todos los registros que actualmente ocupan cupo, incluidos los asociados a entradas revocadas.
- Q: ¿Cómo deben tratarse los eventos que ya tengan más entradas vendidas que aforo o cupo cuando se active esta protección? → A: Conservar los datos existentes; al modificar un límite, exigir que el nuevo valor cubra su consumo y cumpla las demás reglas, sin aumentos automáticos ni una corrección previa obligatoria para activar la protección.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Proteger el cupo de un tipo de entrada (Priority: P1)

Como organizador, quiero conocer el mínimo permitido al editar el cupo de un tipo de entrada para no dejar más entradas vendidas que lugares disponibles en ese tipo.

**Why this priority**: El fallo descrito comienza al reducir el cupo de VIP por debajo de sus ventas.

**Independent Test**: Con ventas conocidas de un solo tipo, intentar reducir su cupo por debajo y hasta el número vendido; comprobar el resultado y el mensaje al organizador.

**Acceptance Scenarios**:

1. **Dado** un evento con aforo 3, General con cupo 1 y una entrada vendida, y VIP con cupo 2 y dos entradas vendidas, **cuando** el organizador intenta bajar VIP a 1, **entonces** se rechaza el cambio, VIP conserva su cupo 2 y se muestra un mensaje en español que identifica el cupo VIP e indica que ya se vendieron 2 entradas VIP.
2. **Dado** un evento con aforo 4 y VIP con cupo 3 y dos entradas VIP vendidas, **cuando** el organizador baja VIP a 2, **entonces** el cupo 2 se acepta porque iguala las ventas VIP.
3. **Dado** VIP con cupo 5 y ninguna entrada VIP vendida, **cuando** el organizador baja su cupo a 1, **entonces** el cambio se acepta, siempre que siga cumpliendo las demás reglas vigentes del evento.
4. **Dado** un evento con aforo 4, un único tipo VIP con cupo 3 y tres registros guardados asociados a una entrada válida, una utilizada y una revocada, **cuando** el organizador intenta bajar el cupo VIP o el aforo a 2, **entonces** se rechaza el cambio y el mensaje indica 3 entradas que ocupan cupo; fijar cualquiera de esos límites en 3 se acepta, sin borrar registros ni cambiar estados de entradas.
5. **Dado** un evento existente con aforo 4, un único tipo VIP con cupo 1 y 2 registros guardados, **cuando** se activa la protección, **entonces** se conservan el aforo, el cupo y los registros; una solicitud posterior para establecer VIP en 1 se rechaza aunque repita el valor guardado, y una solicitud para establecerlo en 2 se acepta.
6. **Dado** un evento con aforo 4, **cuando** el organizador crea VIP indicando cupo 2, **entonces** ese valor declara un límite estricto: se permiten dos registros VIP y se rechaza el tercero por falta de cupo. Con dos registros guardados, establecer VIP en 1 se rechaza y en 2 se acepta. La misma interpretación se aplica a un VIP existente con cupo 2, sin añadir un indicador de modo ni modificar sus datos al activar la protección.

---

### User Story 2 - Proteger el aforo total del evento (Priority: P1)

Como organizador, quiero que el aforo global respete el total ya vendido entre todos los tipos de entrada.

**Why this priority**: El aforo es el límite global y puede quedar por debajo de la suma de ventas aunque los cupos de cada tipo sean válidos.

**Independent Test**: Con ventas repartidas entre dos tipos, intentar reducir solo el aforo por debajo y hasta el total vendido.

**Acceptance Scenarios**:

1. **Dado** un evento con aforo 4, General con cupo 1 y una entrada vendida, y VIP con cupo 2 y dos entradas vendidas, **cuando** el organizador intenta bajar el aforo a 2, **entonces** se rechaza el cambio, el aforo sigue en 4 y se muestra un mensaje en español que identifica el aforo del evento e indica que ya se vendieron 3 entradas en total.
2. **Dado** el mismo evento con 3 entradas vendidas en total, **cuando** el organizador baja el aforo de 4 a 3, **entonces** se acepta el nuevo aforo 3 porque también cubre la suma de cupos asignados, que es 3.
3. **Dado** un evento con aforo 3, General con cupo 1 y una entrada vendida, y VIP con cupo 2 y dos entradas vendidas, **cuando** se intenta bajar el aforo a 2 después de cualquier otro cambio de cupo, **entonces** el aforo permanece en 3 y se informa que ya se vendieron 3 entradas.
4. **Dado** un evento con aforo 6, General con cupo 3 y una entrada vendida, y VIP con cupo 3 y dos entradas vendidas, **cuando** el organizador intenta bajar solo el aforo a 3, **entonces** se rechaza el cambio y el aforo permanece en 6: aunque cubre las 3 ventas, no cubre los 6 cupos asignados. El mensaje en español indica que los cupos asignados impiden la reducción.
5. **Dado** un evento existente con aforo 2, un único tipo VIP con cupo 3 y 3 registros guardados, **cuando** se activa la protección, **entonces** se conservan los datos; una solicitud posterior para establecer el aforo en 2 se rechaza, y establecerlo en 3 se acepta porque cubre tanto el consumo como los cupos asignados.

---

### User Story 3 - Mantener la regla en todos los cambios (Priority: P1)

Como organizador, quiero que la protección se aplique aunque el límite se cambie fuera de la pantalla del panel o mientras otra persona se registra.

**Why this priority**: Una validación visible solo en el panel no impediría estados inconsistentes por otras vías ni por acciones simultáneas.

**Independent Test**: Repetir un cambio inválido mediante una vía disponible distinta del panel y coordinar un registro con una reducción de límite; comprobar los límites y las ventas resultantes.

**Acceptance Scenarios**:

1. **Dado** VIP con cupo 2 y dos entradas VIP vendidas, **cuando** se intenta establecer cupo 1 por una vía distinta de la pantalla del panel, **entonces** se rechaza y VIP conserva cupo 2.
2. **Dado** un evento con aforo 4, General con cupo 1 y una entrada vendida, y VIP con cupo 3 y una entrada vendida, **cuando** coinciden el registro de una segunda entrada VIP y una solicitud para bajar conjuntamente el aforo a 2 y el cupo VIP a 1, **entonces** el resultado respeta el orden efectivo: si se confirma primero la venta, se rechaza toda la reducción y quedan aforo 4, cupo VIP 3 y 3 ventas totales; si se acepta primero la reducción, quedan aforo 2, cupo VIP 1 y 2 ventas totales, y se rechaza el registro posterior por falta de cupo VIP. En ningún resultado quedan 3 entradas vendidas con aforo 2 ni una suma de cupos asignados superior al aforo.
3. **Dado** VIP con cupo 3 y 1 entrada VIP vendida, **cuando** coinciden la venta de una segunda entrada VIP y una solicitud para bajar su cupo a 1, **entonces** si se confirma primero la venta se rechaza la reducción y quedan cupo 3 y 2 ventas VIP; si se acepta primero la reducción, el cupo queda en 1 y el registro posterior se rige por las reglas de venta vigentes para ese cupo. En ningún resultado quedan 2 entradas VIP vendidas con cupo 1.
4. **Dado** un evento con aforo 4, VIP con cupo 3 y 1 registro, **cuando** se registra una segunda entrada VIP en una transacción READ COMMITTED y después se solicita cupo 2 por RPC o DML autorizado, **entonces** el registro y la edición se aceptan, quedan cupo 2 y 2 registros, y se mantienen la firma, los estados y la emisión del registro vigente.
5. **Dado** el mismo estado inicial con aforo 4, VIP con cupo 3 y 1 registro, **cuando** se intenta registrar una segunda VIP, invocar la RPC de configuración o establecer un límite por DML en REPEATABLE READ o SERIALIZABLE, **entonces** cada intento se rechaza con error técnico SQLSTATE `0A000` antes de persistir escrituras propias de esa operación; permanecen aforo 4, cupo 3 y 1 Registration/Ticket. No se comunica falta de cupo ni se reintenta automáticamente dentro de la misma transacción. La RPC también rechaza en esos aislamientos un patch de solo nombre/título.

### Edge Cases

- Las inconsistencias anteriores a la activación no se corrigen automáticamente ni bloquean la activación. Toda solicitud posterior que establezca un límite debe validar ese valor, aunque repita el guardado. Editar datos ajenos a los límites no exige corregir antes una inconsistencia previa; permanecen vigentes los permisos y las demás validaciones.
- Si una solicitud modifica a la vez el aforo y el cupo de un tipo y cualquiera de los nuevos límites es inferior a lo vendido, se rechaza la solicitud completa; ningún límite solicitado cambia. El mensaje identifica cada límite inválido y sus ventas correspondientes.
- Por ejemplo, con aforo 5, cupo VIP 3, 4 entradas vendidas en total y 2 VIP vendidas, una solicitud para fijar aforo 3 y cupo VIP 1 se rechaza completa; permanecen aforo 5 y cupo VIP 3, y el mensaje indica 4 ventas totales y 2 VIP.
- Si las ventas igualan un límite existente, ese límite puede conservarse o establecerse en ese mismo número, siempre que cumpla las demás reglas vigentes, incluida la suma de cupos asignados para el aforo; no se exige capacidad libre adicional.
- Si no hay entradas vendidas, esta regla no impide una reducción por ventas previas; siguen vigentes las demás reglas de configuración y publicación.
- Una entrada revocada no libera cupo mientras su registro siga guardado. Si el panel muestra solo entradas válidas y utilizadas, el mensaje de rechazo debe informar el total que ocupa cupo, incluidas las revocadas, sin cambiar la lista operativa de puerta.
- Si el organizador reintenta una reducción tras nuevas ventas, el mínimo permitido y la cifra comunicada reflejan las ventas confirmadas al resolver ese intento, no una cifra anterior mostrada en pantalla.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El aforo del evento debe ser el límite global para las entradas vendidas entre todos sus tipos.
- **FR-002**: Al modificar el aforo, el sistema debe rechazar todo valor inferior al total de entradas ya vendidas del evento y debe permitir un valor igual a ese total, sujeto a las demás reglas vigentes.
- **FR-003**: Al modificar el cupo de un tipo de entrada declarado como límite estricto, el sistema debe rechazar todo valor inferior a las entradas ya vendidas de ese tipo y debe permitir un valor igual a esa cantidad, sujeto a las demás reglas vigentes.
- **FR-004**: Un cambio rechazado por cualquiera de estos límites no debe modificar los valores solicitados. Ningún límite modificado y aceptado puede quedar por debajo de su consumo; las inconsistencias previas se tratan según FR-011.
- **FR-005**: La regla debe aplicarse a toda vía que permita modificar estos límites, incluida una vía distinta de la pantalla del panel.
- **FR-006**: Ante un rechazo por consumo, el organizador debe ver un mensaje en español que identifique el límite afectado y la cantidad de entradas ya vendidas que impide la reducción. Si hay varios límites inválidos en una misma solicitud, debe identificar cada uno con su cifra. Si el rechazo se debe a los cupos asignados, el mensaje debe identificar esa causa y su suma, sin atribuirla a ventas insuficientemente cubiertas.
- **FR-007**: Partiendo de límites consistentes, los cambios de límite y los registros simultáneos deben resolverse sin que el resultado final supere el aforo ni el cupo estricto vigente. Esta garantía no exige sanear automáticamente inconsistencias anteriores a la activación, tratadas en FR-011.
- **FR-008**: Las reglas de negocio actuales para vender y registrar entradas, incluidas las que determinan cuándo una entrada ocupa cupo, deben conservarse. La firma, los estados, las fechas, la unicidad por email/evento y la emisión siguen vigentes; la única modificación del contrato técnico de registro es la restricción de aislamiento explícita en FR-012.
- **FR-009**: Debe conservarse la regla que impide que el aforo sea inferior a la suma de los cupos asignados a sus tipos de entrada. Igualar las ventas no basta para aceptar una reducción si incumple esa suma; en cambios conjuntos se evalúan los valores finales solicitados.
- **FR-010**: Para los mínimos de aforo y cupo y las cifras de rechazo, se debe contar cada Registration guardada del evento o tipo correspondiente una sola vez, independientemente del estado de su Ticket asociado. Las entradas revocadas siguen contando; su estado no libera cupo para ventas nuevas.
- **FR-011**: Al activar la protección, deben conservarse los límites, registros y entradas existentes sin aumentos automáticos ni exigir una corrección previa. Al establecer posteriormente cualquier límite, incluso en su valor guardado, ese límite debe cubrir su consumo y cumplir las demás reglas vigentes. Los cambios que no establecen límites no requieren sanear inconsistencias previas.
- **FR-012**: `register_for_event`, la RPC de configuración (también para patches de solo metadatos) y las escrituras DML que activen las guardas de aforo, cupo o asociación de TicketType deben exigir READ COMMITTED. Otros niveles de aislamiento se rechazan con SQLSTATE `0A000` antes de persistir escrituras propias de la operación. Es un fallo técnico de contrato, distinto de falta de cupo y de contención transitoria; el caller debe iniciar una nueva transacción READ COMMITTED. El endpoint no permite elegir aislamiento y usa READ COMMITTED; si recibe `0A000` por una configuración incorrecta, devuelve 500 con mensaje propio. DML de solo metadatos que no active estas guardas conserva su comportamiento vigente.

### Key Entities

- **Event (evento)**: Tiene un aforo global y reúne los registros de todos sus tipos de entrada.
- **TicketType (tipo de entrada)**: Pertenece a un Event y tiene registros propios. En el modelo actual, configurar su cupo numérico obligatorio declara un límite estricto; todos los tipos existentes se interpretan de esa forma. No existe en esta feature un modo de cupo no estricto.
- **Registration (registro)**: Pertenece a un Event y a un TicketType; cada registro guardado ocupa una unidad de cupo según la regla de venta vigente. En esta spec, las cantidades de entradas «vendidas» corresponden a estos registros.
- **Ticket (entrada)**: Está asociado a una Registration y tiene estado válido, utilizado o revocado; cambiar ese estado no elimina el consumo de cupo de la Registration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En el 100 % de los escenarios de aceptación, ningún límite modificado y aceptado queda por debajo de su consumo, y se cumplen las reglas vigentes de asignación aplicables al cambio. Activar la protección no altera datos previos inconsistentes.
- **SC-002**: En el 100 % de los casos con 3 entradas vendidas y las demás reglas vigentes satisfechas, el organizador puede fijar el límite aplicable en 3; en el 100 % de los intentos de fijarlo en 2, el cambio se rechaza. Si el evento tiene 6 cupos asignados, fijar solo su aforo en 3 se rechaza aunque cubra las 3 ventas.
- **SC-003**: En el 100 % de los rechazos observados por el organizador, el mensaje está en español, identifica el límite afectado y muestra la cifra correcta que impide el cambio: registros que ocupan cupo o suma de cupos asignados, según corresponda.
- **SC-004**: En el 100 % de las pruebas de registro simultáneo y cambio de límite que parten de límites consistentes, el estado final respeta ambos límites aplicables.
- **SC-005**: El organizador puede reconocer qué límite debe corregir, la causa del rechazo y la cantidad que impide el cambio en una sola lectura del mensaje, sin consultar otra pantalla.

## Assumptions

- “Vendidas” y “ocupan cupo” corresponden a todos los registros guardados, incluso si su entrada está revocada; esta feature conserva ese criterio vigente y no introduce nuevas reglas de cancelación, caducidad ni liberación de cupo.
- Declarar un cupo estricto significa indicar el cupo numérico obligatorio al crear o configurar un TicketType. El campo `maxCapacity` de UI/API corresponde a `ticket_types.max_capacity`; no se necesita un indicador adicional. Todo valor ya almacenado se interpreta como el límite configurado vigente, con independencia de su consumo y del estado de sus Tickets. Esta es la interpretación de compatibilidad de los tipos heredados, no una afirmación de que se auditó quién los creó. No se añaden modos no estrictos ni se cambia qué tipos tienen límite.
- Las demás reglas existentes para editar límites, publicar eventos y vender entradas siguen vigentes, incluida la obligación de que el aforo cubra la suma de cupos asignados.

## Estado existente y desviaciones pendientes

Revisión de planificación del 2026-10-02 contra la constitución 1.0.0. Este registro describe la base existente; no amplía los criterios de aceptación de esta feature ni declara resuelta la deuda.

- **Cupos estrictos (definición aclarada)**: `ticket_types.max_capacity` es obligatorio y positivo; `register_for_event` trata todos los tipos actuales como estrictos. Esta spec define la configuración de ese número como declaración del límite y explicita la interpretación de los valores heredados. No existe un modo no estricto; añadirlo requeriría otra spec. Esta aclaración no resuelve el incumplimiento independiente de publicación del principio IV.
- **Publicación (IV)**: el esquema y el editor permiten publicar sin comprobar que exista un tipo con cupo. Conservar esa conducta no implica que cumpla el requisito constitucional; su corrección queda pendiente en otra spec.
- **Calendario (II)**: Event no tiene zona propia ni campos explícitos de cierre/ingreso. Las funciones usan `America/La_Paz` y el día de `event_date`. Esta feature no modifica esas reglas.
- **Identidad y reservas (III)**: la base limita a una Registration por email normalizado/evento mediante índice y RPC, pero no verifica el email del asistente ni implementa caducidad/liberación. FR-008 y FR-010 conservan el conteo actual; no se añaden reservas ni una política nueva de cancelación.
- **Privacidad, permisos y auditoría (V)**: `get_public_ticket` devuelve nombre/email; puerta usa propiedad del evento, sin rol independiente; el export actual usa los registros operativos filtrados y omite revocadas. Este cambio conserva esas superficies y no usa sus cifras como consumo autoritativo.

La protección de reducciones por consumo es la desviación de aforo que esta spec pretende resolver. Los incumplimientos de II, III, IV (publicación) y V permanecen abiertos y mantienen el gate constitucional en FAIL. Registrarlos o proponer specs futuras no satisface esos MUST. Antes de implementar, se requiere una resolución explícita y revisada: corregir los comportamientos mediante specs/migraciones y volver a evaluar el gate, o tramitar por separado una enmienda constitucional con motivo e impacto. Este ajuste no adopta una enmienda, no concede una excepción y no amplía automáticamente esta feature.
