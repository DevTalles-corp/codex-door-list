# Quickstart validation: Feature 006 — Imágenes en eventos

**Scope**: guía para validar la futura implementación, no evidencia de ejecución actual. Los archivos/tests nuevos nombrados aquí se crearán en la fase de implementación. Referencias: [spec.md](spec.md), [data-model.md](data-model.md), [HTTP](contracts/event-covers.md), [UI](contracts/cover-ui.md).

## Prerrequisitos

- Node.js >=22, npm y dependencias de producción/optional binarias de sharp compatibles con la plataforma.
- Docker activo, Supabase CLI y Chromium de Playwright.
- Proyecto local de prueba; no usar Supabase remoto para fixtures.
- `.env.local` con configuración existente de Supabase y secretos servidor según `.env.example`/README. Service role solo servidor; correos E2E capturados por el stub existente.

Comandos desde raíz del repositorio:

```bash
npm ci
npx playwright install chromium
npm run lint
npm run build
```

Resultado: dependency sharp explícita resoluble, compilación de rutas Node/cliente, sin importar servicio/decoder en bundles cliente.

## Verificación automatizada aislada recomendada

```bash
node tests/db/run-event-covers.mjs
```

Runner previsto: proyecto temporal independiente, puertos distintos a runners existentes, Storage API habilitado. Crea datos sintéticos antes de nueva migración para verificar upgrade; aplica migraciones versionadas, pgTAP, carreras/API Storage/limpieza y navegador. Obtiene claves locales sin imprimirlas; rechaza URL remota. Al finalizar detiene solo su propio proyecto. No resetear datos del proyecto de desarrollo.

Resultado: Events anteriores conservan campos/publicación y muestran estado sin portada revisión 0; buckets/políticas creados por migración; tablas con RLS; upload real estándar acepta exactamente 5 MiB; no quedan objetos activos borrados por limpieza; pruebas de reserva/check-in existentes pasan.

## Ejecutar suites contra Supabase local existente

```bash
supabase start
supabase migration up --local
supabase test db
npm run test:e2e -- event-covers.spec.ts
```

`migration up` aplica únicamente migraciones pendientes. `test:e2e` obtiene configuración de `supabase status -o env` o variables `E2E_SUPABASE_*`; exige localhost. `playwright.config.ts` inicia app en 3100 y stub de correo en 3101, por lo que no ejecutar suites simultáneas con esos puertos. Storage debe estar activo; runner de capacidad actual lo excluye y no basta para esta feature.

Regresión del flujo existente, una vez completada la suite nueva:

```bash
npm run test:e2e -- registration-to-check-in.spec.ts capacity-limits.spec.ts constitutional-corrections.spec.ts
```

## Matriz de escenarios

| Escenario | Procedimiento | Resultado / trazabilidad |
|---|---|---|
| Añadir/publicar | Crear Event válido y tipo con cupo; subir JPEG/PNG/WebP estático; guardar y reabrir editor, `/` y registro | Misma imagen vigente, portada opcional; US1, SC-001/008/009 |
| Formatos/límites | Fixtures sanos de 640×360; exactamente 5 242 880 bytes; +1 byte; 639×360; 640×359; vacío/corrupto; GIF/SVG; APNG y WebP animados incluso de una imagen | Válidos aceptados; demás rechazados con copy específico; prior state intacto; FR-006, SC-009 |
| Contenido real | Renombrar JPEG como PNG y falsificar MIME; introducir archivo inválido con extensión JPEG; probar PNG con cadena acTL dentro de datos no estructurales | Codec real decide; extensión/MIME no burlan validación; parser evita falso positivo |
| Alternativa | Custom, vacío, espacios, cambiar alt, cambiar título con derivado, sustituir imagen personalizada | Alt no vacío público; custom conservado al renombrar; derivado usa título vigente; nueva imagen no hereda custom; SC-007 |
| Encuadre | Horizontal/vertical/cuadrada y EXIF 1–8; guardar sin ajustar; ajustar ejes solo teclado; editar solo posición | Centro por defecto; misma región en preview/vistas 16:9; posiciones persisten; reemplazo centra; SC-010 |
| Sustituir/quitar | Guardar B sobre A; reabrir ambas vistas; quitar y reabrir | B o fallback consistentemente; publicación/cupos/reservas intactos; US3, SC-001/008 |
| Fallos precommit | Interrumpir upload, validación/download/publicación; impedir commit; fallar PATCH/DELETE | Guardado previo alt/posición/imagen intacto, draft recuperable y retry; SC-001 |
| Respuesta perdida | Cortar respuesta tras commit; repetir misma operación y consultar resultado | Un único incremento; éxito durable recuperado; nunca borrar la portada comprometida |
| Carreras | Dos owners sessions misma revisión: B/C; replace vs remove; posición vs replace; finalizar dos veces; lease vencido | Un ganador, otro 409; retry no duplica commit; cleanup conserva ganador |
| Permisos | Anon, otro owner, staff solo puerta y owner; perder sesión/propiedad después de firmar | Solo owner compromete; firma de staging no otorga edición ni publicación; FR-001 |
| RLS/bypass | Intentar UPDATE directo a tablas de portada, upload/list/delete público, asignar path arbitrario | Prohibido; solo objetos validados se referencian |
| Limpieza | Fallar remove API; reintentar; recrear staging con firma aún activa; expirar firma/lease; borrar Event permitido | Jobs sobreviven, capturan uploads tardíos, no borran activo; no falso fallo postcommit |
| Sin imagen | Publicar/reservar Event existente/nuevo sin portada | Mismas condiciones y pasos de reserva, fallback neutral; SC-004/008 |

