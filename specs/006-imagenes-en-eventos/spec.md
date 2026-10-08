# Feature Specification: Feature 006 — Imágenes en eventos

**Feature Branch**: `006-imagenes-en-eventos`

**Created**: 2026-10-08

**Status**: Draft — pendiente de aclaración de tres decisiones de producto

**Input**: El organizador puede subir, cambiar o quitar una portada opcional por evento. La portada se muestra en «Próximos eventos» y en la página pública de registro; las imágenes viven en Supabase Storage. La presentación debe distinguir los eventos de un vistazo, respetar PRODUCT.md y DESIGN.md, mantener la legibilidad y no alterar aforo, reservas ni entradas.

## Objetivo y contexto

La persona que reserva debe reconocer y diferenciar eventos al recorrer la cartelera, y encontrar la misma portada al abrir el registro. El organizador debe poder dar identidad visual a cada evento sin que conseguir una imagen sea un requisito para publicarlo.

«Atractiva» significa una presentación consistente, reconocible y legible: proporciones uniformes, imágenes sin deformación, contenido estable durante la carga, alternativa cuidada cuando no hay portada y acción de reserva fácil de localizar. No implica añadir adornos ni prometer un aumento de reservas sin evidencia.

Según [PRODUCT.md](../../PRODUCT.md), el registro debe poder completarse desde un enlace en una sola visita y la información relevante debe comprobarse de inmediato. Según [DESIGN.md](../../DESIGN.md), solo la cartelera admite atracción visual moderada; en el registro, la portada identifica el evento y conserva la presencia sobria de la información y el formulario.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dar identidad visual al evento (Priority: P1)

Como organizador con permiso para editar un evento, puedo subir una portada opcional y escribir su texto alternativo, para que las personas reconozcan el evento antes de reservar.

**Why this priority**: Permite aportar la imagen que distingue el evento sin añadir una condición de publicación ni una obligación de preparar material gráfico.

**Independent Test**: Usar un evento editable, añadir una imagen admitida y comprobar que permanece al volver a abrir su edición. Para un evento publicado, comprobar la misma portada en cartelera y registro.

**Acceptance Scenarios**:

1. **Given** un evento sin portada y un organizador con permiso de edición, **When** sube una imagen admitida y completa el guardado, **Then** el evento conserva esa portada y la muestra al volver a abrir su edición.
2. **Given** ese evento publicado, **When** una persona abre la cartelera y luego su registro, **Then** ve la portada del mismo evento en ambas superficies, junto con título, fecha y acción de reserva legibles.
3. **Given** una subida con texto alternativo escrito por el organizador, **When** se muestra la portada, **Then** ese texto es su alternativa accesible en ambas superficies.
4. **Given** una subida sin texto alternativo o con solo espacios, **When** se muestra la portada, **Then** tiene una alternativa no vacía que identifica la portada y contiene el título vigente del evento.
5. **Given** un evento sin portada que satisface las condiciones de publicación existentes, **When** el organizador lo publica, **Then** la ausencia de imagen no impide la publicación ni el registro.
6. **Given** una persona sin permiso de edición para ese evento, incluida una cuenta con permiso exclusivo de puerta, **When** intenta añadir, cambiar o quitar la portada, **Then** no puede modificarla.

---

### User Story 2 - Reconocer eventos y reservar con claridad (Priority: P1)

Como persona que reserva, puedo recorrer una cartelera con portadas y abrir un registro legible en móvil o escritorio, incluso si una imagen falta, tarda o no se puede cargar.

**Why this priority**: La identidad visual solo aporta valor si permite encontrar el evento y continuar el registro con la misma baja fricción del producto actual.

**Independent Test**: Mostrar eventos con imágenes horizontales, verticales y cuadradas, y otro sin imagen; recorrer cartelera y registro a 375 px y 1440 px, con carga normal, demorada y fallida.

**Acceptance Scenarios**:

