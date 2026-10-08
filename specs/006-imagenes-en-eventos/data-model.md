# Data Model: Feature 006 — Imágenes en eventos

**Spec**: [spec.md](spec.md) | **Decisions**: [research.md](research.md)

## Entidades y relaciones

`Event` conserva su identidad y campos actuales. `TicketType`, `Registration`, `Ticket` y reservas pendientes no reciben campos ni transiciones nuevas. Portada es un atributo opcional del Event, con persistencia técnica separada para impedir escrituras que eludan la validación.

```text
Event 1 ── 1 EventCover (puede no tener imagen)
Event 1 ── N EventCoverOperation
EventCoverOperation 1 ── N EventCoverCleanupJob
EventCover ── 0..1 objeto vigente en bucket event-covers
EventCoverOperation ── 0..1 staging + candidatos de publicación
```

## EventCover → `event_covers`

| Campo SQL | Tipo | Regla |
|---|---|---|
| `event_id` | uuid PK/FK | Event existente; una fila por Event |
| `revision` | bigint | >=0, inicia en 0, aumenta con cada cambio comprometido |
| `object_path` | text nullable, unique | Solo path generado/validado por servicio; null significa sin portada |
| `media_type` | text nullable | `image/jpeg`, `image/png` o `image/webp` |
| `byte_size` | integer nullable | 1..5 242 880 inclusive |
| `width` / `height` | integer nullable | Dimensiones orientadas; >=640 / >=360 |
| `content_hash` | text nullable | SHA-256 de bytes originales validados |
| `alt_text` | text nullable | Trim; vacío/espacios → null; contenido plano |
| `position_x` / `position_y` | double precision | Finito, 0..1 inclusive; centro 0.5 |
| `updated_at` | timestamptz | UTC, hora del commit |

Constraint de coherencia: referencia null implica todos los metadatos de archivo y alternativa null, posición centrada. Referencia no null implica todos los metadatos verificados no null. Prohibir NaN/infinito además de validar rangos. No aceptar actualización parcial que deje un estado incoherente.

Backfill: crear filas con revisión 0 y sin portada para Events existentes. Insertar fila para cada nuevo Event con trigger dedicado; lectura defensiva de ausencia devuelve revisión 0. Quitar no elimina la fila: limpia datos y aumenta revisión para evitar el problema de volver a una revisión inicial. Borrar un Event permitido elimina la fila, pero encola previamente su objeto; no cambia las guardas existentes contra borrado de eventos con entradas auditables.

La revisión bigint se representa como cadena decimal en JSON para no perder precisión en JavaScript. No participa en la revisión/configuración de aforo. Metadata de portada nunca se escribe por `update_event_configuration`.

## EventCoverOperation → `event_cover_operations`

| Campo SQL | Tipo / finalidad |
|---|---|
| `operation_id` | text PK; 64 caracteres hex, generado con 32 bytes aleatorios |
| `event_id` | uuid nullable FK, `ON DELETE SET NULL` |
| `actor_id` | uuid nullable FK a usuario, `ON DELETE SET NULL` |
| `kind` | upload / metadata / remove |
| `expected_revision` | bigint no negativo |
| `request_fingerprint` | hash nullable; fijado al aceptar payload definitivo |
| `staging_path` | text nullable unique; persistido antes de emitir firma |
| `upload_expires_at` | timestamptz nullable; vencimiento de firma de dos horas |
| `state` | pending / processing / prepared / committed / rejected / conflict / expired |
| `lease_token` / `lease_until` | token de cercado y límite UTC; solo poseedor vigente avanza |
| `candidate_path` | text nullable; clave aleatoria de intento vigente, registrada antes de publicar |
| `validated_metadata` | jsonb nullable; MIME, tamaño, dimensiones orientadas, hash verificados |
| `requested_metadata` | jsonb nullable; alternativa/posiciones congeladas por fingerprint |
| `result_revision` / `result_snapshot` | resultado comprometido inmutable, sin firma de upload |
| `created_at` / `updated_at` | timestamptz UTC |

Índices: `(event_id, created_at)`, `(state, lease_until)`, `(state, upload_expires_at)` y unique paths. Solo el actor autorizado puede consultar el resultado HTTP; no dar SELECT general sobre el ledger. Payload de fingerprint usa valores normalizados, Event, kind y revisión. Repetir ID con otro payload produce 409; misma petición devuelve su resultado durable. PATCH/DELETE reciben `operationId` aleatorio del cliente; servidor comprueba formato/entropía de su generador de UI y vincula ID al primer actor/Event/kind. La seguridad de autorización no depende de conocer el ID.

Al recuperar lease vencido, generar nueva clave de candidato y registrar cleanup para el intento anterior. Un worker viejo no puede comprometer con lease obsoleto; sus paths siguen identificados para limpieza. No reutilizar keys entre intentos.

### Transiciones

| Transición | Condición / efecto |
|---|---|
| creación → pending | Usuario/owner y revisión autorizados; paths registrados; aún no afecta portada |
| pending → processing | Claim atómico de lease; congelar payload definitivo |
| processing → prepared | Bytes estáticos/sanos aceptados, objeto nuevo publicado y metadata verificada |
| prepared → committed | Revalidar owner/lease/revisión bajo lock; cambiar solo portada y registrar resultado/jobs |
| processing → pending | Fallo temporal antes de commit; reintento del mismo payload, sin cambios al Event |
| pending/processing/prepared → rejected | Archivo demostrado inválido; conservar portada previa; encolar candidatos |
| pending/processing/prepared → conflict | Revisión desactualizada o payload incompatible; conservar estado ganador |
| no terminal → expired | Firma vencida, operación abandonada o actor/Event eliminado; cercar leases antes de limpiar |

