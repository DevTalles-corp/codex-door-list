# Feature Specification: Feature 006 — Imágenes en eventos

**Feature Branch**: `006-imagenes-en-eventos`

**Created**: 2026-10-08

**Status**: Draft — aclarada y lista para planificación

**Input**: El organizador puede subir, cambiar o quitar una portada opcional por evento. La portada se muestra en «Próximos eventos» y en la página pública de registro; las imágenes viven en Supabase Storage. La presentación debe distinguir los eventos de un vistazo, respetar PRODUCT.md y DESIGN.md, mantener la legibilidad y no alterar aforo, reservas ni entradas.

## Objetivo y contexto

La persona que reserva debe reconocer y diferenciar eventos al recorrer la cartelera, y encontrar la misma portada al abrir el registro. El organizador debe poder dar identidad visual a cada evento sin que conseguir una imagen sea un requisito para publicarlo.

«Atractiva» significa una presentación consistente, reconocible y legible: proporciones uniformes, imágenes sin deformación, contenido estable durante la carga, alternativa cuidada cuando no hay portada y acción de reserva fácil de localizar. No implica añadir adornos ni prometer un aumento de reservas sin evidencia.

Según [PRODUCT.md](../../PRODUCT.md), el registro debe poder completarse desde un enlace en una sola visita y la información relevante debe comprobarse de inmediato. Según [DESIGN.md](../../DESIGN.md), solo la cartelera admite atracción visual moderada; en el registro, la portada identifica el evento y conserva la presencia sobria de la información y el formulario.

## Clarifications

### Session 2026-10-08

- Q: ¿Qué archivos debe admitir el organizador como portada de un evento? → A: JPEG, PNG y WebP estáticos, hasta 5 MiB (5 242 880 bytes) por archivo, con al menos 640 px de ancho y 360 px de alto; no se admiten imágenes animadas.
- Q: ¿Qué proporción deben tener las portadas en la cartelera y en la página de registro? → A: 16:9 en ambas vistas.
- Q: ¿Cómo deben mostrarse las imágenes que no coincidan con la proporción 16:9? → A: Recorte para llenar 16:9, centrado por defecto, con ajuste opcional del encuadre por el organizador.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dar identidad visual al evento (Priority: P1)

Como organizador con permiso para editar un evento, puedo subir una portada opcional, ajustar su encuadre si lo deseo y escribir su texto alternativo, para que las personas reconozcan el evento antes de reservar.

**Why this priority**: Permite aportar la imagen que distingue el evento sin añadir una condición de publicación ni una obligación de preparar material gráfico.

**Independent Test**: Usar un evento editable, añadir una imagen admitida y comprobar que permanece al volver a abrir su edición. Para un evento publicado, comprobar la misma portada en cartelera y registro.

**Acceptance Scenarios**:

1. **Given** un evento sin portada y un organizador con permiso de edición, **When** sube una imagen admitida y completa el guardado, **Then** el evento conserva esa portada y la muestra al volver a abrir su edición.
2. **Given** ese evento publicado, **When** una persona abre la cartelera y luego su registro, **Then** ve la portada del mismo evento en ambas superficies, junto con título, fecha y acción de reserva legibles.
3. **Given** una subida con texto alternativo escrito por el organizador, **When** se muestra la portada, **Then** ese texto es su alternativa accesible en ambas superficies.
4. **Given** una subida sin texto alternativo o con solo espacios, **When** se muestra la portada, **Then** tiene una alternativa no vacía que identifica la portada y contiene el título vigente del evento.
5. **Given** un evento sin portada que satisface las condiciones de publicación existentes, **When** el organizador lo publica, **Then** la ausencia de imagen no impide la publicación ni el registro.
6. **Given** una persona sin permiso de edición para ese evento, incluida una cuenta con permiso exclusivo de puerta, **When** intenta añadir, cambiar o quitar la portada, **Then** no puede modificarla.
7. **Given** imágenes estáticas JPEG, PNG y WebP de exactamente 640 × 360 px y hasta 5 242 880 bytes, **When** el organizador las sube y guarda, **Then** cada formato se acepta como portada.
8. **Given** un archivo de formato distinto, animado, dañado, de más de 5 242 880 bytes, de menos de 640 px de ancho o de menos de 360 px de alto, **When** el organizador intenta subirlo, **Then** se rechaza con una explicación comprensible en español y se conserva el estado guardado anterior.
9. **Given** una imagen admitida cuya proporción difiere de 16:9, **When** el organizador la guarda sin ajustar el encuadre, **Then** el guardado no exige ese ajuste y ambas superficies públicas muestran un recorte centrado que llena el área 16:9 sin deformación.
10. **Given** una imagen admitida, **When** el organizador ajusta opcionalmente el encuadre y lo guarda, **Then** el ajuste permanece al volver a abrir la edición y ambas superficies públicas muestran el encuadre elegido sin deformación.

