# Contract: Event covers

**Spec**: [../spec.md](../spec.md) | **Model**: [../data-model.md](../data-model.md)

## Convenciones

Base: `/api/eventos/{eventId}/portada`, donde `eventId` es el UUID interno existente usado en API autenticada. Enlaces públicos de registro conservan el `public_code` aleatorio actual. Autenticación `Authorization: Bearer <JWT>`; verificar getUser y propietario del Event. Staff de puerta no autoriza. Respuestas privadas `Cache-Control: private, no-store`; requests/responses nuevos camelCase. Errores siempre `{ "error": "mensaje comprensible en español" }`, con HTTP real. Nunca entregar credenciales de servicio ni mensajes crudos de proveedor.

`revision` es cadena decimal no negativa. `operationId` es 64 hex de 32 bytes aleatorios. Posiciones finitas 0..1. Tipos en `lib/event-cover-types.ts`. No aceptar actor, URL, bucket o path elegido por cliente. Comprobar `response.ok` antes de interpretar respuesta como éxito.

## GET base — estado actual

**200**:

```json
{
  "eventId": "existing-internal-event-uuid",
  "revision": "3",
  "cover": {
    "url": "https://project.supabase.co/storage/v1/object/public/event-covers/covers/<64hex>",
    "width": 1600,
    "height": 900,
    "altText": null,
    "positionX": 0.5,
    "positionY": 0.5
  }
}
```

Sin portada: `cover: null`. Aquí `altText` es personalizado, nullable; el editor explica la alternativa derivada. GET sirve para recargar tras conflicto; no descarga ni espera la imagen.

## POST `/subidas` — preparar subida

Request: `{ "expectedRevision": "3", "byteSize": 5242880 }`.

Byte size es advisory pero se verifica primero (entero 1..5 242 880). Autorizar Event y revisión; crear operación upload y staging path antes de firmar. Firma sin upsert. **201**:

```json
{
  "operationId": "<64hex>",
  "expectedRevision": "3",
  "upload": {
    "bucket": "event-cover-uploads",
    "path": "uploads/<64hex>",
    "token": "<opaque-signed-upload-token>",
    "expiresAt": "2026-10-08T18:00:00Z"
  }
}
```

El cliente usa Supabase `uploadToSignedUrl` con bucket/path/token devueltos y `Content-Type: application/octet-stream`; los bytes van directamente a Storage. No enviar archivo al Route Handler. El servidor conserva fecha de expiración/paths, no imprime token. Nueva preparación crea nueva operación; no cambia portada. El cliente puede omitir nombre original completamente.

## POST `/confirmar` — validar y guardar archivo nuevo

Request:

```json
{
  "operationId": "<64hex>",
  "expectedRevision": "3",
  "altText": "Personas en un concierto al aire libre",
  "positionX": 0.5,
  "positionY": 0.5
}
```

`altText` y posiciones son opcionales: null/vacío/espacios → alternativa derivada; posición omitida → centro. No heredar datos de imagen anterior. Revisión debe coincidir con preparación y estado actual. Congelar fingerprint del payload al iniciar; misma operación con otro contenido devuelve 409.

Secuencia: claim de lease → descargar ruta registrada con máximo real de bytes → codec/container estático/dimensiones orientadas/decode completo → publicar bytes originales en path nuevo con MIME detectado → commit autorizado/CAS. Commit actualiza solo portada, incrementa revisión y registra respuesta/cleanup de staging/anterior. **200**: `EventCoverState` vigente. Una repetición de operación committed devuelve el resultado durable original; consultar GET base para saber si hubo cambios posteriores.

Una operación ya en procesamiento devuelve **202** `{ "operationId": "<64hex>", "status": "processing" }` con `Retry-After`; no es guardado exitoso. Falta de archivo en staging tras upload fallido: 409 con mensaje para repetir subida. Archivo demostrado inválido: 422. Fallo temporal de download/decode/storage: 503, sin cambios al estado guardado y reintento de la misma operación/payload cuando sea recuperable.

## PATCH base — alternativa/encuadre de imagen existente

Request:

```json
{
  "operationId": "<new-client-generated-64hex>",
  "expectedRevision": "4",
  "altText": "Escenario con músicos",
  "positionX": 0.25,
  "positionY": 0.7
}
```

Al menos uno de `altText`, `positionX`, `positionY`; omitir conserva valor, null/blank en alt limpia personalización. No sustituye archivo ni exige subida. Si no hay portada, 409. Operación vinculada a actor/Event/kind y fingerprint, CAS y commit único; **200** `EventCoverState`. Reintentar mismo ID/payload no incrementa revisión otra vez.