Fixtures de exacto tamaño deben ser formatos sanos con padding/metadata válidos; no lograr 5 MiB concatenando bytes que el decoder estricto rechace. Probar también transparencia, proporciones extremas admitidas y casos superiores al límite de píxeles predeterminado del decoder mediante pruebas apropiadas al entorno; no introducir rechazo de negocio por recursos.

## Matriz visual y accesibilidad

Ejecutar `impeccable` durante revisión de implementación conforme a [UI](contracts/cover-ui.md). A 375 y 1440 px, capturar cartelera y registro con fotografías sintéticas claras, oscuras, alto contraste y patrones/texto; horizontal, vertical, cuadrada, transparente y ausente. Demorar petición de imagen y forzar fallo de optimizador/original. Mantener mismos textos/ancho al comparar.

Medir antes/después con bounding boxes de portada, tarjeta, título, fecha, botón y contenido inferior: razón 16:9; diferencia de altura y posiciones atribuible a imagen 0 px (tolerancia solo de representación subpíxel, no de layout). `scrollWidth <= clientWidth`; gutters >=1rem; contenedor <=70rem; botón al final, texto completo sin overlap. Si solo falla optimizador, recuperación original no genera loop ni desplazamiento; si original falla, fallback sin icono roto.

Recorrer editor/registro solo teclado: selector/alt/ranges/centrar/guardar/quitar; comprobar valores anunciados, foco visible 3px, controles >=2.75rem, progreso/éxito/error textual y destino del foco. Probar zoom 200%, título/alt/mensajes largos, breakpoint 700px y reduced-motion. Una inspección batched desktop/mobile, corrección agrupada y máximo una confirmación.

## Comprobación de invariantes

Antes y después de añadir/reemplazar/quitar/editar alt/posición tomar snapshots de `events` (aforo, calendario, status, public_code), TicketTypes, reservas pendientes, Registrations, Tickets y permisos de puerta. Deben ser iguales salvo tablas técnicas de portada. Fixture numérico: Event aforo 10, tipo cupo 10, 2 Registrations y 1 reserva pendiente vigente; consumo 3 y disponibilidad 7 antes/después. Entradas revocadas/auditoría conservadas según reglas existentes; no escribir esas tablas para gestionar portada.

Completar reserva → email stub → confirmación → Ticket/QR → check-in con imagen ausente, lenta y fallida. La portada no añade pasos, no bloquea formulario y no altera expiración/calendario del Event.

## Worker y entrega

En entorno local con variables servidor cargadas:

```bash
node scripts/cleanup-event-covers.mjs
```

Verificar jobs obsoletos eliminados vía Storage API y vigente intacto. Tests avanzan reloj para firma/transferencia; no esperar dos horas reales. Antes de desplegar, scheduler Node cada 15 minutos y secretos servidor configurados; ejecutar caso de fallo/reintento y comprobar logs sin tokens/nombres/emails. No incluye publicación ni cambios al proyecto remoto en esta fase.

Guardar evidencia de comandos, matriz/capturas y escenarios en `specs/006-imagenes-en-eventos/verification.md` durante implementación. Aprobar checklists solo mediante su revisión real; esta guía no marca ítems ni afirma pruebas ejecutadas.