1. **Given** eventos con imágenes de distintas dimensiones y orientaciones, **When** se muestra la cartelera, **Then** todas las áreas de portada tienen la misma proporción, ninguna imagen se estira o aplasta y cambiar la imagen de una tarjeta no cambia su altura manteniendo el mismo ancho y contenido textual. La proporción concreta y el encuadre se resolverán en Q2 y Q3.
2. **Given** una portada cuya carga se demora, **When** pasa del estado de carga a imagen visible, **Then** título, fecha, acción de reserva y contenido situado debajo mantienen su posición tanto en cartelera como en registro.
3. **Given** un evento sin portada o una portada que no se puede cargar, **When** se abre la cartelera o el registro, **Then** aparece un marcador visual neutro y reconocible en el espacio de la portada, sin icono de imagen rota ni hueco vacío; la información y la reserva siguen disponibles.
4. **Given** portadas completamente claras, completamente oscuras, de alto contraste o con texto y patrones densos, **When** se consulta cualquiera de las dos superficies, **Then** título, fecha, sede y acción de reserva se leen completos y conservan su jerarquía, estén sobre la imagen o junto a ella.
5. **Given** un ancho de pantalla de 375 px, **When** se recorre la cartelera y se abre el registro, **Then** ambas vistas tienen una columna, no generan desplazamiento horizontal y permiten leer los datos y usar la acción de reserva sin solapamientos ni controles recortados.
6. **Given** un ancho de pantalla de 1440 px, **When** se recorre la cartelera y se abre el registro, **Then** las vistas respetan el contenedor y la cuadrícula de DESIGN.md, y el registro conserva la distribución de información del evento y formulario.
7. **Given** una portada pendiente de carga o fallida, **When** la persona continúa el registro, **Then** puede completar el flujo existente sin esperar a la imagen ni realizar pasos adicionales relacionados con ella.

---

### User Story 3 - Mantener o retirar la portada (Priority: P2)

Como organizador con permiso de edición, puedo cambiar o quitar la portada y actualizar su texto alternativo, para mantener la publicación al día sin recrear el evento.

**Why this priority**: Evita que una portada incorrecta o desactualizada obligue a rehacer el evento o a dejar de ofrecer reservas.

**Independent Test**: En un evento con portada, reemplazarla, volver a abrir ambas vistas públicas y después quitarla. Repetir con una sustitución fallida y comprobar que se conserva la portada anterior.

**Acceptance Scenarios**:

1. **Given** un evento con portada A, **When** el organizador guarda correctamente la portada B, **Then** al volver a abrir la cartelera y el registro se muestra B, y A deja de ser la portada del evento.
2. **Given** una portada con alternativa personalizada, **When** el organizador guarda otro texto alternativo, **Then** ambas superficies usan el texto nuevo sin exigir sustituir la imagen.
3. **Given** un evento con portada, **When** el organizador la quita correctamente, **Then** al volver a abrir ambas superficies se muestra el marcador sin portada y el evento mantiene su estado de publicación.
4. **Given** un intento de subida, sustitución o retirada que falla, **When** se informa del error, **Then** se conserva la última portada guardada, o la ausencia de portada si nunca hubo una, y se permite reintentar con un mensaje comprensible en español.
5. **Given** un evento con reservas y entradas existentes, **When** se añade, sustituye o quita su portada o se edita su alternativa, **Then** no cambia su aforo, cupos, calendario, estado de publicación, reservas, entradas ni permisos.

### Edge Cases

