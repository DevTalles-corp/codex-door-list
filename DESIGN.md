---
name: Door List
description: Plataforma operativa para el registro y acceso ágil a eventos.
colors:
  canvas: "#f8fafc"
  surface: "#ffffff"
  text: "#0f172a"
  text-subtle: "#475569"
  text-muted: "#64748b"
  border: "#dbe3ee"
  border-strong: "#cbd5e1"
  trust-blue: "#2563eb"
  trust-blue-strong: "#1e40af"
  trust-blue-soft: "#eff6ff"
  success: "#166534"
  success-soft: "#f0fdf4"
  warning: "#92400e"
  warning-soft: "#fffbeb"
  danger: "#991b1b"
  danger-soft: "#fef2f2"
  disabled: "#e2e8f0"
typography:
  display:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3.25rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  control: "0.55rem"
  small: "0.75rem"
  panel: "1rem"
  card: "1.25rem"
  pill: "999px"
spacing:
  1: "0.25rem"
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  5: "1.5rem"
  6: "2rem"
  7: "3rem"
  8: "4rem"
components:
  button-primary:
    backgroundColor: "{colors.text}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.75rem 1rem"
    height: "2.75rem"
  button-secondary:
    backgroundColor: "{colors.disabled}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.75rem 1rem"
    height: "2.75rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0.75rem"
  event-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "1.5rem"
---

# Design System: Door List

## Overview

**Creative North Star: "La mesa de control"**

Door List se comporta como una superficie de operación: la jerarquía es inmediata, los datos se pueden recorrer rápidamente y cada control responde con claridad. La interfaz no compite con la tarea de registrar o verificar acceso.

La elevación separa los módulos de trabajo del lienzo sin volverlos ornamentales. El listado público de eventos es la única superficie que puede incorporar un toque de atracción visual para impulsar el registro; el resto del producto mantiene una presencia compacta y sobria.

**Key Characteristics:**

- Precisión legible para uso presencial y rápido.
- Azul de confianza reservado para acciones, selección y datos relevantes.
- Superficies elevadas, bordes finos y estados semánticos explícitos.
- Densidad contenida: todo elemento debe ayudar a decidir, registrar o comprobar.

## Colors

Una base fría y neutra hace que los datos respiren; el azul de confianza dirige la atención operativa y los colores de estado nunca se usan como adorno.

### Primary

- **Azul de confianza:** acción, selección, enlaces y progreso. Su versión intensa sostiene datos con prioridad alta y su versión suave identifica selección o contexto sin saturar la pantalla.

### Neutral

- **Lienzo frío:** fondo general de la aplicación y filas de tabla.
- **Superficie nítida:** formularios, tarjetas, tablas y paneles elevados.
- **Tinta operativa:** títulos, botones principales y datos que exigen lectura inmediata.
- **Texto de apoyo:** contexto, metadatos y etiquetas secundarias.
- **Líneas de estructura:** separación de tablas, módulos y campos.

### Named Rules

**The Trust Signal Rule.** El azul solo señala una acción, una selección o una métrica prioritaria; no se usa para llenar superficies completas.

**The Semantic State Rule.** Éxito, advertencia y peligro comunican estado operativo y no sustituyen al azul primario.

## Typography

**Display Font:** Arial, Helvetica, sans-serif

**Body Font:** Arial, Helvetica, sans-serif

**Label/Mono Font:** ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace para códigos de entrada.

**Character:** Una sans-serif del sistema, firme y familiar, mantiene la lectura rápida en pantallas de operación. El monoespaciado aparece únicamente cuando el código de una entrada debe poder verificarse carácter por carácter.

### Hierarchy

- **Display** (700, `clamp(2rem, 5vw, 3.25rem)`, 1.05): títulos de página y nombre de evento.
- **Headline** (700, `1.25rem`, 1.3): secciones y títulos de tarjetas.
- **Title** (700, `1.05rem`, 1.4): nombres compactos de métricas y contenidos.
- **Body** (400, `1rem`, 1.6): descripciones e información general.
- **Label** (600, `0.875rem`, 1.4): campos, controles y datos auxiliares.

### Named Rules

**The Scan-First Rule.** Los títulos y etiquetas mantienen peso alto; no se reduce el contraste ni se usa tipografía decorativa en las superficies de operación.

