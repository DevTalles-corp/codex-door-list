# Feature Specification: Reglas de aforo

**Feature Branch**: `001-proteger-limites-aforo`

**Created**: 2026-10-02

**Status**: Draft

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
- **FR-008**: Las reglas actuales para vender y registrar entradas, incluidas las que determinan cuándo una entrada ocupa cupo, deben conservarse.
- **FR-009**: Debe conservarse la regla que impide que el aforo sea inferior a la suma de los cupos asignados a sus tipos de entrada. Igualar las ventas no basta para aceptar una reducción si incumple esa suma; en cambios conjuntos se evalúan los valores finales solicitados.
- **FR-010**: Para los mínimos de aforo y cupo y las cifras de rechazo, se debe contar cada Registration guardada del evento o tipo correspondiente una sola vez, independientemente del estado de su Ticket asociado. Las entradas revocadas siguen contando; su estado no libera cupo para ventas nuevas.
- **FR-011**: Al activar la protección, deben conservarse los límites, registros y entradas existentes sin aumentos automáticos ni exigir una corrección previa. Al establecer posteriormente cualquier límite, incluso en su valor guardado, ese límite debe cubrir su consumo y cumplir las demás reglas vigentes. Los cambios que no establecen límites no requieren sanear inconsistencias previas.

### Key Entities

- **Event (evento)**: Tiene un aforo global y reúne los registros de todos sus tipos de entrada.
- **TicketType (tipo de entrada)**: Pertenece a un Event; puede tener un cupo declarado como límite estricto y registros propios.
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
- El cupo de un tipo se trata como límite estricto solo cuando el organizador lo declara como tal, de acuerdo con la constitución del proyecto. Esta feature protege los cupos que las reglas vigentes ya tratan como estrictos y no incorpora nuevos modos de cupo ni cambia cuáles son estrictos.
- Las demás reglas existentes para editar límites, publicar eventos y vender entradas siguen vigentes, incluida la obligación de que el aforo cubra la suma de cupos asignados.