Metadata/remove no descargan ni publican archivos: pasan a committed dentro de la transacción autorizada. No alterar una operación committed a rejected por fallo de red o cleanup. Operaciones terminales no reactivan objetos antiguos. Conservar resultados al menos 24 horas desde terminación; conservar tombstones/paths mientras haya cleanup pendiente o firmas/transferencias posibles.

## EventCoverCleanupJob → `event_cover_cleanup_jobs`

| Campo SQL | Tipo / regla |
|---|---|
| `id` | bigint identity PK, interno |
| `operation_id` | text nullable FK, `ON DELETE SET NULL` |
| `bucket_id` / `object_path` | text, unique conjunto; buckets permitidos solamente |
| `due_at` / `next_attempt_at` | timestamptz UTC |
| `state` | pending / processing / done |
| `attempts` | integer >=0 |
| `lease_token` / `lease_until` | claim de worker y cercado |
| `last_error_code` | código técnico sin PII, tokens ni mensajes crudos |
| `created_at` / `updated_at` | timestamptz UTC |

Índice por `(state, next_attempt_at)`; filas sobreviven eliminación de Event/usuario. Antes de efectos externos registrar candidato como cleanup diferido; commit convierte jobs del objeto activo en protegidos por referencia y encola anterior/staging. Worker solo elimina paths no vigentes y no comprometibles por una operación viva. Un job done puede reabrirse para el barrido final contra uploads tardíos. Solo considerar staging terminado después de firma vencida + cinco minutos; para candidatos abandonados esperar fin de lease, timeout máximo de publicación y margen de transferencia. API Storage remove idempotente; fallos reintentan con backoff.

## Storage

| Bucket | Lectura | Escritura | Restricciones |
|---|---|---|---|
| `event-cover-uploads` | Servicio; no lectura/listado público | Token firmado de ruta única; emisión solo owner | Privado, 5 242 880 bytes, `application/octet-stream`, upsert false |
| `event-covers` | URL pública opaca | Servicio tras validación; sin políticas de escritura/listado navegador | Público, 5 242 880 bytes, MIME JPEG/PNG/WebP, keys inmutables |

Paths tipo `uploads/<64hex>` y `covers/<64hex>`, sin nombres personales ni identificadores enumerables. Cada generación es independiente. MIME final y tamaño son comprobados por el servidor, no por el navegador. Ningún payload HTTP acepta URL/path para promover. No se requieren transformaciones de pago de Supabase.

## Acceso y transacciones

- Habilitar RLS en las tres tablas. `event_covers`: owner SELECT; sin INSERT/UPDATE/DELETE para anon/authenticated. Operaciones/cleanup solo servicio. RPC públicas SECURITY DEFINER proyectan únicamente metadata segura; no conceder lecturas anónimas de tablas técnicas.
- Funciones internas de mutación/lease/limpieza con `search_path` fijo, ejecución restringida a service role, parámetros de actor verificado. API autentica con JWT antes de usar servicio; transacción vuelve a comprobar propiedad. Service role no se entrega al browser.
- Orden de locks: Event existente → EventCover → Operation → jobs afectados. Precomprobar autorización antes de locks; volver a comprobar bajo lock. No mantener locks mientras se descargan/decodifican/publican imágenes. Ningún lock/escritura sobre TicketType, Registration o Ticket.
- CAS incluye metadata/posición/referencia/revisión y ledger/jobs. Revisión desactualizada devuelve 409; no sobrescribe al ganador. DELETE con revisión vigente y sin portada es no-op idempotente; conserva revisión. Repetición de operación devuelve mismo resultado.
- Eliminación autorizada de Event/usuario marca operaciones abandonadas y encola paths sin perder evidencia de limpieza; triggers nuevos no debilitan las restricciones históricas de auditoría.

## Proyecciones compartidas

Tipos nuevos en `lib/event-cover-types.ts`, importados por API/UI/helpers; extensión de tipos Event existentes en `lib/types.ts`. Filas snake_case permanecen en persistencia. Nuevos contratos camelCase:

- `EventCover`: `url`, `width`, `height`, `altText` efectivo no vacío, `positionX`, `positionY`.
- `OrganizerEventCover`: mismo archivo/posición, `altText` nullable personalizado. Estado acompaña `eventId` y `revision`.
- `EventCoverState`: `{ eventId, revision, cover: OrganizerEventCover | null }`.

Para la proyección pública, trim personalizado o `Portada de ${currentEventTitle}` al leer/renderizar. No persistir la alternativa derivada: renombrar Event la actualiza naturalmente. Sustituir reinicia alternativa y encuadre salvo valores explícitos de esa nueva imagen; quitar elimina ambos.

Ampliar `get_public_event_list()` y `get_public_event_registration(p_code text)` con campo `cover` nullable, cuyas claves nuevas son camelCase y cuyo path público se convierte a URL mediante helper compartido. Mantener intactas las claves históricas/cálculos/filtros; son proyecciones existentes de persistencia, no motivo para migrar el resto de los contratos en esta feature. Reaplicar grants tras recrear la RPC tabular cuyo retorno cambia.