## DELETE base — retirar

Body JSON `{ "operationId": "<new-client-generated-64hex>", "expectedRevision": "5" }`.

CAS/owner: limpiar referencia/metadata/alt, centrar posiciones, incrementar revisión y encolar objeto anterior. **200** `{ "eventId": "...", "revision": "6", "cover": null }`. Ya ausente con revisión vigente: no-op 200 sin incremento. Operación repetida devuelve resultado durable. No borrar objeto antes de commit. Fallo de cleanup posterior no modifica respuesta de éxito.

## GET `/operaciones/{operationId}` — recuperar resultado incierto

Solo actor que siga autorizado para ese Event. Operación ajena/inexistente: 404; pérdida de permiso se trata como 403 o 404 según visibilidad del Event. **200**: `{ operationId, status, result }`; status uno de pending/processing/prepared/committed/rejected/conflict/expired, result `EventCoverState | null`. Estado terminal fallido puede incluir `error` con copy propio español, sin mensajes del proveedor. Nunca devolver staging token, actor o detalles internos.

Tras timeout de una mutación, mostrar «Estamos comprobando si se guardó la portada…»; consultar operación o repetir misma petición. No anunciar fallo definitivo ni borrar candidato hasta conocer resultado. Si committed, comunicar éxito y recargar estado vigente; si rejected/conflict/expired, comunicar resultado y permitir reintento apropiado. Si servicio sigue inaccesible, comunicar incertidumbre y ofrecer «Comprobar de nuevo».

## Errores comunes

| HTTP | Condición / mensaje orientativo |
|---|---|
| 400 | JSON, ID, revisión o campos inválidos: «Revisa los datos de la portada.» |
| 401 | JWT ausente/inválido: «Inicia sesión para editar la portada.» |
| 403 | Event visible pero no owner: «No tienes permiso para editar este evento.» |
| 404 | Event/operación no encontrados o no visibles |
| 409 | Revisión/payload conflictivos: «La portada cambió en otra sesión. Carga su estado actual antes de guardar.» |
| 413 | Tamaño declarado/real excede 5 242 880 bytes |
| 422 | Formato no admitido, animación, archivo dañado o dimensión insuficiente; explicación específica en español |
| 500 | Error interno no clasificado, copy propio y sin afirmar éxito |
| 503 | Servicio/storage/recursos temporalmente indisponibles; reintento |

Si el upload directo falla, el cliente traduce el error Storage a copy propio y no ejecuta commit. Un 409 no elimina el estado ganador ni reintenta automáticamente con revisión nueva.

## Proyección pública y caché

Ampliar las RPC existentes en una migración nueva, manteniendo publicación, cierre, orden, zona y cálculo de cupos:

- `get_public_event_list()`: campo adicional `cover` nullable.
- `get_public_event_registration(p_code text)`: `event.cover` nullable.

`cover` SQL contiene `objectPath`, `width`, `height`, `altText` nullable personalizado, `positionX`, `positionY`. El helper en `lib/` construye URL solo para host/bucket configurados y obtiene alt efectivo con título vigente; contrato UI `EventCover` tiene `url` y `altText` no vacío. Mantener las claves históricas de proyección sin refactor masivo; todas las claves añadidas camelCase. No proyectar ledger/staging/actor/cleanup.

Cada reemplazo usa URL nueva. Metadata/retirada se leen de la RPC al reabrir las vistas; no introducir caché de metadata que oculte el cambio. Caché del objeto no necesita invalidación explícita. Final bucket permite descarga por URL opaca, incluso si alguien conserva una URL antigua hasta su limpieza; esta feature no ofrece revocación inmediata de bytes ya cacheados.

## Contrato de worker y ciclo de vida

`scripts/cleanup-event-covers.mjs`: entrypoint Node, mismo entorno servidor (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), scheduler cada 15 minutos. No exponer endpoint público de cleanup. Salida resume cantidades, no claves/tokens/datos personales; error no resuelto produce exit !=0 y deja jobs reintentables.

Claim con lease y cercado; reconciliar terminales/leases vencidos; comprobar no referencia activa ni posibilidad de commit; borrar únicamente por Storage API. Upsert false y keys nunca reactivables. Para staging conservar/reabrir job hasta vencimiento de firma + cinco minutos; candidatos esperan fin de procesamiento y margen. Jobs sobreviven eliminación de Event/actor. Backoff de fallos, sin rollback de portada vigente. Retención mínima de resultados 24h, prolongada mientras existan cleanup pendiente o firmas/transferencias activas.

Pruebas invocan worker con entorno local y reloj controlado; ejecución de scheduler en hosting es integración requerida antes de despliegue de la feature.
