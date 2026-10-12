---
target: Cartelera pública y registro de evento, con imagen y sin imagen (evaluación conjunta)
total_score: 24
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 1
target_identity: "file:/Users/teddypaz/Desktop/door-list/app/eventos/[id]/registro/public-registration.tsx"
target_fingerprint: "sha256:1d7e035e2bc7e1ed5f776e20f482774b53bc77f8ca87e66033b1b360905485d4"
target_path: /Users/teddypaz/Desktop/door-list/app/eventos/[id]/registro/public-registration.tsx
timestamp: 2026-10-09T16-02-39Z
slug: app-eventos-id-registro-public-registration-tsx
closed: true
---
Method: dual-agent (A: /root/design_review · B: /root/evidence_review)

La base es clara, pero la portada ocupa más protagonismo del que merece cuando no aporta información. El registro es sencillo; su punto más débil aparece después de enviar el formulario, cuando el asistente depende del correo.

## Especificidad y cuatro variantes

El lenguaje visual es coherente con Door List, aunque bastante genérico. La agrupación por fechas, los cupos y la reserva aportan identidad funcional; la personalidad visual depende de la imagen.

| Variante | Evaluación |
|---|---|
| Cartelera con imagen | Diferencia eventos y mantiene texto y acción legibles. Las tarjetas crecen demasiado en grupos pequeños. |
| Cartelera sin imagen | El gran bloque “Sin portada” transmite una pieza incompleta y retrasa nombre, fecha y reserva. |
| Registro con imagen | En escritorio, el formulario queda accesible en su columna. En móvil, portada y descripción alargan el recorrido hasta los campos. |
| Registro sin imagen | Conserva la estabilidad, pero dedica espacio a explicar una ausencia antes de presentar el evento. |

## Salud del diseño: 24/40 — aceptable, con mejoras relevantes

| Heurística | Puntos | Hallazgo principal |
|---|---:|---|
| Visibilidad del estado | 3/4 | Carga, errores y envío explícitos. |
| Lenguaje del usuario | 3/4 | Zona horaria técnica. |
| Control y libertad | 2/4 | Sin salida propia ni corrección del correo tras enviar. |
| Consistencia | 3/4 | Componentes y estados coherentes. |
| Prevención de errores | 3/4 | Validación y entradas agotadas deshabilitadas. |
| Reconocimiento | 3/4 | Contexto visible; plazo de confirmación explicado al final. |
| Eficiencia | 2/4 | Selección adicional incluso con una sola entrada. |
| Estética y minimalismo | 2/4 | Portadas vacías y fechas repetidas. |
| Recuperación de errores | 2/4 | Mensajes claros, pocas vías de recuperación. |
| Ayuda contextual | 1/4 | Falta orientación ante problemas con el correo. |
| Total | 24/40 | Aceptable. Todas las heurísticas aplican al flujo conjunto. |

## Lo que funciona

- Una acción principal inequívoca por evento y disponibilidad expresada con texto.
- Formulario corto, etiquetas claras, controles nativos y autocompletado.
- Información separada de la imagen: una portada clara, oscura o fallida no compromete la lectura del texto.

## Cinco prioridades

