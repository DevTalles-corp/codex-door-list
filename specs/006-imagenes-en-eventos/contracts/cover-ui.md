# Contract: Cover UI

**Spec**: [../spec.md](../spec.md) | **HTTP**: [event-covers.md](event-covers.md)

## Dirección y alcance

Autoridad visual: `PRODUCT.md`, `DESIGN.md` y skill `door-list-ui`. Cartelera ayuda a reconocer/decidir; registro y editor sirven a una tarea operativa. La fotografía aporta identidad; no se añaden gradientes, decoración del formulario, animación ornamental, color de estado decorativo ni nuevos claims de producto.

Integrar en UI activa: `app/event-list.tsx`, `app/eventos/[id]/registro/public-registration.tsx` y organización actual. Conservar fechas/zonas, grupos, orden, disponibilidad, enlaces aleatorios y pasos de reserva. Mantener los estados de colección existentes; actualizar su skeleton a la nueva anatomía.

## Portada compartida

`components/event-cover.tsx` recibe título y `EventCover | null`; sin fetching de datos ni escritura. Wrapper relativo de ancho completo y `aspect-ratio: 16 / 9`, overflow recortado, independiente de dimensiones naturales. Next Image `fill`, `object-fit: cover`, posición guardada multiplicada por 100 y `sizes` adaptado a cada contenedor. Aplicar EXIF antes del recorte; preview original usa `image-orientation: from-image`.

Allowlist exacta de host y path `/storage/v1/object/public/event-covers/**` en `next.config.ts`, construida desde la URL configurada. Desarrollo/Playwright con Supabase local requiere permitir IP local únicamente fuera de producción. No permitir cualquier host, buckets privados o URLs arbitrarias. Usar original validado como intento de recuperación si falla únicamente el optimizador (por timeout/límite operativo); si original también falla, mostrar fallback. Máximo un intento de recuperación por identidad, sin bucle de errores ni alterar geometría.

| Estado | Visual | Accesibilidad / comportamiento |
|---|---|---|
| Sin portada | Superficie neutra, líneas neutras y símbolo sencillo de imagen/evento con «Sin portada» | Símbolo decorativo aria-hidden; texto no sugiere error operativo |
| Cargando | Mismo espacio y marcador neutro bajo imagen invisible hasta load | No bloquea reserva ni anuncia repetidamente estados de muchas tarjetas |
| Cargada | Imagen llena 16:9; sin deformación ni bandas por proporción | Alt personalizado trim o `Portada de ${title}` |
| Fallida | Ocultar/unmount imagen rota; mismo marcador neutro | «Portada no disponible» sin icono roto; registro sigue utilizable |

Estado se reinicia al cambiar identidad del archivo. Actualizar título/alt/posición sin sustituir archivo no reinicia la carga. PNG/WebP con transparencia se compone sobre superficie neutra del sistema; el texto informativo está fuera de la imagen. El marcador no es una fotografía inventada ni una imagen informativa que exija otro alt.

## Cartelera

Cambiar las filas actuales de `AgendaEvent` a tarjetas blancas elevadas y cuadrícula dentro de cada grupo existente. No conservar el fondo azul del primer evento como adorno. Anatomía: portada → fecha prioritaria → título → sede/horario/descripción existente → disponibilidad y acción final. Fecha mantiene su azul prioritario; estado de cupo conserva semántica real. Título y sede completos; descripción puede conservar el tratamiento resumido existente. Acción «Reservar entrada» al final, con nombre accesible específico del Event. Agotado mantiene su estado/ausencia de reserva actuales.

Cuadrícula fluida de mínimo 18.75rem, usando mínimo adaptable al ancho disponible para no desbordar. A <=43.75rem una columna; a 1440 px contenedor máximo 70rem. Gutter >=1rem. Dentro de cada tarjeta usar flex/grid para llevar acción al final, sin alturas derivadas de la imagen. A mismo ancho y mismo texto, imagen horizontal/vertical/cuadrada/ausente y load/error producen exactamente la misma altura.

Skeleton mantiene portada 16:9 y posiciones aproximadas de fecha/título/acción; colección anuncia una sola vez «Cargando próximos eventos…». Mantener estados vacío/error y retry. No mostrar estado vacío antes del resultado.

## Registro

Añadir portada en el bloque de información del Event, separada de h1, fecha, sede y descripción. A escritorio conservar información y formulario en columnas actuales; móvil una columna. La portada no aparece dentro de opciones, campos, feedback de reserva o confirmación. Imagen lenta/fallida no modifica la selección ni bloqueo/submitting del registro. No cambia email, verificación, generación de Ticket ni pantalla de confirmación.

## Editor