- Un archivo incompatible, dañado o fuera de los límites de Q1 no se convierte en portada. El organizador recibe una explicación de qué debe corregir; la portada anterior se conserva.
- Una interrupción durante la subida o el guardado no se comunica como éxito. El estado de la operación y su resultado son perceptibles sin depender solo del color.
- Una imagen remota inaccesible muestra el mismo tratamiento visual que un evento sin portada; no bloquea el registro ni desplaza el resto del contenido.
- Una imagen vertical o panorámica no deforma el sujeto ni aumenta la altura de la tarjeta. Su encuadre se valida con la decisión de Q3.
- Un título largo conserva la legibilidad y no se solapa con la imagen ni el botón; la imagen por sí sola no cambia el espacio del contenido textual.
- Al cambiar el título, la alternativa derivada refleja el título vigente; una alternativa escrita por el organizador se conserva hasta que este la edite o la deje vacía.
- Al sustituir la portada, el organizador puede escribir la alternativa de la nueva imagen o dejarla vacía para derivarla del título; no se reutiliza silenciosamente una descripción personalizada de la imagen anterior.
- Los eventos existentes sin portada continúan visibles y reservables según sus condiciones actuales, con el mismo marcador que los eventos nuevos sin portada.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El organizador con permiso de edición del Event DEBE poder añadir una única portada opcional, cambiarla y quitarla. El permiso exclusivo de puerta NO DEBE permitir esas acciones.
- **FR-002**: La portada NO DEBE convertirse en condición de creación, publicación o reserva del evento. Las condiciones de publicación existentes siguen vigentes.
- **FR-003**: La portada guardada de un evento público DEBE mostrarse en su tarjeta de «Próximos eventos» y en su página pública de registro. Tras cambiarla o quitarla correctamente, ambas superficies DEBEN reflejar el resultado al volver a abrirlas.
- **FR-004**: El organizador DEBE poder escribir y editar el texto alternativo de la portada. Cada imagen mostrada DEBE tener una alternativa no vacía: la escrita por el organizador o una derivada del título vigente si no escribió contenido. Se DEBE poder volver a la alternativa derivada dejando el campo vacío.
- **FR-005**: Las operaciones sobre la portada DEBEN indicar progreso, éxito o fallo con información comprensible en español, sin mensajes crudos del proveedor. Una operación fallida DEBE conservar el estado guardado anterior y permitir reintentar.
- **FR-006**: Se DEBEN comunicar las condiciones de archivo admitido antes de subir y rechazar archivos que no las cumplan, sin sustituir la portada anterior. Los formatos y límites exactos están pendientes de Q1.
- **FR-007**: En la cartelera, todas las portadas DEBEN ocupar áreas con una proporción común, sin deformación de la imagen. A igual ancho y contenido textual, cambiar la imagen, quitarla o pasar de carga a éxito o fallo NO DEBE cambiar la altura de la tarjeta. La proporción concreta está pendiente de Q2 y el tratamiento del encuadre de Q3.
- **FR-008**: En cartelera y registro, el espacio de portada DEBE mantener sus dimensiones antes, durante y después de cargar, y también cuando falla la carga. La imagen NO DEBE desplazar el contenido de la página ni bloquear el flujo de reserva.
- **FR-009**: La ausencia o el fallo de una portada DEBE mostrar un marcador reconocible, con superficies y líneas neutras de DESIGN.md. NO DEBE mostrar un hueco vacío, una imagen rota, fotografías inventadas, gradientes, animación ornamental ni colores semánticos usados como adorno.
- **FR-010**: Título, fecha, sede y acción de reserva DEBEN seguir legibles y localizables cualquiera sea la imagen. La lectura de esos elementos NO DEBE depender de que la fotografía tenga un fondo claro, oscuro o uniforme. Sus combinaciones de texto y fondo DEBEN conservar el contraste previsto en DESIGN.md, sin que los colores de la imagen lo reduzcan. La fecha DEBE conservar su prioridad y la acción de reserva su posición al final de la tarjeta, según DESIGN.md.
- **FR-011**: Las vistas públicas DEBEN respetar la tipografía del sistema, las superficies blancas sobre lienzo frío, bordes neutros, redondeados y elevación de DESIGN.md. El azul DEBE conservar su función de acción, selección o dato prioritario; los colores de estado DEBEN comunicar estados reales.
- **FR-012**: A 375 px, cartelera y registro DEBEN funcionar en una columna, con márgenes laterales de al menos 1rem, sin desbordamiento horizontal ni solapamientos. A 1440 px DEBEN respetar el ancho máximo de 70rem, la cuadrícula de tarjetas y la distribución de información y formulario de DESIGN.md.
- **FR-013**: La incorporación de portadas DEBE conservar controles de al menos 2.75rem de alto, foco visible de 3px y recorrido por teclado. Ninguna acción necesaria para gestionar la portada o reservar DEBE depender exclusivamente de ver la imagen o interpretar un color.
- **FR-014**: La atracción visual moderada DEBE quedar en la cartelera. En el registro, la portada DEBE servir a la identificación del evento sin añadir efectos decorativos al formulario ni ocultar su información o controles.
- **FR-015**: Gestionar o mostrar portadas NO DEBE cambiar reglas ni datos de aforo, TicketType, Registration o Ticket, ni alterar calendario, publicación o permisos del Event. El registro mantiene sus pasos actuales.

### Key Entities *(include if feature involves data)*