1. **[P1] El correo es un punto de bloqueo sin recuperación visible.** “Revisa tu email” no ofrece corregir dirección ni actuar si el mensaje no llega; el aviso de correo duplicado tampoco ayuda a recuperar la entrada. Explicar antes del envío la confirmación y sus diez minutos, y ofrecer recuperación después. Comando: `$impeccable harden`. Fuente: `app/eventos/[id]/registro/public-registration.tsx:152`, `:221–230`, `:250`. Hallazgo derivado del código; no se enviaron registros.
2. **[P2] La cartelera dedica demasiado espacio a la portada.** En vivo, con unos 680 px de contenido, una portada ausente ocupaba aproximadamente 362 px de alto y dejaba la reserva fuera de pantalla. Una tarjeta única puede expandirse hasta 1120 px: portada de unos 630 px. Limitar el crecimiento de tarjetas en todos los estados. Comando: `$impeccable layout`. Fuentes: `app/globals.css:59`, `:244`, `app/event-list.tsx:33–37`. FR007–009 exigen conservar el 16:9 sin imagen: compactar únicamente esa variante implica revisar el requisito, no corregir un incumplimiento.
3. **[P2] El registro móvil tarda en llegar a la tarea.** Portada, título, fecha y toda la descripción preceden al formulario. En la captura con título largo, este empieza alrededor de los 530 px. Añadir acceso directo a “Reservar entrada” y desplegar descripciones extensas bajo demanda. Comando: `$impeccable adapt`. Fuente: `app/eventos/[id]/registro/public-registration.tsx:237–248`. Captura de fixture verificada; efecto de descripción extensa derivado del código.
4. **[P2] Un evento totalmente agotado conserva un formulario editable.** Por enlace directo, nombre y correo siguen habilitados aunque ninguna entrada pueda elegirse y el envío esté deshabilitado. Mostrar un estado global “Entradas agotadas” y acceso a otros eventos. Comando: `$impeccable harden`. Fuente: `app/eventos/[id]/registro/public-registration.tsx:258–321`. Verificado en código, sin reproducción en vivo.
5. **[P2] Las fechas mezclan redundancia y expectativas incorrectas.** Se repite fecha breve y completa; `America/La_Paz` exige interpretar un identificador técnico. Además, “Esta semana” y “Este mes” representan próximos 7 y 31 días, no periodos de calendario. Simplificar fecha/hora, expresar la zona de forma humana y ajustar etiquetas o agrupación. Comando: `$impeccable clarify`. Fuentes: `app/event-list.tsx:49–56`, `lib/dates.ts:105–115`.

## Carga cognitiva y personas

La carga del formulario básico es baja; aumenta por la jerarquía de las portadas y la explicación tardía del plazo. No se observaron decisiones con más de cuatro opciones. El código no limita la lista de tipos: cinco o más opciones serían un riesgo condicionado a datos reales.

- Jordan, primera visita: entiende cómo reservar, pero no cómo resolver un correo duplicado.
- Casey, móvil: dispone de autocompletado, aunque debe recorrer demasiado contenido antes del formulario. Recargar pierde el borrador en estado React; cambiar de app por sí solo no demuestra pérdida.
- Sam, teclado o lector de pantalla: encuentra etiquetas y alertas adecuadas en código; falta comprobar funcionalmente el foco al aparecer la confirmación.

El recorrido empieza con claridad y termina con más incertidumbre: el plazo de diez minutos necesita una vía de ayuda. Como detalles menores, añadir “Ver otros eventos”, revisar selección obligatoria cuando solo existe “General” y comprobar el desplazamiento del contenido al terminar la carga inicial.

## Detector y alcance de evidencia

Detector: salida `[]`, exit 0, cuatro TSX explícitos (app/page.tsx, app/event-list.tsx, app/eventos/[id]/registro/public-registration.tsx, components/event-cover.tsx). Cero hallazgos primarios o advisories; no falsos positivos. CSS revisado manualmente. Esto coincide con una base técnica cuidada; los problemas principales son de composición y recorrido, que el detector no identifica.

Inspección en vivo: solo cartelera sin imagen, en pestaña nueva nativa de Chrome, viewport de contenido aproximado 680 px por paneles existentes. Capturas de fixtures existentes del 8 de octubre a 1440/375 y código/tokens sirven para las otras variantes. Correspondencia estructural, no certificación de bytes actuales. Registro sin imagen inferido del componente y captura de fallo; no hay captura exacta de ausencia. Imágenes sintéticas blancas/damero: no permiten valorar fotografía real, recorte ni dirección artística. No se enviaron registros ni se verificó finalización con teclado/lector de pantalla. No se modificó interfaz.

## Preguntas para decidir el siguiente paso

1. ¿Qué priorizamos: jerarquía y recorrido móvil; recuperación del registro; o las cinco prioridades?
2. ¿Qué tratamiento sin imagen prefieres: conservar 16:9 y limitar ancho en todos los estados; o revisar el requisito para permitir una variante compacta?
