# Tasks: Feature 006 — Imágenes en eventos

**Input**: Documentos de diseño de `/specs/006-imagenes-en-eventos/`.
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/event-covers.md`, `contracts/cover-ui.md`, `quickstart.md` y `.specify/memory/constitution.md`.
**Tests**: Incluidos porque SC-001–SC-010 de la spec requieren pruebas explícitas de límites, estados visuales, encuadre e invariantes; el plan concreta pgTAP, sesiones independientes y Playwright con Storage local real. Escribir los casos antes de su implementación y comprobar que detectan el comportamiento ausente. Este documento no afirma que se hayan ejecutado.
**Organization**: Historias en orden US1 (P1), US2 (P1), US3 (P2). US1 incluye una integración pública mínima para cumplir su aceptación; US2 completa la presentación y su resistencia a fallos. El repositorio ya existe: no reinicializar aplicación, autenticación ni esquema histórico.

## Format: `[ID] [P?] [Story] Description`

- `[P]`: tareas en archivos distintos ejecutables en paralelo dentro de la ventana indicada en dependencias, una vez satisfechos sus prerrequisitos.
- `[US1]`, `[US2]`, `[US3]`: historia de `spec.md`; setup, foundation y polish no llevan etiqueta de historia.
- Todos los paths son relativos a la raíz del repositorio; los nombres adicionales de helpers/tests concretan el diseño sin cambiar sus contratos.
- Antes de escribir código de Next.js o usar sintaxis de bibliotecas/CLI, consultar documentación actual mediante Context7 conforme a `AGENTS.md`; usar `door-list-ui` al implementar UI e `impeccable` en la revisión visual solicitada. Server Components por defecto; cliente solo para selección, interacción y callbacks de imagen. Código/tipos en inglés, copy en español.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preparar dependencia explícita y verificación aislada con Storage, sin tocar proyectos remotos ni datos de desarrollo.

- [X] T001 Declarar sharp 0.35.3 como dependencia de producción en `package.json` y `package-lock.json`, y Node >=22 en `package.json`; conservar las versiones actuales de Next/React/Supabase y comprobar disponibilidad del binario opcional en la plataforma.
- [X] T002 [P] Crear el entorno local aislado en `tests/db/local-event-cover-environment.mjs` y su entrypoint `tests/db/run-event-covers.mjs`, tomando como referencia `tests/db/local-capacity-environment.mjs`: proyecto/puertos propios, Storage activo, rechazo de URLs remotas, claves sin imprimir, datos pre-migración sintéticos para verificar upgrade, aplicación de migraciones y teardown solo del proyecto propio; reservar ejecución secuencial del navegador en 3100/3101.
- [X] T003 [P] Crear generación reproducible de fixtures en `tests/e2e/event-cover-fixtures.ts` y `tests/e2e/fixtures/event-covers/`: JPEG/PNG/WebP estáticos sanos, 640×360/639×360/640×359, exactamente 5 242 880 bytes mediante metadata/padding válido y +1 byte, vacío/dañado/GIF/SVG/APNG/WebP animado incluso de una imagen, MIME/extensión falsificados, PNG con acTL no estructural, EXIF 1–8, transparencia, proporciones extremas y patrones claros/oscuros/densos; incluir actores owner/otro owner/door-only y reloj/fallos controlados para pruebas posteriores.

**Checkpoint**: Dependencia declarada y harness/fixtures disponibles; todavía no implementar historias.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos, persistencia segura y contratos comunes. Esta fase bloquea las tres historias.

- [X] T004 [P] Centralizar DTOs, estados y requests/responses de ambos contratos en `lib/event-cover-types.ts`, ampliando `lib/types.ts` sin redefinir tipos en rutas: revisión bigint como cadena decimal, ID de operación de 64 hex, cover nullable, `OrganizerEventCover.altText` nullable y `EventCover.altText` efectivo no vacío; añadir solo claves camelCase nuevas y reutilizar `ApiErrorResponse`.
- [X] T005 Crear la migración nueva `supabase/migrations/20261008120000_event_covers.sql` con `event_covers`, RLS, SELECT solo owner y sin mutaciones anon/authenticated; reproducir literalmente restricciones de `data-model.md`: `event_id` «Event existente; una fila por Event», `revision` «>=0, inicia en 0, aumenta con cada cambio comprometido», `object_path` «Solo path generado/validado por servicio; null significa sin portada», `media_type` «`image/jpeg`, `image/png` o `image/webp`», `byte_size` «1..5 242 880 inclusive», `width`/`height` «Dimensiones orientadas; >=640 / >=360», `content_hash` «SHA-256 de bytes originales validados», `alt_text` «Trim; vacío/espacios → null; contenido plano», posiciones «Finito, 0..1 inclusive; centro 0.5» y `updated_at` «UTC, hora del commit»; coherencia null/metadatos/centro, unique path, backfill revisión 0 y trigger de alta; no escribir portada mediante `update_event_configuration`.
- [X] T006 Añadir `event_cover_operations` y funciones internas comunes de autorización/claim/cercado en `supabase/migrations/20261008120000_event_covers.sql` después de T005: `operation_id` «text PK; 64 caracteres hex, generado con 32 bytes aleatorios», `event_id` «uuid nullable FK, `ON DELETE SET NULL`», `actor_id` «uuid nullable FK a usuario, `ON DELETE SET NULL`», `kind` «upload / metadata / remove», `expected_revision` «bigint no negativo», `request_fingerprint` «hash nullable; fijado al aceptar payload definitivo», `staging_path` «text nullable unique; persistido antes de emitir firma», `upload_expires_at` «timestamptz nullable; vencimiento de firma de dos horas», `state` «pending / processing / prepared / committed / rejected / conflict / expired», `lease_token`/`lease_until` «token de cercado y límite UTC; solo poseedor vigente avanza», `candidate_path` «text nullable; clave aleatoria de intento vigente, registrada antes de publicar», `validated_metadata` «jsonb nullable; MIME, tamaño, dimensiones orientadas, hash verificados», `requested_metadata` «jsonb nullable; alternativa/posiciones congeladas por fingerprint», `result_revision`/`result_snapshot` «resultado comprometido inmutable, sin firma de upload» y timestamps «timestamptz UTC»; índices del modelo, RLS sin SELECT general, service-only y search_path fijo; locks Event → EventCover → Operation → jobs, preautorización y reautorización bajo lock sin I/O externo. Añadir `processing_deadline_at` «timestamptz nullable UTC; fijado en cada claim y sin extensión durante ese intento»; persistir deadline y lease a partir de duraciones validadas de T008, sin recalcular intentos vivos cuando cambie la configuración.
- [X] T007 Añadir `event_cover_cleanup_jobs` y buckets/políticas en `supabase/migrations/20261008120000_event_covers.sql` después de T006: `id` «bigint identity PK, interno», `operation_id` «text nullable FK, `ON DELETE SET NULL`», `bucket_id`/`object_path` «text, unique conjunto; buckets permitidos solamente», `due_at`/`next_attempt_at` «timestamptz UTC», `state` «pending / processing / done», `attempts` «integer >=0», leases «claim de worker y cercado», `last_error_code` «código técnico sin PII, tokens ni mensajes crudos» y timestamps «timestamptz UTC»; índice `(state, next_attempt_at)`, RLS/service-only y supervivencia a eliminación de Event/actor. Configurar staging «Privado, 5 242 880 bytes, `application/octet-stream`, upsert false» y final «Público, 5 242 880 bytes, MIME JPEG/PNG/WebP, keys inmutables», sin lectura/listado staging ni escritura/listado de navegador; paths uploads/covers con 32 bytes aleatorios independientes, sin nombres ni IDs de Event/usuario.
- [X] T008 Crear base server-only de `lib/event-cover-service.ts` reutilizando `lib/supabase/server.ts` y `lib/supabase/admin.ts`: verificar JWT/getUser y owner antes de servicio, normalizar payload/fingerprint vinculados a actor/Event/kind/revisión, impedir paths/URLs/bucket/actor del cliente, generar IDs criptográficos y mapear errores propios en español con HTTP 400/401/403/404/409/413/422/500/503 conforme al contrato; no filtrar claves, firmas ni mensajes crudos. Crear fuente única server-only `lib/event-cover-config.json` con decodeConcurrency=1, decodeTimeoutMs=30000, storageRequestTimeoutMs=30000, processingTimeoutMs=120000, processingLeaseMs=180000 y cleanupTransferMarginMs=300000; validar enteros positivos, deadline >=timeouts individuales, lease >deadline y margen >=300000, pasar duraciones verificadas a SQL con validación equivalente y conservar deadlines UTC; ajustar mediante esta configuración tras verificar hosting, sin duplicar constantes en API/decoder/worker.
- [X] T009 Implementar helpers compartidos en `lib/event-cover.ts` después de T004: normalización alt «Trim; vacío/espacios → null; contenido plano», sin máximo inventado; alt público custom o `Portada de ${currentEventTitle}` sin persistir derivado, posiciones «Finito, 0..1 inclusive; centro 0.5», y conversión de objectPath a URL exclusivamente del bucket/host configurados; mantener snake_case limitado a persistencia y reutilizar `lib/dates.ts` para fechas existentes.

**Checkpoint**: Esquema/grants/contratos listos; las historias pueden usar estos límites comunes.

---

## Phase 3: User Story 1 — Dar identidad visual al evento (Priority: P1) — MVP

**Goal**: Owner añade portada opcional validada, alternativa y encuadre opcional; queda guardada y visible al reabrir editor/cartelera/registro. Un fallo conserva el estado previo.

**Independent Test**: En Event editable anterior o nuevo, aceptar los tres formatos estáticos en límites inclusivos, guardar custom/alt derivado y posición; reabrir editor y ambas vistas de Event publicado. Rechazar inválidos y otros actores, recuperar resultado perdido y publicar/reservar sin imagen. Imagen nueva sin ajuste usa centro.

### Tests for User Story 1

- [X] T010 [P] [US1] Crear pruebas pgTAP de US1 en `supabase/tests/event_covers.test.sql`: upgrade con filas revisión 0, coherencia y límites del modelo, trigger de alta, RLS/grants/bypass, permisos owner/door-only, proyección pública segura, publicación sin portada y commit único con resultado durable; comprobar que las expectativas pendientes fallan antes de implementar funciones de historia.
- [X] T011 [P] [US1] Crear pruebas HTTP/Storage real de US1 en `tests/e2e/event-cover-api.spec.ts`: GET/subidas/confirmar/operaciones, firma privada y upload directo válido de exactamente 5 MiB, límites/codec/animación/daños/EXIF/alt/encuadre, payload/path arbitrario, sesión/propiedad perdida después de firma, respuestas 202/409/413/422/503 y no-store; inyectar fallos de download/decode/publicación/commit y respuesta perdida sin confundir timeout con rollback; probar recursos agotados como temporal y ausencia de máximo de píxeles de negocio. Usar `lib/event-cover-config.json` y reloj controlado para comprobar timeout de decode/Storage, cola dentro del deadline total y slot ocupado hasta fin real de decode; fallo operativo conserva saved state y permite retry.
- [X] T012 [P] [US1] Crear pruebas de flujo US1 en `tests/e2e/event-covers.spec.ts`: añadir y reabrir portada/custom/derivado/encuadre, nueva selección centrada, publicar y reservar sin imagen, cambios generales pendientes preservados, selector cancelado/descarte/cambio de Event, validación/progreso/retry y recuperación de operación; preparar pasos por teclado y verificar ambos consumidores públicos.

### Implementation for User Story 1

- [X] T013 [US1] Implementar preparación/confirmación y transiciones upload en `supabase/migrations/20261008120000_event_covers.sql`: pending → processing → prepared → committed, fingerprint congelado, lease cercado, candidato registrado antes de publicar, reintento temporal a pending, rechazo/conflicto/expiración terminal; CAS revalida owner/revisión y compromete referencia/metadatos/revisión/snapshot/jobs juntos, repetición devuelve resultado original y lease viejo no puede comprometer; sin locks durante download/decode/upload ni escrituras a TicketType/Registration/Ticket.
- [X] T014 [P] [US1] Implementar decoder server-only en `lib/event-cover-validation.ts`: máximo real 5 242 880 bytes, formato real JPEG/PNG/WebP estático, parser PNG estructural con límites/CRC/acTL y RIFF WebP con límites/padding/flags/ANIM/ANMF, rechazo de contenedor animado de una imagen, decode completo sharp `failOn: 'warning'`, dimensiones tras EXIF >=640/360 y SHA-256 de originales; desactivar máximo de píxeles como filtro de negocio y evitar buffer raw innecesario. Consumir `lib/event-cover-config.json` de T008: un decode simultáneo por proceso, timeout inicial 30s y espera incluida en deadline total 120s; no iniciar trabajo vencido ni liberar slot mientras decode siga activo, clasificar timeout/agotar recursos como 503 reintentable en vez de 422.
- [X] T015 [US1] Implementar GET actual y preparación autenticada en `lib/event-cover-service.ts`, `app/api/eventos/[id]/portada/route.ts` y `app/api/eventos/[id]/portada/subidas/route.ts`: revisión decimal, `cover: null` sin imagen, tamaño advisory entero 1..5 242 880, operación/path persistidos antes de firma sin upsert, expiración dos horas, 201 con bucket/path/token; payload pequeño, JSON camelCase, errores `{ error: string }` y `Cache-Control: private, no-store` sin logs de token.
- [X] T016 [US1] Implementar confirmar con runtime Node en `app/api/eventos/[id]/portada/confirmar/route.ts` y `lib/event-cover-service.ts` después de T013–T015: claim, descarga limitada real, T014, publicación de bytes originales/MIME detectado en candidato inmutable y commit CAS; omisión de alt/posición reinicia null/centro sin heredar anterior; repetir mismo ID/payload recupera snapshot, payload diferente 409, lease ocupado 202 con Retry-After, staging faltante 409, fallo temporal 503 y archivo probado inválido 422; no compensar ciegamente una respuesta de commit perdida.
- [X] T017 [US1] Añadir consulta autorizada de resultado en `app/api/eventos/[id]/portada/operaciones/[operationId]/route.ts` y `lib/event-cover-service.ts`: solo actor aún owner, estado/result durable y error propio terminal, ajena/inexistente 404, sin staging token/actor/detalles internos; committed no cambia por fallo de red/cleanup y snapshot histórico se distingue de GET vigente.
- [X] T018 [US1] Implementar limpieza durable y ciclo de vida en `scripts/cleanup-event-covers.mjs` y `supabase/migrations/20261008120000_event_covers.sql`: claim/lease cercado, reconciliar terminales/vencidas y candidatos de intentos viejos, proteger referencia activa y cualquier commit posible, Storage API remove idempotente y backoff; consumir la misma `lib/event-cover-config.json` de T008 que API/decoder. Lease inicial 180s, timeout Storage por petición 30s y margen 300s; persistir antes de publicar due_at >=attemptLeaseUntil+storageRequestTimeoutMs+cleanupTransferMarginMs por candidato, conservándolo aunque cambie lease de operación; staging due_at >=uploadExpiresAt+cleanupTransferMarginMs. No considerar timeout HTTP o due_at alcanzado como prueba de transferencia finalizada: reprogramar si sigue incierta y reconciliar/reabrir jobs de objetos tardíos; triggers de eliminación de Event/actor preservan jobs/tombstones sin debilitar auditoría; retener resultados >=24h y más mientras cleanup/transferencias sigan posibles; logs de cantidades y exit no cero ante fallo no resuelto, sin datos personales/secretos y sin endpoint público.
- [X] T019 [P] [US1] Configurar Next Image en `next.config.ts` con allowlist del host/puerto/protocolo configurados y path `/storage/v1/object/public/event-covers/**`; permitir IP local únicamente en desarrollo/tests, sin hosts arbitrarios/buckets privados y sin introducir caché de metadata que oculte cambios de portada.
- [X] T020 [P] [US1] Crear `components/event-cover.tsx` con título y `EventCover | null`, wrapper 16:9 y marcador neutro persistente, Next Image fill/sizes/object-fit cover/posición porcentual, alt efectivo y superficie para transparencia; callbacks load/error justifican cliente, reiniciar carga solo por identidad de archivo, ocultar imagen rota y conservar geometría en loading/ausente/fallo, sin fetching ni escritura y sin bloquear reserva.
- [X] T021 [US1] Ampliar RPC públicas en `supabase/migrations/20261008120000_event_covers.sql`: `get_public_event_list()` añade cover nullable y `get_public_event_registration(p_code text)` añade event.cover con objectPath/width/height/altText/positionX/positionY; conservar filtros de publicación/cierre, orden, zonas/cupos y claves históricas, no proyectar ledger/staging/actor/jobs y reaplicar grants al recrear retorno tabular.
- [X] T022 [US1] Integrar mínimamente proyecciones/helpers/T020 en `app/event-list.tsx` y `app/eventos/[id]/registro/public-registration.tsx` tras T021: misma portada/encuadre/alt al reabrir ambas vistas, texto en superficies fuera de imagen y reserva independiente; preservar enlaces public_code, fechas por Event y pasos existentes; US2 completará anatomía/cuadrícula/skeleton responsive.
- [X] T023 [US1] Crear editor local de alta en `app/event-cover-editor.tsx`: selección única y ayuda de formatos/límites antes de subir, preview con `image-orientation: from-image` y aviso de draft, alt opcional con derivado visible, ranges 0–100 step 1 convertidos a 0..1, porcentaje y centrar 50/50 con explicación de ejes sin recorte; preparar → uploadToSignedUrl octet-stream → confirmar, response.ok y 202 explícito, saved/draft separados, descarte/revocación objectURL y reintento temporal; progreso/status/alert/foco/controles >=2.75rem y 3px, recuperación por operación tras timeout y conflicto con «Cargar portada actual» preservando draft sin overwrite automático.
- [X] T024 [US1] Integrar `app/event-cover-editor.tsx` en `app/organizer.tsx` para Event existente fuera del formulario general, con guardado «Guardar portada» independiente, ayuda de añadir después de crear y coordinación busy que impida cambiar/eliminar Event durante upload; conservar drafts de título/aforo/calendario, no incluirlos en requests de portada, y restablecer/revocar draft al cambiar Event sin afectar creación/publicación.
- [X] T025 [US1] Ejecutar casos US1 mediante `tests/db/run-event-covers.mjs`, `supabase/tests/event_covers.test.sql`, `tests/e2e/event-cover-api.spec.ts` y `tests/e2e/event-covers.spec.ts`, conectando suites al runner y documentando resultados en `specs/006-imagenes-en-eventos/verification.md`; incluir limpieza de staging/candidatos y portada comprometida tras timeout, sin marcar checklists como aprobadas sin revisión.

**Checkpoint**: US1 aporta el MVP funcional y verificable con exposición pública mínima y cleanup seguro.

---

## Phase 4: User Story 2 — Reconocer eventos y reservar con claridad (Priority: P1)

**Goal**: Cartelera en tarjetas y registro legible a móvil/escritorio con geometría constante y reserva accesible aun sin imagen, con demora o fallo.

**Independent Test**: A 375/1440 px comparar imágenes horizontales/verticales/cuadradas/transparentes/ausentes, claras/oscuras/densas y estados normal/demorado/fallido; medir 16:9, altura y posiciones con desplazamiento atribuible 0 px y completar reserva → email → confirmación → Ticket/QR → check-in sin depender de carga.

### Tests for User Story 2

- [X] T026 [P] [US2] Crear pruebas visuales/geométricas de US2 en `tests/e2e/event-cover-layout.spec.ts`: 375/1440 px, mismas anchuras/textos con fixtures variados, bounding boxes de portada/tarjeta/fecha/título/acción/contenido inferior (16:9 y diferencia 0 px salvo representación subpíxel), overflow, márgenes >=1rem, máximo 70rem, título/sede completos, botón al final, contraste sobre superficies y ausencia de imagen rota; demorar/fallar optimizador y original, exigir un solo intento de recuperación por identidad y mismo encuadre orientado.
- [X] T027 [P] [US2] Ampliar `tests/e2e/registration-to-check-in.spec.ts` con variantes portada ausente/lenta/fallida, preservando pasos/email stub/confirmación/QR/check-in y verificando teclado sin bloqueo por imagen; no ejecutar suites simultáneas en puertos compartidos.

### Implementation for User Story 2

- [X] T028 [P] [US2] Convertir AgendaEvent/filas activas a tarjetas en cuadrículas dentro de cada grupo en `app/event-list.tsx`, conservando filtros/grupos/orden/zonas/disponibilidad y estados empty/error/retry: portada → fecha azul prioritaria → título/sede/horario/descripción → disponibilidad/«Reservar entrada» final con nombre específico, agotado según reglas actuales; retirar fondo azul decorativo del primer Event y actualizar skeleton 16:9 con anuncio único «Cargando próximos eventos…» sin vacío prematuro.
- [X] T029 [P] [US2] Completar portada sobria separada de h1/fecha/sede/descripción en `app/eventos/[id]/registro/public-registration.tsx`: escritorio mantiene información/formulario en columnas y móvil una columna; no introducir portada en campos/opciones/feedback/confirmación ni dependencia de onLoad para selección/submitting, y conservar renderizado de datos y flujo con fallos de imagen.
- [X] T030 [US2] Aplicar estilos de tarjetas/portadas/skeleton/editor en `app/globals.css` según `DESIGN.md` y `door-list-ui`: cuadrícula mínimo adaptable 18.75rem, una columna <=43.75rem, gutter >=1rem y contenedor 70rem, superficies blancas/lienzo frío/bordes/radios/elevación existentes, texto fuera de fotografía, flex/grid con acción final, geometría 16:9 independiente de imagen y controles/foco 2.75rem/3px; envolver texto largo, 200% zoom, breakpoint 700px y reduced-motion sin ornamento.
- [X] T031 [US2] Completar recuperación de original validado en `components/event-cover.tsx` después de T020: ante fallo de optimizador un intento original por identidad, si falla ocultar/unmount y marcador «Portada no disponible», sin loop ni desplazamiento; ausente «Sin portada», símbolo aria-hidden y loading sin anuncios repetidos, alt/título/posición actualizados sin reiniciar descarga y transparencia sobre superficie neutra.
- [X] T032 [US2] Ejecutar pruebas automatizadas T026/T027 y registrar resultados/mediciones en `specs/006-imagenes-en-eventos/verification.md`: geometría/contraste/reserva/teclado de vistas públicas con carga normal/lenta/fallida a 375/1440 y escenarios automatizados de alta ya disponibles en US1; resolver fallos en `app/event-list.tsx`, `app/eventos/[id]/registro/public-registration.tsx`, `components/event-cover.tsx` y `app/globals.css`. No exigir retirada ni edición posterior de metadata de US3 en este checkpoint; la inspección visual completa con `impeccable` pertenece a T045 tras las tres historias.

**Checkpoint**: US2 verifica automáticamente SC-002–SC-006 y la parte de alta/visualización de SC-010, con reserva usable durante todos los estados de imagen. Mantenimiento de SC-010 se verifica en US3 y la inspección visual completa se realiza en T045.

---

## Phase 5: User Story 3 — Mantener o retirar la portada (Priority: P2)

**Goal**: Sustituir, actualizar alternativa/encuadre y quitar sin perder portada previa por fallos ni alterar datos de negocio.

**Independent Test**: Guardar B sobre A y reabrir ambas vistas; editar solo alt/posición, quitar y reabrir marcador; repetir con fallo, dos sesiones misma revisión y respuesta perdida. Un ganador, revisión monotónica, retries idempotentes, cleanup protege activo y snapshots de aforo/calendario/reservas/entradas/permisos no cambian.

### Tests for User Story 3

- [X] T033 [P] [US3] Ampliar pgTAP US3 en `supabase/tests/event_covers.test.sql`: PATCH/DELETE CAS/owner, omitir metadata conserva valor, limpiar alt a derivado, metadata sin portada 409, retirar limpia metadatos/alt y centra, retirada ya ausente con revisión vigente no incrementa, resultado durable/revisión monotónica y jobs de anterior; eliminación autorizada de Event/actor preserva cleanup sin debilitar guardas auditables. Antes de T036, definir y ejecutar casos de carreras en `tests/db/event-cover-concurrency.mjs` con sesiones independientes/barreras observables: B/C misma revisión, replace/remove, posición/replace, doble confirmación y worker/lease obsoleto; un ganador/409, un incremento y cleanup protege ganador. Usar configuración compartida y reloj para antes/en/después de deadlines/lease; comprobar fallos por funciones pendientes, integración definitiva del runner en T039.
- [X] T034 [P] [US3] Ampliar pruebas US3 en `tests/e2e/event-cover-api.spec.ts`: PATCH/DELETE contracts y operationId cliente de 32 bytes aleatorios, payload distinto 409 y repetición sin incremento; reemplazo no hereda alt/encuadre, fallos de sustitución/PATCH/DELETE conservan previo, respuesta perdida se recupera por operación, permisos y limpieza postcommit no revierten éxito. Antes de T036, definir y ejecutar casos Storage/retención en `tests/db/event-cover-cleanup.mjs`: remove fallido/retry/backoff, staging recreado por firma activa, firma+margen, publicación tardía/candidato abandonado, timeout con transferencia aún activa, Event/actor eliminado y resultados >=24h prolongados por cleanup; usar configuración compartida y reloj antes/en/después de due_at, conservar límite de cada intento y probar que activo/comprometible no se borra ni se comunica falso fallo. Verificar expectativas pendientes antes del backend US3; integración definitiva en T040/T041.
- [X] T035 [P] [US3] Ampliar flujo US3 en `tests/e2e/event-covers.spec.ts`: A → B → ausencia al reabrir ambas vistas, editar solo alt/ranges por teclado y limpiar personalización, renombrar Event actualiza derivado y conserva custom, reemplazo sin ajustes centra; conflicto conserva draft hasta carga explícita, sesión perdida/retry/resultado incierto, foco tras quitar y draft general de configuración independiente.

### Implementation for User Story 3

- [X] T036 [US3] Implementar operaciones metadata/remove en `supabase/migrations/20261008120000_event_covers.sql` sobre primitivas de US1: vincular ID al actor/Event/kind/fingerprint, reautorizar/lock/CAS y commit único de revisión/snapshot/jobs, no descargar ni republicar para alt/posición; PATCH requiere al menos un campo, omisión conserva/null o blank limpia alt, sin portada conflicto; DELETE limpia referencia/metadata/alt, centra y encola anterior después de commit, no-op ausente conserva revisión, replay devuelve resultado durable sin reactivar paths.
- [X] T037 [US3] Añadir PATCH/DELETE en `app/api/eventos/[id]/portada/route.ts` y `lib/event-cover-service.ts` conforme a T036 y contrato: JSON pequeño, ID/revisión/posiciones validados, al menos un campo PATCH, 200 EventCoverState/errores HTTP reales/no-store, GET operación para respuestas perdidas y 409 sin reintentar con nueva revisión automáticamente; confirmar sustitución usa flujo de US1 y URL nueva, sin borrar A antes de commit de B.
- [X] T038 [US3] Completar mantenimiento en `app/event-cover-editor.tsx`: cargar alt nullable/encuadre actuales, PATCH sin subida para solo metadata, DELETE «Quitar portada» independiente solo si saved cover, nuevos IDs con Web Crypto de 32 bytes y mismo ID/payload en retry; selección nueva vacía alt y centra, controles conflictivos bloqueados, feedback/foco según contrato, draft recuperable y consulta de operación tras timeout, refresh de estado vigente tras committed sin perder otros campos del Event.
- [X] T039 [P] [US3] Integrar en `tests/db/run-event-covers.mjs` los casos de `tests/db/event-cover-concurrency.mjs` definidos antes del backend en T033; completar conexión al entorno/funciones finales, sesiones independientes, configuración compartida y barreras observables sin sleeps arbitrarios; ejecutar casos y resolver fallos del backend manteniendo expectativas de un ganador/409, incremento único, cercado y portada activa intacta.
- [X] T040 [P] [US3] Completar el helper exportable y ejecutar los casos de `tests/db/event-cover-cleanup.mjs` definidos antes del backend en T034 contra Storage real y `scripts/cleanup-event-covers.mjs`, con configuración compartida/reloj controlado; resolver fallos de retención/reprogramación/transferencias tardías sin relajar expectativas ni recrear casos después de implementar; entregar invocación para integrar secuencialmente en T041, sin editar el runner simultáneamente con T039.
- [X] T041 [US3] Ejecutar suites US3/carreras/cleanup desde `tests/db/run-event-covers.mjs` y documentar invariantes en `specs/006-imagenes-en-eventos/verification.md`: snapshot de Event aforo 10, tipo cupo 10, 2 Registrations y 1 reserva pendiente vigente (consumo 3/disponibilidad 7) antes/después de añadir/reemplazar/quitar/alt/posición, más calendario/publicación/public_code/Tickets revocados/auditoría/permisos; iguales salvo tablas técnicas de portada y reabrir vistas confirma estado vigente.

**Checkpoint**: US3 cumple mantenimiento, fallos/concurrencia recuperables e invariantes de SC-001/007/008/010.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Revisión final, evidencia y operación del worker.

- [X] T042 [P] Documentar en `README.md` dependencia sharp/Node >=22, aplicación por migraciones versionadas, runner Storage aislado y operación de `scripts/cleanup-event-covers.mjs` con variables servidor existentes; especificar scheduler cada 15 minutos y verificación de fallo/reintento como requisito de despliegue según hosting elegido, sin inventar proveedor ni ejecutar cambios remotos/publicación; registrar en `specs/006-imagenes-en-eventos/verification.md` cualquier integración de hosting aún pendiente. Documentar la configuración compartida `lib/event-cover-config.json` y sus relaciones; verificar en hosting duraciones/binarios/concurrencia elegidos antes de despliegue, manteniendo evidencia de ajustes y pruebas de límites.
- [X] T043 Revisar seguridad/privacidad y registrar hallazgos/correcciones en `specs/006-imagenes-en-eventos/verification.md` sobre `supabase/migrations/20261008120000_event_covers.sql`, `lib/event-cover-service.ts`, `next.config.ts` y `scripts/cleanup-event-covers.mjs`: RLS/grants/search_path, owner transaccional, aleatoriedad 256 bits, ausencia de bypass/path arbitrario/tokens/PII en logs/bundles/proyecciones, límite real y trabajo acotado, limpieza tardía y ausencia de escrituras sobre entidades de reservas/entradas.
- [X] T044 Ejecutar lint/build, `tests/db/run-event-covers.mjs` completo y regresiones existentes `tests/e2e/registration-to-check-in.spec.ts`, `tests/e2e/capacity-limits.spec.ts`, `tests/e2e/constitutional-corrections.spec.ts` contra entorno local con Storage, secuencialmente; registrar comandos/resultados y fallos resueltos en `specs/006-imagenes-en-eventos/verification.md`, comprobando decoder/service fuera del bundle cliente, upgrade y todos los escenarios de `specs/006-imagenes-en-eventos/quickstart.md`.
- [X] T045 Realizar tras US1–US3 la inspección visual completa con `impeccable` de `specs/006-imagenes-en-eventos/quickstart.md`: cartelera/registro/editor a 375/1440 con todas las imágenes/estados, añadir/sustituir/editar alt/encuadre/quitar, teclado/ranges/Home/End/foco/anuncios/zoom 200%/texto largo/700px; capturas y mediciones en `specs/006-imagenes-en-eventos/verification.md`, corregir defectos agrupados y como máximo una confirmación visual posterior, reejecutando checks afectados si hay cambios tras T044. Contrastar FR-001–FR-016 y SC-001–SC-010 y revisar realmente `specs/006-imagenes-en-eventos/checklists/ux.md` y `specs/006-imagenes-en-eventos/checklists/requirements.md`: documentar cumplimiento/desviaciones y notas históricas Q1–Q3 frente a spec aclarada; marcar solo ítems respaldados por revisión, resolver conflictos de spec/constitución y conservar pendiente explícito cualquier requisito operativo de despliegue no verificado.

---

## Dependencies & Execution Order

### Phase Dependencies

1. Setup T001–T003 → Foundational T004–T009 → US1 T010–T025.
2. US2 T026–T032 y US3 T033–T041 parten de US1; el orden recomendado entrega primero ambas historias P1, después P2.
3. Polish T042–T045 depende de completar las tres historias. No publicar ni migrar remoto como parte de estas tareas.

### User Story Dependencies

```text
Setup → Foundational → US1 (P1, MVP)
                         ├──→ US2 (P1, presentación/reserva) ──┐
                         └──→ US3 (P2, mantenimiento) ────────┤
                                                            ↓
                                                     Polish/verificación
```

- **US1** no depende de otras historias; contiene portada compartida e integración pública mínima porque su aceptación exige ambas vistas. Cleanup de subida fallida/abandonada pertenece al MVP.
- **US2** depende de proyección/componente/integración de US1; usa imágenes reales guardadas por US1 o fixtures locales con el mismo contrato. No requiere mantenimiento US3.
- **US3** depende de ledger/CAS/upload/editor/componentes de US1; se prueba sobre una portada preexistente y no necesita esperar la cuadrícula final de US2.
- Cada historia se valida con sus fixtures y criterios propios al cerrar su fase. Independientemente verificable no significa duplicar componentes o ignorar dependencias compartidas.

### Within Each User Story

- Escribir casos de la historia y comprobar fallos pertinentes antes de implementar; no atribuir un fallo de entorno a una aceptación validada.
- SQL/modelos → servicios → endpoints → integración → ejecución/evidencia. Decoder y UI/configuración independientes pueden prepararse en las ventanas descritas abajo.
- Todas las ampliaciones de `supabase/migrations/20261008120000_event_covers.sql` se realizan antes de aplicarla fuera del entorno desechable de prueba. Si una migración ya se aplicó en un entorno persistente, agregar una nueva migración con timestamp posterior; nunca reescribir la aplicada.
- No mantener locks mientras se llama Storage/decoder. Fingerprint/lease/revisión/owner tienen validación transaccional; ningún reintento puede pisar al ganador.
- Mismo archivo implica edición secuencial: `lib/event-cover-service.ts`, `app/event-cover-editor.tsx`, la migración y cada suite compartida.

### Parallel Opportunities

- **Setup**: T002 y T003 tras T001; runner y fixtures son independientes. El runner se conecta a suites conforme se creen en T025/T039/T041.
- **Foundational**: T004 puede avanzar junto a T005; T005 → T006 → T007 son secuenciales en la misma migración. T008 usa T004/T006; T009 usa T004 y no comparte archivo con T008.
- **US1**: T010/T011/T012 son tres archivos de tests distintos tras foundation/fixtures. Luego T013 (SQL), T014 (decoder), T019 (config) y T020 (componente, tras T004/T009 y T019 para verificación) pueden prepararse sin competir por archivos. Servicio/rutas T015 → T016 → T017, SQL T013 → T018 → T021 y UI T020 → T022 → T023 → T024 son cadenas; T023 puede empezar tras contratos/backend y en paralelo con T022, pero T024 integra después de T023. T025 cierra todas las cadenas.
- **US2**: T026/T027 en paralelo, después T028/T029 en archivos separados; coordinar T030 con ambos y ejecutar T032 cuando T030/T031 terminen.
- **US3**: T033/T034/T035 definen y comprueban casos antes de T036 en archivos distintos; T033 posee pgTAP/concurrencia y T034 API/cleanup. Tras T036–T038, T039/T040 integran y ejecutan esos casos ya escritos; T039 posee la integración en `tests/db/run-event-covers.mjs`, T040 entrega helper exportable y T041 incorpora su invocación para evitar edición concurrente del runner.
- **Entre US2/US3**: tras US1 se pueden separar presentación pública y mantenimiento owner; serializar `app/globals.css`, cualquier helper compartido y ejecuciones Playwright de 3100/3101. Los tests US2 usan suite layout/regresión; los US3 amplían suites API/editor.
- **Polish**: documentación T042 puede prepararse durante revisión T043; serializar evidencia compartida en `verification.md`. T044 precede inspección visual completa/revisión documental T045; si esta exige cambios, repetir solo los checks afectados y como máximo una confirmación visual tras correcciones agrupadas.

## Parallel Example: User Story 1

```text
Tras foundation y fixtures:
T010: pgTAP en supabase/tests/event_covers.test.sql
T011: contratos/upload real en tests/e2e/event-cover-api.spec.ts
T012: flujo owner en tests/e2e/event-covers.spec.ts

Tras escribir tests:
T013: transacciones upload en supabase/migrations/20261008120000_event_covers.sql
T014: decoder en lib/event-cover-validation.ts
T019: allowlist en next.config.ts
```

## Parallel Example: User Story 2

```text
Tras MVP US1 y tests T026/T027:
T028: tarjetas/grupos/skeleton en app/event-list.tsx
T029: bloque informativo en app/eventos/[id]/registro/public-registration.tsx
Después integrar CSS T030, recuperación T031 y validar T032.
```

## Parallel Example: User Story 3

```text
Tras US1:
T033: contrato SQL en supabase/tests/event_covers.test.sql y casos en tests/db/event-cover-concurrency.mjs
T034: contrato HTTP en tests/e2e/event-cover-api.spec.ts y casos en tests/db/event-cover-cleanup.mjs
T035: mantenimiento owner en tests/e2e/event-covers.spec.ts

Tras backend/editor T036–T038:
T039: integrar y ejecutar carreras ya definidas en tests/db/event-cover-concurrency.mjs
T040: integrar y ejecutar fallos/retención ya definidos en tests/db/event-cover-cleanup.mjs
Ejecutar e integrar serialmente en T041.
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar setup/foundation y preparar casos US1 que fallen por comportamiento pendiente.
2. Completar US1 con validación/owner/CAS/recuperación/cleanup, editor independiente y portada en ambas superficies.
3. Validar T025: formatos/límites, mismo estado al reabrir, publicación sin imagen, permisos y recuperación sin pérdida de portada.
4. Demostrar MVP local. US1 sola no declara cumplimiento de toda la feature: la matriz responsive completa pertenece a US2 y mantenimiento a US3.

### Incremental Delivery

1. US1 entrega alta segura opcional y visualización mínima.
2. US2 entrega cartelera en cuadrícula, registro sobrio y evidencia geométrica/accesible con carga lenta/fallida.
3. US3 entrega sustitución/alt/encuadre/retirada, carreras y retención demostradas.
4. Polish reúne evidencia, regresiones, inspección visual completa con impeccable tras mantenimiento y revisión de checklist. Scheduler cada 15 minutos y valores de configuración compartida requieren verificación en hosting antes del despliegue de la feature; no darlo por configurado solo porque el worker local pasa.

### Parallel Team Strategy

Si se decide usar varios implementadores, completar bases/US1 y luego asignar UI pública US2 y mantenimiento US3 a responsables distintos; compartir contratos estables, evitar edición simultánea de archivos/evidencia y ejecutar navegador secuencialmente. Estos ejemplos describen oportunidades, no solicitan iniciar agentes durante generación de tareas.

## Notes

- 45 tareas: setup 3, foundational 6, US1 16, US2 7, US3 9, polish 4; 19 marcadas `[P]` dentro de sus ventanas.
- Las constraints entre comillas de las tareas de persistencia reproducen las del modelo; usar también sus transiciones, coherencia, índices y retención. No agregar un máximo de alt/píxeles ni requisitos de encuadre/publicación.
- Preservar fuente única de tipos/helpers, errores propios españoles, HTTP real, contratos nuevos camelCase y estructura del repositorio.
- Mantener evidencia de fallos, comandos, capturas y escenarios en `verification.md`; esta generación no ejecuta implementación, pruebas, aprobación de checklists ni despliegue.
