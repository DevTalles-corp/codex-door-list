# Research: Feature 006 — Imágenes en eventos

**Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

## Contexto y preguntas resueltas

Investigación de transporte 5 MiB, validación/animación/daños, EXIF, encuadre, permisos, consistencia PostgreSQL/Storage, concurrencia, caché y validación visual. No quedan decisiones técnicas pendientes. Las decisiones concretan la spec sin añadir reglas de aforo, calendario, reservas o acceso.

Evidencia local: lockfile fija Next 16.3.3, React 19.2.8, Supabase JS 2.112.4, TypeScript 5.9.3, Playwright 1.63.0 y sharp 0.35.3. Supabase JS exige Node >=22. `getRequestSupabase` verifica JWT/getUser; `lib/supabase/admin.ts` encapsula credenciales de servicio. Owners tienen UPDATE completo sobre `events`, por lo que campos de portada directamente editables allí permitirían saltarse la validación.

## 1. Transporte y buckets

**Decision**: Subida estándar firmada a `event-cover-uploads`, privado; confirmar con JSON pequeño; publicar bytes validados en `event-covers`, público. Ambos buckets con máximo 5 242 880 bytes. Staging acepta `application/octet-stream`, usado por el cliente; bucket final admite solo los tres MIME reales. El MIME del navegador/nombre no decide validez.

**Rationale**: Supabase recomienda upload estándar para este tamaño. Vercel limita cuerpos de Functions a 4.5 MB; pasar el archivo por Next no cumpliría 5 MiB allí. No hay hosting real identificado en repo: es una decisión de portabilidad. Las firmas duran dos horas y no requieren autenticación adicional al usarse; no persistir sus tokens en cliente ni logs. Bucket público permite lectura por URL; no añadir listado público ni escrituras directas.

**Alternatives considered**: Multipart vía Next por límite de host; TUS por complejidad innecesaria; publicar antes de validar; upload directo al bucket público que permitiría bypass.

