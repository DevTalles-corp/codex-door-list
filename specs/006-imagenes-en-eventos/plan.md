# Implementation Plan: Feature 006 — Imágenes en eventos

**Branch**: `006-imagenes-en-eventos` | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

**Input**: `specs/006-imagenes-en-eventos/spec.md`

## Summary

Añadir una portada opcional por Event, gestionada por su propietario, con alternativa accesible y encuadre opcional. Cartelera y registro compartirán una portada 16:9; la información y reserva permanecerán fuera de la fotografía sobre las superficies del sistema visual.

Subir directamente a un bucket privado de Supabase Storage con firma emitida por API autenticada. Una segunda petición pequeña validará los bytes y publicará un objeto nuevo e inmutable. Solo entonces se cambiará la referencia en una transacción con control de revisión. Operaciones persistidas y limpieza reintentable permiten resolver concurrencia y respuestas perdidas sin perder la portada vigente. No cambia aforo, calendario, publicación, reservas, entradas ni permisos.

## Technical Context

**Language/Version**: TypeScript 5.9.3; Node.js >=22, exigido por Supabase JS instalado. Código/contratos en inglés; interfaz en español.

**Primary Dependencies**: Next.js 16.3.3 App Router, React 19.2.8, `@supabase/supabase-js` 2.112.4, Tailwind CSS 4 y tokens CSS existentes. Declarar sharp 0.35.3 como dependencia de producción explícita; hoy es dependencia opcional de Next. Sin biblioteca de recorte adicional.

**Storage**: PostgreSQL; `event_covers`, `event_cover_operations`, `event_cover_cleanup_jobs`; bucket privado `event-cover-uploads` y público `event-covers`. Nueva migración versionada; historial existente intacto.

**Testing**: pgTAP para esquema, RLS/grants y commits; sesiones independientes para concurrencia; Playwright 1.63.0 para API, Storage local real, flujo de reserva y matriz visual. Runner aislado Docker/Supabase CLI siguiendo `tests/db/`. Ver [quickstart.md](quickstart.md).

**Target Platform**: Web responsive; runtime Node para decodificación. Hosting no especificado en repo; transporte compatible con límites de Functions, incluido Vercel.

**Project Type**: Aplicación Next.js existente con Route Handlers y RPC PostgreSQL.

**Performance Goals**: Desplazamiento atribuible a portada de 0 px; altura constante a igual ancho/texto; formulario independiente de la carga de imagen. Next Image con `sizes`, lazy loading y objetos inmutables. Descarga limitada a 5 242 880 bytes, concurrencia de decode acotada y timeout operativo; agotamiento de recursos implica fallo temporal reintentable.

**Constraints**: JPEG/PNG/WebP estáticos, <=5 MiB, mínimo 640 × 360 px tras orientación EXIF. Sin nuevo máximo de píxeles/dimensiones. 16:9; encuadre normalizado; 375/1440 px, contenedor 70rem, controles >=2.75rem y foco 3px. Mutaciones solo owner; puerta no autoriza. Paths/IDs técnicos aleatorios de 256 bits, sin nombres originales ni IDs de Event/usuario.

**Scale/Scope**: Eventos pequeños/medianos; una portada vigente por Event, dos vistas públicas y editor en organización existente. Sin galería, transformación de pago, zoom o cambios al registro. Retención de candidatos limitada por firmas y limpieza durable.

## Constitution Check

*GATE: comprobación antes de Phase 0 y después de Phase 1.*

