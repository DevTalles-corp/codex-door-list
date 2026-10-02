# Feature Specification: Reglas de aforo

**Feature Branch**: `main`

**Created**: 2026-10-02

**Status**: Draft

**Input**: Impedir que el organizador reduzca el aforo del evento o el cupo de un tipo de entrada por debajo de las entradas ya vendidas, incluso fuera del panel y durante registros simultáneos, sin cambiar las reglas de venta actuales.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Proteger el cupo de un tipo de entrada (Priority: P1)

Como organizador, quiero conocer el mínimo permitido al editar el cupo de un tipo de entrada para no dejar más entradas vendidas que lugares disponibles en ese tipo.

**Why this priority**: El fallo descrito comienza al reducir el cupo de VIP por debajo de sus ventas.

**Independent Test**: Con ventas conocidas de un solo tipo, intentar reducir su cupo por debajo y hasta el número vendido; comprobar el resultado y el mensaje al organizador.

**Acceptance Scenarios**:

1. **Dado** un evento con aforo 3, General con cupo 1 y una entrada vendida, y VIP con cupo 2 y dos entradas vendidas, **cuando** el organizador intenta bajar VIP a 1, **entonces** se rechaza el cambio, VIP conserva su cupo 2 y se muestra un mensaje en español que identifica el cupo VIP e indica que ya se vendieron 2 entradas VIP.
2. **Dado** un evento con aforo 4 y VIP con cupo 3 y dos entradas VIP vendidas, **cuando** el organizador baja VIP a 2, **entonces** el cupo 2 se acepta porque iguala las ventas VIP.
3. **Dado** VIP con cupo 5 y ninguna entrada VIP vendida, **cuando** el organizador baja su cupo a 1, **entonces** el cambio se acepta, siempre que siga cumpliendo las demás reglas vigentes del evento.

---

### User Story 2 - Proteger el aforo total del evento (Priority: P1)

Como organizador, quiero que el aforo global respete el total ya vendido entre todos los tipos de entrada.

**Why this priority**: El aforo es el límite global y puede quedar por debajo de la suma de ventas aunque los cupos de cada tipo sean válidos.

**Independent Test**: Con ventas repartidas entre dos tipos, intentar reducir solo el aforo por debajo y hasta el total vendido.

**Acceptance Scenarios**:

1. **Dado** un evento con aforo 4, una entrada General vendida y dos VIP vendidas, **cuando** el organizador intenta bajar el aforo a 2, **entonces** se rechaza el cambio, el aforo sigue en 4 y se muestra un mensaje en español que identifica el aforo del evento e indica que ya se vendieron 3 entradas en total.
2. **Dado** el mismo evento con 3 entradas vendidas en total, **cuando** el organizador baja el aforo de 4 a 3, **entonces** se acepta el nuevo aforo 3.
3. **Dado** un evento con aforo 3 y ventas de 1 General y 2 VIP, **cuando** se intenta bajar el aforo a 2 después de cualquier otro cambio de cupo, **entonces** el aforo permanece en 3 y se informa que ya se vendieron 3 entradas.

---

### User Story 3 - Mantener la regla en todos los cambios (Priority: P1)

Como organizador, quiero que la protección se aplique aunque el límite se cambie fuera de la pantalla del panel o mientras otra persona se registra.

**Why this priority**: Una validación visible solo en el panel no impediría estados inconsistentes por otras vías ni por acciones simultáneas.

**Independent Test**: Repetir un cambio inválido mediante una vía disponible distinta del panel y coordinar un registro con una reducción de límite; comprobar los límites y las ventas resultantes.

**Acceptance Scenarios**:

1. **Dado** VIP con cupo 2 y dos entradas VIP vendidas, **cuando** se intenta establecer cupo 1 por una vía distinta de la pantalla del panel, **entonces** se rechaza y VIP conserva cupo 2.
2. **Dado** un evento con aforo 4 y 2 entradas vendidas, **cuando** coinciden el registro de una tercera entrada y una solicitud para bajar el aforo a 2, **entonces** el resultado respeta el orden efectivo: si se confirma primero la tercera venta, se rechaza la reducción y quedan aforo 4 y 3 ventas; si se acepta primero la reducción, el aforo queda en 2 y el registro posterior se rige por las reglas de venta vigentes para ese aforo. En ningún resultado quedan 3 entradas vendidas con aforo 2.
3. **Dado** VIP con cupo 3 y 1 entrada VIP vendida, **cuando** coinciden la venta de una segunda entrada VIP y una solicitud para bajar su cupo a 1, **entonces** si se confirma primero la venta se rechaza la reducción y quedan cupo 3 y 2 ventas VIP; si se acepta primero la reducción, el cupo queda en 1 y el registro posterior se rige por las reglas de venta vigentes para ese cupo. En ningún resultado quedan 2 entradas VIP vendidas con cupo 1.