**Sources**: [Upload estándar](https://supabase.com/docs/guides/storage/uploads/standard-uploads), [signed upload](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl), [buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Vercel limits](https://vercel.com/docs/functions/limitations).

## 2. Validación completa y orientación

**Decision**: sharp 0.35.3 explícito, runtime Node; tamaño real, codec real, estructura estática y decode completo con `failOn: 'warning'`. `metadata()` solo lee cabeceras. Usar `stats()` u operación de decode completo que no materialice un buffer raw innecesario. Parser PNG con límites/CRC y rechazo de `acTL`; parser RIFF WebP con límites/padding, flags y rechazo `ANIM`/`ANMF`, además de metadata de páginas. Rechazar contenedores animados incluso de una imagen.

**Rationale**: Extensión, MIME, metadata del cliente o lectura de primera imagen no prueban integridad. Buscar texto arbitrario dentro de bytes genera falsos positivos. Dimensiones mínimas se comprueban después de EXIF con `metadata.autoOrient`; probar orientaciones 1–8.

**Decision**: Promover exactamente los bytes originales validados, con MIME detectado y hash SHA-256. Preview usa `image-orientation: from-image`; Next Image autoorienta antes de resize. Código instalado `node_modules/next/dist/server/image-optimizer.js` llama `.rotate()` antes del resize en Next 16.3.3. Persistir dimensiones orientadas y aplicar posición después de orientar.

**Rationale**: Evita recompresión/pérdida y crecimiento de un derivado. La spec no autoriza máximo de píxeles: desactivar `limitInputPixels` como filtro de negocio, con procesamiento acotado y fallos temporales reintentables por infraestructura. No convertir un límite operativo en rechazo 422 de una imagen válida.

**Alternatives considered**: Validación exclusivamente cliente; metadata sin decode; sharp como único detector de APNG; reencode al subir; máximo arbitrario de megapíxeles.

**Sources**: [Constructor](https://sharp.pixelplumbing.com/api-constructor/), [metadata/stats](https://sharp.pixelplumbing.com/api-input/), [rotate](https://sharp.pixelplumbing.com/api-operation/#rotate), [instalación](https://sharp.pixelplumbing.com/install/), [PNG/APNG](https://www.w3.org/TR/png-3/), [WebP RIFF](https://developers.google.com/speed/webp/docs/riff_container), [browser EXIF](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/image-orientation).

## 3. Identidad y permisos

**Decision**: `event_covers` separado de `events`; una fila persistente, revisión monotónica y referencia nullable. Escritura solo por servicio verificado; owner puede leer. Operaciones y limpieza con RLS y sin escrituras del navegador. Reutilizar JWT/getUser y comprobar `created_by` en entrada y commit.

**Rationale**: Staff de puerta no es editor. No aceptar paths arbitrarios del cliente. RPC públicas exponen solo portada vigente de eventos permitidos, sin actor, firmas, staging ni PII. Objetos/operaciones usan 32 bytes aleatorios; UUIDv4 aporta 122 bits aleatorios, insuficientes para identificadores públicos de la constitución.

**Alternatives considered**: Columnas editables en Event; confiar en `storage.objects.owner_id` para objetos de servicio; grants por ser staff; filenames con ID/nombre de usuario/evento.

**Sources**: `AGENTS.md`, constitución y migraciones de acceso; [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

## 4. Commit y concurrencia

**Decision**: Clave inmutable por upload; operaciones persistidas con lease cercado, fingerprint y resultado durable. Comparar `expectedRevision` dentro de transacción; revisión obsoleta devuelve 409. Metadata/encuadre y retirada usan CAS/idempotencia. Quitar conserva fila vacía e incrementa revisión.

**Rationale**: Referencia, metadata, revisión, resultado y trabajos de limpieza se comprometen juntos en PostgreSQL. Storage queda fuera. Falla antes del commit conserva estado previo; falla de limpieza posterior no deshace éxito. Timeout de red no prueba rollback: consultar/reintentar misma operación para recuperar el resultado.

**Alternatives considered**: Borrar anterior primero; sobrescribir mismo key; compensar ciegamente tras timeout; último escritor gana sin avisar.

## 5. Limpieza durable

**Decision**: Jobs con leases/intentos; worker Node invocable por scheduler cada 15 minutos y manualmente. Borrar con Storage API, nunca SQL sobre `storage.objects`. Verificar ausencia de referencia activa y de operación que pueda comprometer el path. Rutas retiradas no se reactivan. Jobs sobreviven eliminación de Event/usuario. Repetir staging hasta vencimiento de firma (dos horas) más cinco minutos de margen; tokens aún válidos pueden recrear archivos borrados.

**Rationale**: Persistir paths antes de efectos externos hace recuperables los crashes. Reconciliar operaciones terminales/leases vencidos, sin borrar candidatos con procesamiento vivo. El proveedor de scheduler se integra durante despliegue; el contrato es un worker Node portable. Fallos del worker prolongan retención de obsoletos, sin alterar portada vigente.

**Alternatives considered**: Limpieza solo en memoria/request; cascadas que pierden los jobs; cron SQL eliminando objetos; ignorar firmas activas y uploads tardíos.

**Sources**: [Objetos y caché](https://supabase.com/docs/guides/storage/uploads/standard-uploads), [Storage delete](https://supabase.com/docs/guides/storage/management/delete-objects).

## 6. Encuadre y presentación

**Decision**: `positionX`/`positionY` finitos entre 0 y 1, centro 0.5; `object-fit: cover` y posición porcentual. Dos rangos nativos con porcentaje textual y «Centrar encuadre». Guardado independiente «Guardar portada», fuera del formulario de configuración; añadir imagen después de crear Event.

**Rationale**: Posición significa alineación de recorte, no coordenada literal del sujeto. Preview y dos vistas 16:9 conservan región visible a cualquier ancho. Sin zoom, drag obligatorio ni paso obligatorio. Nueva imagen centrada y alternativa personalizada vacía.

**Decision**: `EventCover` compartido, wrapper 16:9 con fallback neutro debajo de Next Image `fill`, `sizes`, callbacks load/error. Ocultar imagen fallida; reiniciar estado al cambiar identidad. Allowlist exacta Storage en `remotePatterns`; IP local permitida solo desarrollo/test.

**Rationale**: Geometría independiente de red/dimensiones. Texto sobre blanco fuera de foto mantiene contraste. UI activa de `app/event-list.tsx` es agenda de filas: cambiarla a cuadrícula conservando grupos/orden/disponibilidad; editar solo CSS antiguo de tarjetas no sirve. Registro mantiene dos columnas y sobriedad.

**Alternatives considered**: Texto superpuesto; alto natural; contain con bandas; fallback sin espacio; editor solo drag; heredar encuadre/alternativa de anterior.

**Sources**: `PRODUCT.md`, `DESIGN.md`, `door-list-ui`, contexto `impeccable`; [Next Image](https://nextjs.org/docs/app/api-reference/components/image), [object-position](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/object-position).

## 7. Verificación

**Decision**: Storage local real, pgTAP, sesiones independientes y navegador. Fallos/respuestas perdidas en límites concretos y limpieza con reloj controlado. Fixtures sintéticos usados únicamente en pruebas. Una ronda visual desktop/mobile con impeccable y como máximo una confirmación tras corregir defectos agrupados.

**Rationale**: Runner de capacidad excluye Storage/imgproxy; nuevo runner conserva aislamiento/guardas locales con Storage habilitado. No basta un mock de API o screenshot aislado.

**Alternatives considered**: Solo helper tests; solo screenshots; usar remoto; aprobar checklists sin revisión.

**Sources**: `tests/e2e/run.mjs`, `playwright.config.ts`, `tests/db/local-capacity-environment.mjs`; [CLI migration up](https://github.com/supabase/cli/blob/develop/apps/cli/docs/go-cli-reference.md), [pgTAP local](https://github.com/supabase/cli/blob/develop/apps/cli/docs/supabase/test/db.md).
