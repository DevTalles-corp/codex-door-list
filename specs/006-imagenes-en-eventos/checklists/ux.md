# Checklist de UX visual, accesibilidad y casos borde: Imágenes en eventos

**Purpose**: Revisar la completitud, claridad, consistencia y cobertura de los requisitos de gestión de portadas y su presentación en cartelera y registro público.
**Created**: 2026-10-08
**Feature**: [Feature 006 — Imágenes en eventos](../spec.md)
**Profundidad**: Estándar.
**Actor y momento**: Revisor de requisitos, antes de la planificación y de la implementación; reutilizable durante la revisión de PR.
**Contexto disponible**: Spec, [constitución](../../../.specify/memory/constitution.md), [PRODUCT.md](../../../PRODUCT.md) y [DESIGN.md](../../../DESIGN.md). No existen todavía `plan.md` ni `tasks.md`.

**Note**: Checklist personalizada generada por `$speckit-checklist` a partir del alcance solicitado: UX visual, accesibilidad y casos borde de la subida de imágenes.
**Review Ownership**: La checklist pertenece al revisor. Solo este debe marcar `[x]` cuando determine que el criterio de calidad de requisitos está satisfecho.
**Marker Semantics**: `[x]` significa aprobación de la calidad del requisito; no significa que su implementación esté terminada. Todos los ítems se generan sin marcar.

## Completitud de requisitos

- [ ] CHK001 ¿Están documentados los estados visuales de la gestión de portada —sin imagen, imagen guardada, selección pendiente, validación, subida, guardado, éxito y fallo— y la información disponible en cada uno? [Completitud, Spec §FR-001, §FR-005, Gap]
- [ ] CHK002 ¿Se especifican la ubicación y la jerarquía del selector de archivo, la vista previa, la alternativa accesible, el ajuste de encuadre y las acciones de guardar, sustituir y quitar dentro de la edición del evento? [Completitud, Spec §FR-004, §FR-016, Gap]
- [ ] CHK003 ¿Están definidos los requisitos de ayuda previa sobre formatos, tamaño, dimensiones mínimas, exclusión de animaciones y carácter opcional de la portada y del encuadre? [Completitud, Spec §FR-002, §FR-006, §FR-016]
- [ ] CHK004 ¿Están especificados los tratamientos de imagen cargada, pendiente, ausente y fallida en ambas superficies públicas, incluida la conservación del espacio 16:9 y la disponibilidad del registro? [Completitud, Spec §FR-007–FR-009, §SC-003–SC-004]

## Claridad de requisitos

- [ ] CHK005 ¿Se define qué significa «progreso» durante la subida y el guardado, cuándo corresponde cada estado y qué información distingue una operación pendiente de una completada? [Claridad, Spec §FR-005, Ambiguity]
- [ ] CHK006 ¿Está aclarado cuándo una imagen seleccionada, su alternativa y su encuadre pasan a ser el estado guardado, y cómo se distingue visualmente la vista previa de la portada pública vigente? [Claridad, Spec §User Story 1, escenario 1, §FR-005, Gap]
- [ ] CHK007 ¿La definición del encuadre establece los ajustes permitidos, sus límites, la representación del recorte 16:9 y una forma comprensible de recuperar el centrado por defecto? [Claridad, Spec §FR-016, §SC-010, Gap]
- [ ] CHK008 ¿Se concreta el criterio de «marcador reconocible» y su tratamiento accesible, además de las restricciones visuales y de color ya definidas? [Claridad, Spec §FR-009, §FR-013, Ambiguity]

## Consistencia de requisitos

- [ ] CHK009 ¿Son consistentes entre edición, cartelera y registro los requisitos de portada vigente, encuadre guardado y alternativa personalizada o derivada del título? [Consistencia, Spec §FR-003–FR-004, §FR-016, §SC-001, §SC-007, §SC-010]
- [ ] CHK010 ¿Los requisitos de jerarquía, contraste, tipografía, superficies y uso de colores concuerdan con DESIGN.md y con la distinción entre atracción visual de la cartelera y sobriedad del registro? [Consistencia, Spec §FR-010–FR-014, DESIGN §Colors, §Typography, §Event Cards]
- [ ] CHK011 ¿La conservación del estado previo ante fallos comprende de forma consistente imagen, alternativa y encuadre al añadir, sustituir, quitar o editar solo metadatos? [Consistencia, Spec §FR-005, §User Story 3, escenarios 4 y 7, §SC-001]
- [ ] CHK012 ¿Los requisitos de gestión opcional de portada son consistentes con la conservación de publicación, permisos, calendario, reservas y pasos del registro? [Consistencia, Spec §FR-002, §FR-015, §SC-008]