---

### User Story 2 - Reconocer eventos y reservar con claridad (Priority: P1)

Como persona que reserva, puedo recorrer una cartelera con portadas y abrir un registro legible en móvil o escritorio, incluso si una imagen falta, tarda o no se puede cargar.

**Why this priority**: La identidad visual solo aporta valor si permite encontrar el evento y continuar el registro con la misma baja fricción del producto actual.

**Independent Test**: Mostrar eventos con imágenes horizontales, verticales y cuadradas, y otro sin imagen; recorrer cartelera y registro a 375 px y 1440 px, con carga normal, demorada y fallida.

**Acceptance Scenarios**:

1. **Given** eventos con imágenes de distintas dimensiones y orientaciones, **When** se muestra la cartelera, **Then** todas las áreas de portada tienen proporción 16:9, ninguna imagen se estira o aplasta y cambiar la imagen de una tarjeta no cambia su altura manteniendo el mismo ancho y contenido textual. Las imágenes llenan el área mediante recorte, centrado por defecto o con el encuadre guardado por el organizador. En el registro, el área de portada también tiene proporción 16:9 y muestra el mismo encuadre.
2. **Given** una portada cuya carga se demora, **When** pasa del estado de carga a imagen visible, **Then** título, fecha, acción de reserva y contenido situado debajo mantienen su posición tanto en cartelera como en registro.
3. **Given** un evento sin portada o una portada que no se puede cargar, **When** se abre la cartelera o el registro, **Then** aparece un marcador visual neutro y reconocible en el espacio de la portada, sin icono de imagen rota ni hueco vacío; la información y la reserva siguen disponibles.
4. **Given** portadas completamente claras, completamente oscuras, de alto contraste o con texto y patrones densos, **When** se consulta cualquiera de las dos superficies, **Then** título, fecha, sede y acción de reserva se leen completos y conservan su jerarquía, estén sobre la imagen o junto a ella.
5. **Given** un ancho de pantalla de 375 px, **When** se recorre la cartelera y se abre el registro, **Then** ambas vistas tienen una columna, no generan desplazamiento horizontal y permiten leer los datos y usar la acción de reserva sin solapamientos ni controles recortados.
6. **Given** un ancho de pantalla de 1440 px, **When** se recorre la cartelera y se abre el registro, **Then** las vistas respetan el contenedor y la cuadrícula de DESIGN.md, y el registro conserva la distribución de información del evento y formulario.
7. **Given** una portada pendiente de carga o fallida, **When** la persona continúa el registro, **Then** puede completar el flujo existente sin esperar a la imagen ni realizar pasos adicionales relacionados con ella.

---

### User Story 3 - Mantener o retirar la portada (Priority: P2)

Como organizador con permiso de edición, puedo cambiar o quitar la portada, ajustar opcionalmente su encuadre y actualizar su texto alternativo, para mantener la publicación al día sin recrear el evento.

**Why this priority**: Evita que una portada incorrecta o desactualizada obligue a rehacer el evento o a dejar de ofrecer reservas.

**Independent Test**: En un evento con portada, reemplazarla, volver a abrir ambas vistas públicas y después quitarla. Repetir con una sustitución fallida y comprobar que se conserva la portada anterior.

**Acceptance Scenarios**:

1. **Given** un evento con portada A, **When** el organizador guarda correctamente la portada B, **Then** al volver a abrir la cartelera y el registro se muestra B, y A deja de ser la portada del evento.
2. **Given** una portada con alternativa personalizada, **When** el organizador guarda otro texto alternativo, **Then** ambas superficies usan el texto nuevo sin exigir sustituir la imagen.
3. **Given** un evento con portada, **When** el organizador la quita correctamente, **Then** al volver a abrir ambas superficies se muestra el marcador sin portada y el evento mantiene su estado de publicación.
4. **Given** un intento de subida, sustitución o retirada que falla, **When** se informa del error, **Then** se conserva la última portada guardada, o la ausencia de portada si nunca hubo una, y se permite reintentar con un mensaje comprensible en español.
5. **Given** un evento con reservas y entradas existentes, **When** se añade, sustituye o quita su portada o se edita su alternativa o encuadre, **Then** no cambia su aforo, cupos, calendario, estado de publicación, reservas, entradas ni permisos.
6. **Given** una portada con encuadre guardado, **When** el organizador ajusta solo su encuadre y lo guarda, **Then** el cambio se refleja al volver a abrir cartelera y registro sin exigir sustituir la imagen.
7. **Given** una portada con encuadre guardado, **When** falla el guardado de otro encuadre, **Then** se conserva la imagen y el encuadre anteriores y se permite reintentar.
8. **Given** una portada con encuadre personalizado, **When** el organizador la sustituye sin ajustar el encuadre de la nueva imagen, **Then** la nueva portada usa un recorte centrado y no hereda el ajuste de la anterior.

### Edge Cases