- **Event**: Evento existente cuya información permite decidir una reserva. Puede tener una portada o no tenerla, sin cambiar su identidad ni condiciones de registro.
- **Portada del Event**: Imagen opcional que identifica visualmente un único evento en cartelera y registro. Solo hay una portada vigente por evento; puede sustituirse o retirarse.
- **Texto alternativo de la portada**: Descripción accesible asociada a la imagen vigente, escrita por el organizador o derivada del título del Event. No sustituye al título visible, a la fecha ni a la acción de reserva.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En el 100% de los escenarios de añadir, sustituir y quitar portada con guardado correcto, volver a abrir cartelera y registro muestra la misma portada vigente o el mismo estado sin portada. En el 100% de operaciones fallidas se conserva el estado previo.
- **SC-002**: En cada ancho de prueba, el 100% de las áreas de portada de la cartelera tienen la proporción común acordada en Q2. Al cambiar solo la imagen entre horizontal, vertical, cuadrada y ausente, la altura de una tarjeta varía 0 px y no aparece deformación.
- **SC-003**: Al demorar deliberadamente la carga y al hacerla fallar, el desplazamiento atribuible a la portada es 0 px: las posiciones del título, fecha, acción de reserva y contenido inferior coinciden antes y después, en ambas superficies y ambos anchos de prueba.
- **SC-004**: En todos los casos sin imagen o con carga fallida, ambas superficies muestran el marcador definido por FR-009, con 0 huecos vacíos y 0 indicadores de imagen rota. El registro sigue utilizable.
- **SC-005**: En la matriz visual de imágenes claras, oscuras, de alto contraste y con texto o patrones densos, el 100% de los títulos, fechas, sedes y acciones de reserva se leen sin quedar ocultos, recortados o solapados, con la jerarquía y el tratamiento de texto de DESIGN.md. El contraste entre texto y fondo de esos elementos no disminuye al sustituir una imagen por otra y conserva las combinaciones del sistema visual, tanto sobre la imagen como junto a ella.
- **SC-006**: A 375 px y 1440 px, cartelera y registro cumplen FR-011 a FR-014 en todos los estados de imagen: cargada, cargando, ausente y fallida. Hay 0 desbordamientos horizontales y 0 controles recortados; es posible abrir un evento y completar su registro con teclado o interacción táctil según corresponda.
- **SC-007**: El 100% de las portadas mostradas tienen texto alternativo no vacío. Las pruebas cubren texto personalizado, ausencia de texto, solo espacios, edición del texto, sustitución de imagen y cambio del título con alternativa derivada.
- **SC-008**: Añadir, cambiar o quitar portada y editar su alternativa produce 0 cambios en capacidades, cupos consumidos, reservas, entradas, calendario, permisos y estado de publicación existentes. Publicar y reservar un evento sin portada conserva las condiciones y los pasos del flujo actual.

## Assumptions

- Los actores y permisos son los existentes: el organizador autorizado edita el evento; la persona que reserva consulta sus superficies públicas; un permiso de puerta no otorga edición. Esto se deriva del alcance y de la constitución, sin añadir roles.
- La portada es opcional y sirve a la identificación visual; título, fecha, sede y acción de reserva continúan como información explícita, según PRODUCT.md y DESIGN.md.
- Las imágenes deben vivir en **Supabase Storage**, como restricción expresa del usuario. Esta spec no define tablas, buckets, políticas, endpoints ni componentes; esas decisiones pertenecen al plan.
- La presentación depende del sistema visual vigente de PRODUCT.md y DESIGN.md. La revisión visual de la implementación se hará con el skill **`impeccable`**, contrastando las capturas y los estados de prueba con esta spec. No se usa ese skill durante la especificación.
- Se conserva la constitución y el comportamiento existente de calendario, aforo, reservas, entradas, privacidad y permisos. Esta feature no introduce reglas nuevas en esos ámbitos.

## Preguntas abiertas para `$speckit-clarify`

No se fijan por defecto las decisiones siguientes porque el alcance, PRODUCT.md, DESIGN.md y la constitución no las resuelven. Deben aclararse antes de cerrar el plan; son tres preguntas en total.

1. **Q1 — Archivos admitidos**: [NEEDS CLARIFICATION: ¿Qué formatos, tamaño máximo por archivo y dimensiones mínimas se admitirán para la portada, y se permitirán imágenes animadas?] Define qué puede subir el organizador, el mensaje previo a la subida y los casos de aceptación y rechazo de FR-006.
2. **Q2 — Proporción de presentación**: [NEEDS CLARIFICATION: ¿Qué proporción concreta tendrán las portadas de la cartelera y deberá usarse también en el registro?] La uniformidad y la estabilidad son obligatorias; falta el valor para evaluar el resultado visual de FR-007 y FR-008.
3. **Q3 — Encuadre**: [NEEDS CLARIFICATION: ¿La imagen se mostrará completa dentro del espacio de portada o se recortará para llenarlo y, si se recorta, podrá el organizador ajustar el encuadre?] Define qué parte de la imagen ve la persona que reserva y si gestionar la portada incluye una interacción adicional. En cualquier opción se prohíbe deformarla o cambiar la altura por su orientación.