## Calidad de criterios de aceptación

- [ ] CHK013 ¿Los criterios de estabilidad visual delimitan qué posiciones y dimensiones se comparan, bajo qué anchos y estados, y qué variación se admite al cambiar únicamente la portada? [Medibilidad, Spec §SC-002–SC-003]
- [ ] CHK014 ¿El requisito de contraste remite a umbrales numéricos o a combinaciones de texto y fondo inequívocas para información, controles, foco y mensajes de la gestión de portada? [Medibilidad, Spec §FR-010, §FR-013, §SC-005, Gap]
- [ ] CHK015 ¿Hay criterios de aceptación de accesibilidad para añadir, sustituir, quitar, editar alternativa y ajustar encuadre, además de los criterios existentes para las superficies públicas y el encuadre? [Criterios de aceptación, Spec §FR-013, §SC-006–SC-007, §SC-010, Gap]
- [ ] CHK016 ¿Los criterios de archivos admitidos cubren el máximo inclusivo en bytes y cada dimensión mínima de forma independiente, con el rechazo y la preservación del estado anterior explícitos? [Criterios de aceptación, Spec §FR-006, §SC-009]

## Cobertura de escenarios

- [ ] CHK017 ¿Los requisitos del flujo principal documentan selección, previsualización, ajuste opcional, alternativa y guardado, sin convertir los pasos opcionales en obligaciones? [Cobertura, Spec §User Story 1, escenarios 1, 3, 4, 9 y 10, §FR-016]
- [ ] CHK018 ¿Están definidos los escenarios alternativos de cancelar la selección, descartar cambios pendientes y abandonar la edición, incluida la conservación de la portada guardada y de los demás campos del evento? [Cobertura, Gap]
- [ ] CHK019 ¿Los requisitos de error y recuperación distinguen archivo rechazado, interrupción de subida, fallo de guardado y fallo de retirada, e indican qué información y cambios pendientes quedan disponibles para reintentar? [Cobertura, Spec §FR-005–FR-006, §User Story 3, escenario 4, Gap]
- [ ] CHK020 ¿Está definido el tratamiento de acciones simultáneas o repetidas —otra selección durante la subida, retirada con guardado pendiente y cambios desde dos sesiones— y cuál es la portada considerada vigente? [Cobertura, Spec §Key Entities, Gap]
- [ ] CHK021 ¿Los requisitos contemplan la pérdida de sesión o del permiso de edición durante una operación, con comunicación comprensible y preservación del estado autorizado anterior? [Cobertura, Spec §FR-001, §FR-005, Gap]

## Cobertura de casos borde

- [ ] CHK022 ¿Se especifica el tratamiento de archivos vacíos, dañados, animados y de formato declarado distinto de su contenido, así como de una selección múltiple pese al límite de una portada vigente? [Casos borde, Spec §FR-001, §FR-006, §Edge Cases, Gap]
- [ ] CHK023 ¿Están definidos el alcance admitido o las exclusiones para imágenes de dimensiones o proporciones extremas y fotografías con orientación incorporada, sin contradecir la aceptación de todos los archivos válidos descrita en SC-009? [Casos borde, Spec §FR-006–FR-007, §SC-009–SC-010, Gap]
- [ ] CHK024 ¿Los requisitos precisan cómo tratar imágenes con transparencia en la vista previa, en las superficies públicas y en la evaluación de legibilidad, manteniendo el sistema visual neutro? [Casos borde, Spec §FR-010–FR-011, Gap]
- [ ] CHK025 ¿Los requisitos cubren título y nombre de archivo largos, alternativa extensa o con solo espacios, y mensajes de error extensos, sin recortes, solapamientos ni pérdida de ayuda relevante? [Casos borde, Spec §FR-004, §FR-012, §Edge Cases, Gap]
- [ ] CHK026 ¿Está documentado el ciclo de vida de alternativa y encuadre al cambiar el título, sustituir o quitar la imagen y añadir una nueva, evitando reutilización silenciosa de datos de otra portada? [Casos borde, Spec §FR-004, §FR-016, §Edge Cases]
- [ ] CHK027 ¿Los requisitos distinguen el fallo de una nueva subida del fallo de disponibilidad de la portada guardada, con criterios de conservación y tratamiento visual coherentes en edición y superficies públicas? [Casos borde, Spec §FR-005, §FR-008–FR-009, Gap]