- Un archivo de formato distinto de JPEG, PNG o WebP, animado, dañado, de más de 5 MiB, de menos de 640 px de ancho o de menos de 360 px de alto no se convierte en portada. El organizador recibe una explicación de qué debe corregir; la portada anterior se conserva.
- Una interrupción durante la subida o el guardado no se comunica como éxito. El estado de la operación y su resultado son perceptibles sin depender solo del color.
- Una imagen remota inaccesible muestra el mismo tratamiento visual que un evento sin portada; no bloquea el registro ni desplaza el resto del contenido.
- Una imagen vertical o panorámica no deforma el sujeto ni aumenta la altura de la tarjeta. Se recorta para llenar el área 16:9, usando el centro por defecto o el encuadre guardado; no aparecen bandas por diferencia de proporción.
- Un título largo conserva la legibilidad y no se solapa con la imagen ni el botón; la imagen por sí sola no cambia el espacio del contenido textual.
- Al cambiar el título, la alternativa derivada refleja el título vigente; una alternativa escrita por el organizador se conserva hasta que este la edite o la deje vacía.
- Al sustituir la portada, el organizador puede escribir la alternativa de la nueva imagen o dejarla vacía para derivarla del título; no se reutiliza silenciosamente una descripción personalizada de la imagen anterior.
- Los eventos existentes sin portada continúan visibles y reservables según sus condiciones actuales, con el mismo marcador que los eventos nuevos sin portada.
- El ajuste del encuadre es opcional: omitirlo no bloquea el guardado. Al sustituir o quitar la portada, su encuadre personalizado no se aplica a otra imagen.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El organizador con permiso de edición del Event DEBE poder añadir una única portada opcional, cambiarla y quitarla. El permiso exclusivo de puerta NO DEBE permitir esas acciones.
- **FR-002**: La portada NO DEBE convertirse en condición de creación, publicación o reserva del evento. Las condiciones de publicación existentes siguen vigentes.
- **FR-003**: La portada guardada de un evento público DEBE mostrarse en su tarjeta de «Próximos eventos» y en su página pública de registro. Tras cambiarla o quitarla correctamente, ambas superficies DEBEN reflejar el resultado al volver a abrirlas.
- **FR-004**: El organizador DEBE poder escribir y editar el texto alternativo de la portada. Cada imagen mostrada DEBE tener una alternativa no vacía: la escrita por el organizador o una derivada del título vigente si no escribió contenido. Se DEBE poder volver a la alternativa derivada dejando el campo vacío.
- **FR-005**: Las operaciones sobre la portada DEBEN indicar progreso, éxito o fallo con información comprensible en español, sin mensajes crudos del proveedor. Una operación fallida, incluido el guardado de un ajuste de encuadre, DEBE conservar la portada, el texto alternativo y el encuadre guardados anteriormente y permitir reintentar.
- **FR-006**: Se DEBEN comunicar las condiciones de archivo admitido antes de subir y rechazar archivos que no las cumplan, sin sustituir la portada anterior. Solo se admiten JPEG, PNG y WebP estáticos, con un máximo inclusivo de 5 MiB (5 242 880 bytes) por archivo y dimensiones mínimas inclusivas de 640 px de ancho y 360 px de alto. No se admiten imágenes animadas ni archivos dañados.
- **FR-007**: En la cartelera y el registro, todas las portadas DEBEN ocupar áreas con proporción 16:9, sin deformación de la imagen. A igual ancho y contenido textual, cambiar la imagen, quitarla o pasar de carga a éxito o fallo NO DEBE cambiar la altura de la tarjeta. Las imágenes DEBEN llenar el área mediante recorte sin deformación, centrado por defecto o con el encuadre guardado por el organizador.
- **FR-008**: En cartelera y registro, el espacio de portada DEBE conservar la proporción 16:9 y mantener sus dimensiones antes, durante y después de cargar, y también cuando falla la carga. La imagen NO DEBE desplazar el contenido de la página ni bloquear el flujo de reserva.
- **FR-009**: La ausencia o el fallo de una portada DEBE mostrar un marcador reconocible, con superficies y líneas neutras de DESIGN.md. NO DEBE mostrar un hueco vacío, una imagen rota, fotografías inventadas, gradientes, animación ornamental ni colores semánticos usados como adorno.
- **FR-010**: Título, fecha, sede y acción de reserva DEBEN seguir legibles y localizables cualquiera sea la imagen. La lectura de esos elementos NO DEBE depender de que la fotografía tenga un fondo claro, oscuro o uniforme. Sus combinaciones de texto y fondo DEBEN conservar el contraste previsto en DESIGN.md, sin que los colores de la imagen lo reduzcan. La fecha DEBE conservar su prioridad y la acción de reserva su posición al final de la tarjeta, según DESIGN.md.
- **FR-011**: Las vistas públicas DEBEN respetar la tipografía del sistema, las superficies blancas sobre lienzo frío, bordes neutros, redondeados y elevación de DESIGN.md. El azul DEBE conservar su función de acción, selección o dato prioritario; los colores de estado DEBEN comunicar estados reales.
- **FR-012**: A 375 px, cartelera y registro DEBEN funcionar en una columna, con márgenes laterales de al menos 1rem, sin desbordamiento horizontal ni solapamientos. A 1440 px DEBEN respetar el ancho máximo de 70rem, la cuadrícula de tarjetas y la distribución de información y formulario de DESIGN.md.
- **FR-013**: La incorporación de portadas DEBE conservar controles de al menos 2.75rem de alto, foco visible de 3px y recorrido por teclado. Ninguna acción necesaria para gestionar la portada o reservar DEBE depender exclusivamente de ver la imagen o interpretar un color.
- **FR-014**: La atracción visual moderada DEBE quedar en la cartelera. En el registro, la portada DEBE servir a la identificación del evento sin añadir efectos decorativos al formulario ni ocultar su información o controles.
- **FR-015**: Gestionar o mostrar portadas NO DEBE cambiar reglas ni datos de aforo, TicketType, Registration o Ticket, ni alterar calendario, publicación o permisos del Event. El registro mantiene sus pasos actuales.
- **FR-016**: El organizador con permiso de edición DEBE poder ajustar opcionalmente el encuadre al añadir o sustituir una portada, y editarlo después sin sustituir la imagen. El ajuste NO DEBE ser un paso obligatorio para guardar. El encuadre guardado DEBE permanecer al volver a abrir la edición y usarse en cartelera y registro; si no se ajusta, se DEBE usar un recorte centrado. Una imagen nueva NO DEBE heredar el encuadre personalizado de la anterior. El ajuste DEBE poder operarse con teclado y cumplir los controles y el foco de FR-013.

### Key Entities *(include if feature involves data)*