## Layout

El contenido usa un contenedor máximo de 70rem con márgenes laterales mínimos de 1rem. La escala espacial va de 0.25rem a 4rem y las páginas operativas se organizan en bloques con separaciones de 2rem a 3rem. Las tarjetas se adaptan en cuadrículas con un ancho mínimo de 18.75rem; a 43.75rem o menos, formularios, cabeceras y vistas públicas pasan a una sola columna.

La página de registro público se divide en información del evento y formulario hasta el punto de quiebre. Las tablas conservan el desplazamiento horizontal antes que comprimir sus datos hasta hacerlos ilegibles.

## Elevation & Depth

El sistema es elevado: tarjetas, paneles de registro y autenticación usan una sombra ambiental amplia y tenue (`0 18px 55px rgb(15 23 42 / 0.08)`) sobre superficies blancas. Los bordes fríos delimitan estructura; la sombra confirma agrupación y prioridad, no añade dramatismo.

### Shadow Vocabulary

- **Elevación de módulo:** `0 18px 55px rgb(15 23 42 / 0.08)`: tarjetas de eventos, registro, autenticación y entradas.
- **Foco operativo:** `0 0 0 3px rgb(37 99 235 / 0.28)`: foco visible para enlaces y controles.

### Named Rules

**The Work Surface Rule.** Las superficies elevadas contienen una tarea o unidad de información completa; no se apilan sombras para decorar.

## Shapes

Los controles usan esquinas suavemente redondeadas (0.55rem), los paneles 1rem y las tarjetas principales 1.25rem. Las píldoras se reservan para estados y tipos de entrada. Los límites se expresan con un borde fino y neutro, no con contornos pesados.

## Components

### Buttons

- **Shape:** rectángulo compacto de esquinas suaves (0.55rem) y altura táctil mínima de 2.75rem.
- **Primary:** tinta operativa sobre superficie blanca, con relleno de 0.75rem × 1rem y texto de peso 700.
- **Hover / Focus:** reduce levemente la opacidad en hover; el foco muestra un anillo azul de 3px. La presión desplaza 0.25rem hacia abajo.
- **Secondary:** gris suave con tinta operativa para acciones de menor jerarquía.

### Cards / Containers

- **Corner Style:** tarjetas principales de 1.25rem; paneles y métricas de 1rem.
- **Background:** superficie blanca sobre lienzo frío.
- **Shadow Strategy:** elevación ambiental en tareas autocontenidas.
- **Border:** borde fino neutro.
- **Internal Padding:** 1.5rem en tarjetas y 2rem en formularios o confirmaciones.

### Inputs / Fields

- **Style:** fondo blanco, borde estructural de 1px y radio de 0.55rem; relleno de 0.75rem.
- **Focus:** anillo azul visible de 3px.
- **Error / Disabled:** los errores se comunican en rojo suave con texto rojo; los controles deshabilitados reducen opacidad y no invitan a interactuar.

### Status Badges

- **Style:** píldora compacta con tipografía de 0.75rem y peso 800.
- **State:** publicado y válido usan verde; borrador y estado neutral usan gris; usado usa ámbar; revocado usa rojo.

### Event Cards

- **Style:** fecha prioritaria, título, sede, descripción opcional y acción de reserva al final de la tarjeta.
- **Expression:** el listado público puede sumar una intervención decorativa moderada que atraiga hacia el registro, sin ocultar fecha, sede ni llamada a la acción.

## Do's and Don'ts

### Do:

- **Do** usar superficies elevadas para formularios, tarjetas, entradas y módulos de datos.
- **Do** preservar controles de al menos 2.75rem de alto y foco visible de 3px.
- **Do** usar el azul de confianza para orientar acciones y selección, y los colores semánticos para estados.
- **Do** reservar la decoración ligera para el listado público de eventos.

### Don't:

- **Don't** introducir decoración en paneles, formularios, tablas, entradas o controles de puerta.
- **Don't** usar gradientes, animación ornamental o efectos que retrasen la lectura y comprobación.
- **Don't** sustituir etiquetas y texto de estado por color solamente.
- **Don't** reducir tablas o controles críticos hasta comprometer su uso táctil y presencial.