Editor local `app/event-cover-editor.tsx`, integrado para Event existente y fuera del formulario de configuración para evitar formularios anidados. Guardado de portada independiente; etiqueta explícita «Guardar portada». Cambios pendientes de título/aforo/calendario se conservan y no se envían en esta petición. Creación no exige portada; ayuda «Puedes añadir una portada después de crear el evento.»

Secuencia:

1. Sección «Portada del evento» con indicación de opcionalidad.
2. Preview de portada guardada o marcador; feedback del editor.
3. Selector de un archivo, etiqueta visible y ayuda: «JPEG, PNG o WebP sin animación. Máximo 5 MiB; al menos 640 × 360 px.»
4. Preview local de selección admitida provisionalmente; servidor es autoridad de validación.
5. Campo «Texto alternativo», opcional; ayuda explica que vacío usa título vigente. Mostrar alternativa derivada para comprender resultado.
6. «Posición horizontal» y «Posición vertical»: ranges nativos 0–100, step 1, porcentaje textual, convertidos a 0..1; «Centrar encuadre» vuelve a 50/50. Si un eje no recorta, explicar su falta de efecto; nunca exigir ajuste.
7. «Guardar portada», «Descartar cambios» y, si hay imagen guardada, «Quitar portada».

Nueva selección siempre inicia con alternativa vacía/posición centrada. Editar solo alt/encuadre usa PATCH; selección nueva prepara/sube/confirma; quitar usa DELETE independiente. Cancelar selector conserva draft; descartar/abandonar restaura último estado guardado sin tocar otros campos del Event. Abandonar staging crea solo limpieza futura, no una portada pública. Al cambiar Event destruir/revocar objectURL local y no mezclar drafts.

## Estados de mutación y recuperación

| Estado | Copy / controles |
|---|---|
| Idle / sin cambios | Portada guardada identificable; controles de edición disponibles |
| Draft | Preview indica «Vista previa; cambios sin guardar»; no presenta selección como portada vigente |
| Preparing/uploading | «Preparando subida…» / «Subiendo portada…»; progreso indeterminado si SDK no ofrece porcentaje real |
| Validating/saving | «Validando portada…» / «Guardando portada…»; aria-busy y role=status |
| Removing | «Quitando portada…»; bloquear acciones conflictivas |
| Success | «Portada guardada.» / «Portada retirada.»; estado actual confirmado |
| Invalid/failed | Explicación específica propia, role=alert; conservar saved state y draft recuperable; retry disponible |
| Conflict | Explicar cambio en otra sesión; «Cargar portada actual»; preservar draft para decisión explícita, sin overwrite automático |
| Session lost | Pedir iniciar sesión de nuevo; no comprometer sin owner; saved state preservado |
| Result unknown | «Estamos comprobando si se guardó la portada…»; recuperar operación; si inaccesible, «Comprobar de nuevo» |

Durante operación bloquear selección/retirada/guardado/encuadre conflictivos. El formulario general del Event no debe cambiar de Event ni eliminarlo durante upload; coordinar busy local sin enviar otros campos. Fallo temporal conserva archivo/alt/posición para reintentar; archivo inválido requiere corregir selección. Fallo de cleanup posterior no muestra falso fallo al organizador.

No imponer un límite de alt ni truncar texto guardado sin requisito; inputs/mensajes/nombres largos se envuelven sin overflow. Solo tratar el alt como texto plano. No mostrar mensajes crudos de Storage. El editor distingue falla de carga de imagen guardada de falla de guardar una selección nueva.

## Teclado, foco y responsive

Orden: selector → alternativa → ejes → centrar → guardar → descartar → quitar. Ranges nativos funcionan con flechas/Home/End y exponen valor/nombre; controles >=2.75rem y foco 3px con tokens existentes. No acción exclusivamente por arrastre o color. Foco permanece en control tras selección/cambio de eje; error resumen recibe foco si ayuda; retirada devuelve foco a selector disponible. Éxito se anuncia sin robar foco; refresh no mueve foco.

Asociar ayuda/error mediante aria-describedby; errores role=alert, progreso/éxito role=status, preview con nombre que indique provisionalidad. Quitar botón solo aparece si hay imagen, pero gestión restante no desaparece. En 375 px editor/formularios tienen una columna y mensajes/ranges no desbordan. Verificar zoom 200%, texto largo y breakpoint 700 px además de 375/1440. Sin animación ornamental; transiciones respetan reduced-motion.

## Verificación visual

Aplicar `door-list-ui` durante implementación y `impeccable` en revisión: una inspección batched a 375/1440 px con claros/oscuros/alto contraste/patrones, horizontal/vertical/cuadrada/transparencia/EXIF y load/ausente/error; arreglar defectos juntos y confirmar como máximo una vez. Medir altura/bounding boxes, overflow, relación 16:9, región visible y contraste de texto sobre superficies del sistema. Referencias y matriz en [../quickstart.md](../quickstart.md).