### Edge Cases

- Si una solicitud modifica a la vez el aforo y el cupo de un tipo y cualquiera de los nuevos límites es inferior a lo vendido, se rechaza la solicitud completa; ningún límite solicitado cambia. El mensaje identifica cada límite inválido y sus ventas correspondientes.
- Por ejemplo, con aforo 5, cupo VIP 3, 4 entradas vendidas en total y 2 VIP vendidas, una solicitud para fijar aforo 3 y cupo VIP 1 se rechaza completa; permanecen aforo 5 y cupo VIP 3, y el mensaje indica 4 ventas totales y 2 VIP.
- Si las ventas igualan un límite existente, ese límite puede conservarse o establecerse en ese mismo número; no se exige capacidad libre adicional.
- Si no hay entradas vendidas, esta regla no impide una reducción por ventas previas; siguen vigentes las demás reglas de configuración y publicación.
- Si el organizador reintenta una reducción tras nuevas ventas, el mínimo permitido y la cifra comunicada reflejan las ventas confirmadas al resolver ese intento, no una cifra anterior mostrada en pantalla.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El aforo del evento debe ser el límite global para las entradas vendidas entre todos sus tipos.
- **FR-002**: Al modificar el aforo, el sistema debe rechazar todo valor inferior al total de entradas ya vendidas del evento y debe permitir un valor igual a ese total, sujeto a las demás reglas vigentes.
- **FR-003**: Al modificar el cupo de un tipo de entrada declarado como límite estricto, el sistema debe rechazar todo valor inferior a las entradas ya vendidas de ese tipo y debe permitir un valor igual a esa cantidad, sujeto a las demás reglas vigentes.
- **FR-004**: Un cambio rechazado por cualquiera de estos límites no debe modificar los valores solicitados ni producir un estado en el que las ventas superen el aforo o un cupo estricto.
- **FR-005**: La regla debe aplicarse a toda vía que permita modificar estos límites, incluida una vía distinta de la pantalla del panel.
- **FR-006**: Ante un rechazo, el organizador debe ver un mensaje en español que identifique el límite afectado y la cantidad de entradas ya vendidas que impide la reducción. Si hay varios límites inválidos en una misma solicitud, debe identificar cada uno con su cifra.
- **FR-007**: Los cambios de límite y los registros simultáneos deben resolverse sin que el resultado final supere el aforo ni el cupo estricto vigente.
- **FR-008**: Las reglas actuales para vender y registrar entradas, incluidas las que determinan cuándo una entrada ocupa cupo, deben conservarse.

### Key Entities

- **Evento**: Tiene un aforo global y reúne las ventas de todos sus tipos de entrada.
- **Tipo de entrada**: Pertenece a un evento; puede tener un cupo declarado como límite estricto y ventas propias.
- **Entrada vendida**: Cuenta para el aforo del evento y para el cupo estricto de su tipo conforme a las reglas de venta vigentes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En el 100 % de los escenarios de aceptación, ningún cambio de límite deja ventas superiores al aforo del evento ni al cupo estricto de un tipo.
- **SC-002**: En el 100 % de los casos con 3 entradas vendidas y un límite aplicable de 3, el organizador puede fijar ese límite en 3; en el 100 % de los intentos de fijarlo en 2, el cambio se rechaza.
- **SC-003**: En el 100 % de los rechazos observados por el organizador, el mensaje está en español, identifica el límite afectado y muestra la cifra correcta de entradas vendidas.
- **SC-004**: En el 100 % de las pruebas de registro simultáneo y cambio de límite, el estado final respeta ambos límites aplicables.
- **SC-005**: El organizador puede reconocer qué límite debe corregir y cuántas entradas ya se vendieron en una sola lectura del mensaje, sin consultar otra pantalla.

## Assumptions

- “Vendidas” y “ocupan cupo” siguen el criterio vigente del producto; esta feature no cambia qué registros cuentan ni el tratamiento actual de cancelaciones u otros estados.
- El cupo de un tipo se trata como límite estricto solo cuando el organizador lo declara como tal, de acuerdo con la constitución del proyecto.
- Las demás reglas existentes para editar límites, publicar eventos y vender entradas siguen vigentes.