| Gate | Antes de investigación | Después del diseño |
|---|---|---|
| I. Spec y migraciones | PASS: FR-001–FR-016 y SC-001–SC-010 existen | PASS: migración nueva, sin reescrituras; contratos y pruebas trazables |
| II. Calendario | PASS: sin nuevas reglas | PASS: timestamps técnicos UTC; zona/cierre/ingreso y helpers preservados |
| III. Identidad/reservas | PASS: política existente intacta | PASS: ninguna mutación escribe reservas/Registration/Ticket; regresión por email |
| IV. Aforo | PASS: sin regla nueva | PASS: cálculo público intacto; snapshots de consumo/capacidades; publicación sin portada |
| V. Acceso/auditoría | PASS: solo owner y sin PII de asistentes | PASS: autorización transaccional, URLs de 256 bits, puerta independiente, auditoría intacta |
| AGENTS.md | PASS: estructura y contratos existentes identificados | PASS: camelCase en nuevos contratos, snake_case SQL, errores `{ error: string }`, tipos en lib y RLS |
| UI | PASS: PRODUCT.md/DESIGN.md compatibles | PASS: texto fuera de imagen, cuadrícula responsive, fallback neutro y encuadre con teclado |

**Resultado**: ambos gates pasan; sin desviaciones ni decisiones técnicas pendientes. `checklists/ux.md` continúa pendiente de revisión y este comando no aprueba sus ítems. Las notas históricas de `checklists/requirements.md` sobre Q1–Q3 están desactualizadas respecto a la spec aclarada; se usa `spec.md` como autoridad sin editar esa checklist.

## Project Structure

### Documentation (this feature)

```text
specs/006-imagenes-en-eventos/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── event-covers.md
│   └── cover-ui.md
└── checklists/
```

`tasks.md` corresponde a `$speckit-tasks`; no se genera aquí.

### Source Code (repository root)

Archivos previstos, no creados por este comando:

```text
app/
├── organizer.tsx
├── event-cover-editor.tsx
├── event-list.tsx
├── globals.css
├── eventos/[id]/registro/public-registration.tsx
└── api/eventos/[id]/portada/
    ├── route.ts
    ├── subidas/route.ts
    ├── confirmar/route.ts
    └── operaciones/[operationId]/route.ts
components/event-cover.tsx
lib/
├── types.ts
├── event-cover-types.ts
├── event-cover.ts
├── event-cover-validation.ts
├── event-cover-service.ts
└── supabase/                              # clientes existentes
scripts/cleanup-event-covers.mjs
supabase/
├── migrations/<new_timestamp>_event_covers.sql
└── tests/event_covers.test.sql
tests/
├── db/run-event-covers.mjs
└── e2e/
    ├── event-covers.spec.ts
    └── fixtures/event-covers/
next.config.ts
package.json / package-lock.json
README.md
```

**Structure Decision**: Editor local a `app/organizer.tsx`, su único consumidor. Compartir portada/helpers entre cartelera y registro. Páginas servidor siguen servidor; editor y eventos `onLoad`/`onError` justifican subárboles cliente. No migrar autenticación o fetching cliente heredado. Validación/servicio serán server-only; clientes Supabase permanecen en `lib/supabase/`.

## Phase 0 — Research

Completada en [research.md](research.md), con agentes de investigación para Storage/autorización y decode/renderizado. Context7 proporcionó documentación actual; lockfile y código instalado verificaron diferencias sensibles de versión.

Resueltos: transporte 5 MiB, permisos, validación/animación/orientación, encuadre, persistencia/CAS, reintentos, limpieza, Next Image/caché, guardado independiente y runner con Storage activo.

## Phase 1 — Design & Contracts

- [data-model.md](data-model.md): entidades, validaciones, relaciones, estados y RLS.
- [contracts/event-covers.md](contracts/event-covers.md): HTTP, proyecciones, transacciones y worker.
- [contracts/cover-ui.md](contracts/cover-ui.md): composición, editor, accesibilidad y estados.
- [quickstart.md](quickstart.md): escenarios y comandos para la futura implementación.

Secuencia prevista: migración/buckets/políticas y ampliación de RPC; servicio/HTTP; editor/componente compartido; integración pública; verificación. El desglose ejecutable pertenece a `tasks.md`.

## Complexity Tracking

Sin violaciones que justificar. Ledger y cola se limitan a portadas: PostgreSQL y Storage no comparten transacción, y es necesario recuperar timeouts/eliminaciones fallidas sin perder la referencia vigente.