- **Event**: Evento existente cuya información permite decidir una reserva. Puede tener una portada o no tenerla, sin cambiar su identidad ni condiciones de registro.
- **Portada del Event**: Imagen opcional que identifica visualmente un único evento en cartelera y registro. Solo hay una portada vigente por evento; puede sustituirse o retirarse. Su encuadre está asociado a la imagen vigente, es centrado por defecto y puede ajustarse opcionalmente; el encuadre guardado se usa en ambas superficies públicas.
- **Texto alternativo de la portada**: Descripción accesible asociada a la imagen vigente, escrita por el organizador o derivada del título del Event. No sustituye al título visible, a la fecha ni a la acción de reserva.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En el 100% de los escenarios de añadir, sustituir y quitar portada con guardado correcto, volver a abrir cartelera y registro muestra la misma portada vigente o el mismo estado sin portada. En el 100% de operaciones fallidas se conserva el estado previo.
- **SC-002**: En cada ancho de prueba, el 100% de las áreas de portada de la cartelera y del registro tienen proporción 16:9. Al cambiar solo la imagen entre horizontal, vertical, cuadrada y ausente, la altura de una tarjeta varía 0 px y no aparece deformación.
- **SC-003**: Al demorar deliberadamente la carga y al hacerla fallar, el desplazamiento atribuible a la portada es 0 px: las posiciones del título, fecha, acción de reserva y contenido inferior coinciden antes y después, en ambas superficies y ambos anchos de prueba.
- **SC-004**: En todos los casos sin imagen o con carga fallida, ambas superficies muestran el marcador definido por FR-009, con 0 huecos vacíos y 0 indicadores de imagen rota. El registro sigue utilizable.
- **SC-005**: En la matriz visual de imágenes claras, oscuras, de alto contraste y con texto o patrones densos, el 100% de los títulos, fechas, sedes y acciones de reserva se leen sin quedar ocultos, recortados o solapados, con la jerarquía y el tratamiento de texto de DESIGN.md. El contraste entre texto y fondo de esos elementos no disminuye al sustituir una imagen por otra y conserva las combinaciones del sistema visual, tanto sobre la imagen como junto a ella.
- **SC-006**: A 375 px y 1440 px, cartelera y registro cumplen FR-011 a FR-014 en todos los estados de imagen: cargada, cargando, ausente y fallida. Hay 0 desbordamientos horizontales y 0 controles recortados; es posible abrir un evento y completar su registro con teclado o interacción táctil según corresponda.
- **SC-007**: El 100% de las portadas mostradas tienen texto alternativo no vacío. Las pruebas cubren texto personalizado, ausencia de texto, solo espacios, edición del texto, sustitución de imagen y cambio del título con alternativa derivada.
- **SC-008**: Añadir, cambiar o quitar portada y editar su alternativa o encuadre produce 0 cambios en capacidades, cupos consumidos, reservas, entradas, calendario, permisos y estado de publicación existentes. Publicar y reservar un evento sin portada conserva las condiciones y los pasos del flujo actual.
- **SC-009**: El 100% de los JPEG, PNG y WebP estáticos válidos de hasta 5 242 880 bytes y al menos 640 × 360 px se aceptan. Se rechaza el 100% de los casos de prueba de formato no admitido, animación, archivo dañado, exceso de tamaño o incumplimiento de cualquiera de las dimensiones mínimas, conservando el estado anterior. Las pruebas incluyen exactamente 5 242 880 bytes y un byte más, ancho de 640 y 639 px y alto de 360 y 359 px.
- **SC-010**: En imágenes horizontales, verticales y cuadradas admitidas, omitir el ajuste permite guardar y muestra un recorte centrado; ajustar y guardar conserva el encuadre elegido en edición, cartelera y registro a 375 px y 1440 px. El área 16:9 queda completamente cubierta, con 0 deformaciones y 0 bandas por diferencia de proporción. Editar solo el encuadre funciona con teclado; un guardado fallido conserva el encuadre anterior y sustituir la imagen sin ajuste restaura el recorte centrado.

## Assumptions

- Los actores y permisos son los existentes: el organizador autorizado edita el evento; la persona que reserva consulta sus superficies públicas; un permiso de puerta no otorga edición. Esto se deriva del alcance y de la constitución, sin añadir roles.
- La portada es opcional y sirve a la identificación visual; título, fecha, sede y acción de reserva continúan como información explícita, según PRODUCT.md y DESIGN.md.
- Las imágenes deben vivir en **Supabase Storage**, como restricción expresa del usuario. Esta spec no define tablas, buckets, políticas, endpoints ni componentes; esas decisiones pertenecen al plan.
- La presentación depende del sistema visual vigente de PRODUCT.md y DESIGN.md. La revisión visual de la implementación se hará con el skill **`impeccable`**, contrastando las capturas y los estados de prueba con esta spec. No se usa ese skill durante la especificación.
- Se conserva la constitución y el comportamiento existente de calendario, aforo, reservas, entradas, privacidad y permisos. Esta feature no introduce reglas nuevas en esos ámbitos.