## Requisitos no funcionales y accesibilidad

- [ ] CHK028 ¿Se especifican nombres accesibles, etiquetas y asociación de instrucciones y errores para el selector de archivo, la alternativa, el encuadre y las acciones de gestión? [Accesibilidad, Spec §FR-004, §FR-006, §FR-013, §FR-016, Gap]
- [ ] CHK029 ¿Están definidos el orden de teclado y el destino del foco después de selección, error, sustitución y retirada, con foco visible y sin pérdida de acceso a los controles? [Accesibilidad, Spec §FR-013, Gap]
- [ ] CHK030 ¿La operación del encuadre con teclado está descrita con suficiente precisión, incluida la comunicación accesible del ajuste actual y una alternativa a cualquier interacción basada en arrastre? [Accesibilidad, Spec §FR-013, §FR-016, §SC-010, Gap]
- [ ] CHK031 ¿Se especifica cómo se comunican progreso, éxito y error a quienes utilizan lectores de pantalla y cómo se distinguen estos estados sin depender solo del color o de la vista previa? [Accesibilidad, Spec §FR-005, §FR-013, §Edge Cases, Gap]
- [ ] CHK032 ¿Los requisitos responsive cubren también la edición de portada, el encuadre y los mensajes, y definen el alcance para anchos intermedios, ampliación de texto y zoom además de 375 px y 1440 px? [Accesibilidad, Spec §FR-012–FR-013, §SC-006, Gap]
- [ ] CHK033 ¿Está especificado el tratamiento accesible de la ausencia o fallo de imagen y de la vista previa, evitando información redundante o contradictoria con la alternativa de la portada vigente? [Accesibilidad, Spec §FR-004, §FR-009, §SC-007, Gap]

## Dependencias y supuestos

- [ ] CHK034 ¿Las referencias a PRODUCT.md y DESIGN.md identifican los criterios aplicables a esta feature y permiten resolver cambios posteriores del sistema visual sin dejar ambiguos los requisitos? [Dependencias, Spec §Objetivo y contexto, §FR-010–FR-014, §Assumptions]
- [ ] CHK035 ¿Está documentada la expectativa de disponibilidad del almacenamiento y de conectividad, junto con el tratamiento de latencia prolongada y un límite o criterio para ofrecer recuperación? [Dependencias, Spec §FR-005, §FR-008, §Assumptions, Gap]

## Ambigüedades y conflictos

- [ ] CHK036 ¿Está aclarado si las acciones de añadir, sustituir y quitar se guardan de inmediato o junto al formulario del evento, y qué representa el éxito cuando la portada y otros cambios del evento tienen resultados distintos? [Ambigüedad, Spec §User Story 1, escenario 1, §FR-005, Gap]
- [ ] CHK037 ¿La exigencia de alternativa no vacía para cada imagen y el tratamiento del marcador neutro distinguen expresamente la portada informativa de los elementos decorativos? [Ambigüedad, Spec §FR-004, §FR-009, §SC-007]
- [ ] CHK038 ¿La igualdad del encuadre entre cartelera y registro está definida como conservación de la misma región visible, incluso con anchos distintos y después de sustituir la portada? [Claridad, Spec §FR-007, §FR-016, §SC-010]

## Notes

- Marcar `[x]` solo después de que el revisor determine que el criterio de calidad de requisitos está satisfecho.
- Mantener sin marcar los ítems pendientes de aclaración, corrección o evaluación; esta generación no evalúa ni aprueba los requisitos.
- `$speckit-implement` lee el estado de la checklist como condición de avance y no debe modificar sus marcadores.
- `checklists/requirements.md` tiene un ciclo de vida separado, mantenido por `$speckit-specify` y `$speckit-clarify`.
- `[Gap]` señala un aspecto cuya cobertura debe revisar el revisor; no introduce automáticamente un requisito nuevo ni declara un fallo de implementación.
- Las referencias `Spec §FR-…` y `Spec §SC-…` corresponden a los identificadores de la spec; los escenarios se referencian por historia y número.
- Registrar hallazgos, decisiones y vínculos a aclaraciones junto al ítem correspondiente. Los IDs son consecutivos para facilitar su seguimiento.
