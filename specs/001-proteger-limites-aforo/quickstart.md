# Quickstart: Validar protección de aforo

**Spec**: [spec.md](spec.md) | **Modelo**: [data-model.md](data-model.md) | **Contratos**: [API](contracts/event-configuration.md), [PostgreSQL](contracts/database-capacity.md)

Guía ejecutable de la implementación. Los runners crean proyectos locales aislados y no aplican migraciones remotas. Los comandos se contrastaron con documentación y ayuda de Supabase CLI 2.116.0.

**Gate previo**: T001 resuelto por specs 002–005. Ver sus `verification.md`: upgrade, 61 casos SQL, concurrencia y 4 pruebas Playwright. La operación conjunta tiene su propia evidencia abajo; no hereda resultados de los prerrequisitos.

## Prerrequisitos y comandos

- Dependencias instaladas conforme `package-lock.json` (`npm ci` si hace falta).
- Docker activo, Supabase CLI y Chromium de Playwright instalado (`npx playwright install chromium`). Las sesiones psql se ejecutan dentro del contenedor PostgreSQL 17; no requieren psql en el host.
- Puertos `555xx`, `3100` y `3101` libres. Ejecutar los runners de aforo en secuencia.
- El runner obtiene claves locales de manera privada y simula Resend. No requiere claves remotas ni envía emails reales. `.env.local` sirve para uso manual, conforme `.env.example`.

Desde la raíz:

```bash
npm run lint
npm run build
node tests/db/run-capacity-verification.mjs
node tests/db/run-capacity-concurrency.mjs
```

`run-capacity-verification.mjs` instala el historial anterior con fixtures versionadas, aplica las dos migraciones de 001, comprueba upgrade US1/US2/US3, ejecuta ambas suites pgTAP y después `npm run test:e2e -- capacity-limits.spec.ts registration-to-check-in.spec.ts` con variables privadas de ese proyecto. Cada runner detiene únicamente su instalación en `finally`; los logs privados de fallos quedan en su directorio temporal, sin imprimir claves.

Selección de historia o contrato:

```bash
node tests/db/run-capacity-upgrade.mjs --story US1
node tests/db/run-capacity-upgrade.mjs --story US2
node tests/db/run-capacity-upgrade.mjs --story US3
node tests/db/run-capacity-verification.mjs --grep 'US1|US2'
node tests/db/run-capacity-verification.mjs --grep 'US3 API'
```

`run-capacity-upgrade.mjs` sin `--story` ejecuta las tres. `--grep` filtra Playwright; upgrade y las 111 comprobaciones SQL siguen ejecutándose completos. El runner de concurrencia usa sesiones independientes y espera observable en `pg_stat_activity`, con timeout de fallo y lectura final desde una tercera conexión. Los errores técnicos simulados en pruebas UI/mapper no representan bloqueos reales; estos se prueban por separado en PostgreSQL.

Todo DDL se introduce mediante migraciones versionadas, también las fixtures históricas. No rebobinar desarrollo ni ejecutar fixtures contra un proyecto remoto.

## Escenarios numéricos

| Spec | Fixture y acción | Resultado esperado |
|---|---|---|
| US1.1 / US2.1, US2.3 | Aforo 4, General cupo 1/consumo 1, VIP cupo 2/consumo 2; solicitar VIP 1 o aforo 2 | Rechazo; límites intactos; mensaje VIP/2 o aforo/3 según solicitud. Repetir tras otro cambio de cupo. |
| US1.2 | Aforo 4, VIP cupo 3/consumo 2; pedir cupo 2 | Éxito, cupo 2. |
| US1.3 | VIP cupo 5/consumo 0; pedir 1 | Éxito si configuración restante válida. |
| US1.4 | Aforo 4, VIP cupo 3, tres registros/Tickets valid, used, revoked | Pedir VIP 2 o aforo 2 rechaza con cifra 3. Pedir cada límite en 3 acepta. Estados/filas conservados; puerta sigue excluyendo revoked. |
| US2.2 | Aforo 4, General cupo/consumo 1, VIP cupo/consumo 2 | Aforo 3 acepta. |
| US2.4 | Aforo 6, General cupo 3/consumo 1, VIP cupo 3/consumo 2; pedir solo aforo 3 | Rechazo por suma asignada 6, sin afirmar que hay seis ventas. |
| Edge / FR-004,006 | Aforo 5, VIP cupo 3/consumo 2, otro tipo cupo 2/consumo 2; petición conjunta aforo 3 y VIP 1 | HTTP 409, rollback total; resumen muestra consumo total 4 y VIP 2. Suma final asignada 3 no agrega infracción ficticia. |
| FR-006 | Petición con aforo inferior tanto a consumo como a suma final | Ambas causas reconocidas; cifra de consumo y suma diferenciadas. |
| FR-011 | Legacy cuyo aforo/cupo no cubren consumo; editar solo título/nombre con límite omitido | Metadatos editables; límites intactos. Tocar límite y devolverlo al número guardado sí se valida. |
| US1.6 / FR-003 | Crear VIP con cupo 2 y aforo 4; registrar tres asistentes; repetir sobre tipo existente | Configurar el número declara límite estricto: dos registros aceptan, tercero rechaza. Cupo 1 con dos registros rechaza, cupo 2 acepta; sin modo nuevo ni alteración legacy al activar. |
| US3.4 / FR-012 | Aforo 4, VIP 3/1; READ COMMITTED, segunda VIP y luego cupo 2 | Éxito de ambas operaciones, cupo 2 y dos Registrations/Tickets. |
| US3.5 / FR-012 | Aforo 4, VIP 3/1; cada operación por separado en REPEATABLE READ y SERIALIZABLE | Registro, RPC (incluso solo metadatos) y DML de límite rechazan `0A000`; conservan aforo 4, cupo 3 y una Registration/Ticket. No falta de cupo ni reintento dentro de la misma transacción. |

En pgTAP verificar también límites positivos/invalid_input, igualdad, asignación al mismo valor, múltiples updates en transacción diferida con resultado final válido, fila eliminada antes de flush y agregado bigint. No convertir este último en requisito de columnas nuevas.

## Activación sobre datos anteriores

El runner de upgrade prepara instalación local aislada con historial anterior, guarda snapshot de límites, Registrations y Tickets, carga fixtures legacy antes de activar y aplica las migraciones nuevas de 001 (`150000` y `151000`). La fixture de aforo inferior a suma no se puede crear por las vías normales antiguas: usar una migración fixture versionada solo en el proyecto de pruebas para representar una importación previa, nunca deshabilitar guardas nuevas para fabricar el resultado.

- **US1.5**: aforo 4, VIP cupo 1 y consumo 2. Activación conserva todo; establecer VIP 1 falla, establecer 2 acepta.
- **US2.5**: aforo 2, VIP cupo 3 y consumo 3. Activación conserva todo; establecer aforo 2 falla, establecer 3 acepta.
- **Corrección conjunta**: legacy aforo 3, VIP cupo 10, consumo 2; solicitar aforo 5 y cupo 5 acepta en una transacción aunque las configuraciones intermedias no cumplan asignación.
- Comprobar metadatos aislados, mismo valor explícito y snapshots antes/después. La activación no aumenta capacidades, no elimina registros y no cambia Tickets.

## Concurrencia determinista

Para cada caso, la primera sesión conserva su transacción abierta tras adquirir locks; la segunda inicia y se observa su espera o rechazo técnico. Confirmar la primera y dejar resolver/reintentar la segunda según contrato. Comprobar cantidades y límites desde una tercera lectura final, sin confiar en lo mostrado antes por UI.

| Orden / spec | Estado inicial | Resultado final |
|---|---|---|
| Venta primero, US3.2 | Aforo 4; General cupo/consumo 1/1; VIP 3/1; vender segunda VIP y pedir juntos aforo 2/VIP 1 | Venta confirma; petición conjunta rechaza completa; aforo 4, VIP 3, consumo total 3. |
| Reducción primero, US3.2 | Mismo fixture | Petición conjunta confirma aforo 2/VIP 1; venta posterior falla por tipo sin cupo; consumo total 2. |
| Venta primero, US3.3 | VIP cupo 3/consumo 1; vender segunda y pedir cupo 1 | Cupo permanece 3 y consumo VIP 2; reducción rechazada. |
| Reducción primero, US3.3 | Mismo fixture | Cupo 1 y consumo VIP 1; venta posterior rechazada. |
| DML directo y venta | VIP con datos consistentes; actualizar cupo fuera de RPC mientras venta sostiene Event | NOWAIT produce `55P03`; rollback completo; reintento obtiene cifras actuales y aplica/rechaza según ellas. Sin deadlock por espera circular. |

Agregar venta/venta para regresión de cupo, ediciones simultáneas de tipos del mismo Event para suma asignada y operaciones en eventos distintos. Cubrir US3.4–US3.5 según la matriz: `REPEATABLE READ`/`SERIALIZABLE` rechazan con `0A000` antes de persistir escrituras propias de registro/RPC/límites; comprobar snapshots de límites, metadatos, Registrations y Tickets. La RPC rechaza también patches de solo metadatos; DML exclusivo de metadatos que no active guardas conserva comportamiento vigente. El caller inicia una nueva transacción READ COMMITTED para un intento compatible; no repetir dentro de la rechazada. Usar READ COMMITTED para los demás escenarios de aceptación.

## Vía externa, permisos y API

- Como owner autenticado, DML directo VIP 2→1 con consumo 2 rechaza (`23514`) y conserva 2; establecer 2 acepta. No invocar el panel ni endpoint para probar US3.1.
- Como owner, invocar RPC/API conjunta: todos los límites inválidos aparecen en un resumen y no cambia ningún campo. Direct SQL puede diferir asignación por nombres, pero commit inválido siempre falla.
- Sin sesión: endpoint 401 y RPC no ejecutable. Otro owner: 403 cuando el recurso es visible, o 404 cuando RLS lo oculta; sin cifras ni escrituras. Tipo ajeno a evento autorizado: 404.
- API reconoce 400 de input, 409 de configuración y 503 de contención. Todo error propio tiene solo `{ error: string }` y nunca texto crudo de Supabase. SQL/Data API conservan su sobre nativo, distinto del endpoint.
- DETAIL desconocido, malformed o `23514` ajeno a capacidad muestra fallback genérico; no inventar causa/cifra. Después de una nueva venta, reintentar desde formulario obsoleto debe informar conteo nuevo.

## Validación del editor y regresión

```bash
npm run dev
```

En `/organizador`, revisar cada rechazo numérico, copia española, input preservado, envío bloqueado durante submit, anuncio accesible de error y reintento. Verificar teclado y pantalla estrecha para mensajes largos. Editar solo nombre/título legacy y después establecer explícitamente el mismo límite para contrastar ambas intenciones.

La prueba E2E anterior de publicar→registrar→email→QR→check-in debe seguir pasando. No cambiar filtro operativo de revocadas, listado público, unicidad por evento/email, reglas de fecha ni envío de email. El nuevo endpoint conjunto no exige añadir una pantalla nueva.

**Cierre**: SC-001/002 por matriz completa y upgrade; SC-003/005 por mensajes con causas/cifras en una lectura; SC-004 por ambos órdenes forzados; FR-012 por contrato de aislamiento y snapshots. Registrar resultados reales durante implementación y reevaluar la resolución constitucional de T001 antes de dar el cambio por completo; la evidencia ejecutada se registra a continuación.

## Evidencia de correcciones previas (2026-10-05)

`node tests/db/run-constitutional.mjs` ejecuta solo las correcciones 002–005: proyecto temporal local, upgrade, pgTAP, carreras y correo simulado. `npm run lint` y `npm run build` pasan. Ver [reservas](../003-reservas-verificadas/verification.md) para resultados y alcance. Ese resultado solo demuestra los prerrequisitos; la evidencia independiente de 001 sigue abajo.

### US1 — ejecución 2026-10-05

`node tests/db/run-capacity-upgrade.mjs --story US1`: PASS, snapshot completo conservado; límite 1 explícito rechazado, metadatos y 2 aceptados. `node tests/db/run-capacity-verification.mjs --grep US1`: PASS, 111 comprobaciones SQL (50 de aforo y 61 de correcciones previas) y 2 pruebas de navegador. Bloqueo durante envío, inputs preservados, revocadas, unicidad de cupo y contratos touched/omitidos verificados.

### US2 — ejecución 2026-10-05

`node tests/db/run-capacity-verification.mjs --grep 'US1|US2'`: PASS, 111 comprobaciones SQL y 3 pruebas de navegador. Aforo 4→2 rechazado con mínimo 3; 4→3 aceptado. Aforo 6→3 rechazado por suma asignada 6 con consumo 3. Upgrade US2 preserva aforo 2/VIP 3/consumo 3 y admite título sin límite o aforo 3. US1 permanece operativo tras el cambio del editor compartido.

### US3 y cierre — ejecución 2026-10-05

| Comando realmente ejecutado | Resultado |
|---|---|
| `node tests/db/run-capacity-verification.mjs --grep 'US3 API'` | PASS: upgrade US1/US2/US3, 111 SQL y 3 pruebas de contrato/reintento. |
| `node tests/db/run-capacity-verification.mjs` | PASS: snapshots de upgrade completos, 50 pruebas de aforo + 61 de correcciones previas y 7 pruebas Playwright. |
| `node tests/db/run-capacity-concurrency.mjs` | PASS: ambos órdenes de US3.2/US3.3, DML inverso, venta/venta, tipos simultáneos, eventos independientes, aislamientos y rollback al commit. |
| `npm run lint` | PASS. |
| `npm run build` | PASS: Next.js 16.3.3, tipos y rutas compiladas. |
| `git diff --check` | PASS. |

Los escenarios de upgrade US2/US3 se ejecutaron por la función compartida del runner de verificación; las opciones individuales `--story US2/US3` están disponibles, pero no se contabilizan como invocaciones separadas realizadas. La primera suite SQL detectó una diferencia de permisos (404 frente a 403 en recurso ajeno visible); la migración adicional `20261005151000_authorize_configuration_before_lock.sql` la corrigió y la suite posterior pasó. No se reescribió `150000` después de aplicarla.

#### Estados finales observados desde conexión independiente

| Carrera | Aforo / cupo VIP / consumo total / consumo VIP / Tickets |
|---|---|
| US3.2, venta primero | 4 / 3 / 3 / 2 / 3; edición y sus metadatos rechazados íntegramente. |
| US3.2, edición primero | 2 / 1 / 2 / 1 / 2; venta rechazada. |
| US3.3, venta primero | 4 / 3 / 2 / 2 / 2; reducción rechazada. |
| US3.3, edición primero | 4 / 1 / 1 / 1 / 1; venta rechazada. |
| DML tipo con orden inverso de locks | `55P03` aborta; venta confirma. Nueva transacción ve consumo 2: cupo 1 rechaza y 2 acepta. |
| Venta/venta, una plaza | Exactamente una Registration y un Ticket. |
| Ediciones de tipos simultáneas | Suma final 4 con aforo 4; solicitud de suma 5 rechazada. |
| Eventos distintos | Segunda edición confirma mientras el lock del primer Event permanece abierto. |
| REPEATABLE READ y SERIALIZABLE | Cada reserva/confirmación/RPC/límite/asociación rechaza `0A000` y conserva snapshot completo; nueva READ COMMITTED confirma segunda VIP y acepta cupo 2. |
| Asignación diferida inválida al COMMIT | `23514`; rollback completo de límites, metadatos y filas. |

La UI conserva input 1 tras un 503 simulado, luego muestra mínimo 2 del backend real; una Registration nueva hace que el siguiente reintento muestre mínimo 3. HTTP real cubre 400/401/403/404/409/200. Los estados técnicos 503/500 y DETAIL desconocido se verifican en el mapper y el contrato UI; no se atribuyen a bloqueos HTTP reales.

#### Editor y accesibilidad

- Playwright ejecutó el recorrido con `reducedMotion: reduce`, Tab desde capacidad al botón y Enter para guardar; verificó foco en el resumen de error, controles bloqueados durante envío y éxito `role="status"`.
- Inspección visual de capturas a 1280 px y 390 px: mensajes VIP/mínimo 3/revocadas y mensaje múltiple aforo mínimo 3 + suma asignada 6 visibles y completos, sin desbordamiento. Los inputs rechazados conservan 2.
- El editor usa `role="alert"`, foco programático del resumen y estilos de foco existentes; scroll `auto` con movimiento reducido. No se añadieron valores visuales arbitrarios. La página `/organizador` sigue siendo Server Component.
- Capturas reproducibles bajo `test-results/`: `capacity-error-desktop.png`, `capacity-error-mobile.png` y `multiple-capacity-errors-mobile.png`. Se regeneran al ejecutar la suite.
- No se ejecutó lector de pantalla ni cámara física. Cámara y correo se simulan en la regresión; el resultado no prueba entrega de Resend real.

#### Trazabilidad final y constitución

| Requisito | Evidencia |
|---|---|
| FR-001–003 | Matrices pgTAP y US1/US2: límites mínimos, igualdad, cero consumo y límite estricto. |
| FR-004 | SQL/API conjunta: todas las infracciones y rollback de límites/metadatos; upgrade 5/5. |
| FR-005 | Guardas de DML owner independientes del panel y RPC, con RLS/grants probados. |
| FR-006 | Decoder estricto y mensajes propios con cada cifra; API de tres causas y captura móvil de dos causas. |
| FR-007 | Ambos órdenes deterministas, venta/venta y edición simultánea; lectura final independiente. |
| FR-008 | 61 regresiones SQL y publicar→reservar→confirmar por email→Ticket/QR→check-in/repetición. Las funciones de venta, unicidad y permisos previos se conservan. |
| FR-009 | Asignación final bigint, igualdad y rechazo 6→3; restricciones diferibles evalúan estado final y commit inválido falla. |
| FR-010 | Registros sin join a Tickets; valid/used/revoked cuentan 3; pendiente + confirmada cuentan 2 sin duplicación. |
| FR-011 | Snapshot completo antes/después de activación en las tres fixtures legacy; metadatos omitidos aceptados y mismo límite explícito rechazado. |
| FR-012 | Dos aislamientos rechazados por operación, snapshots intactos y nueva READ COMMITTED aceptada. |
| SC-001/002 | Todos los escenarios numéricos SQL, upgrade y UI pasan; igualdad 3 permitida y 2 rechazada; asignación 6 diferenciada. |
| SC-003/005 | Copy español identifica límite, causa y mínimo en un resumen; cifras nuevas en reintentos y revisión visual móvil. |
| SC-004 | Todas las carreras con estados iniciales consistentes terminan dentro de aforo y cupo. |

Reevaluación constitucional I–V: spec previa a implementación, dos migraciones nuevas versionadas; las once migraciones originales no tienen diff y las cinco de 002–005 permanecen intactas. La constitución 1.0.0 no se modificó. No hay backfill, tablas/columnas/contadores nuevos, cambios de RLS ni acceso público a reservas/tokens. La RPC invoker usa JWT del owner; el helper definer autoriza propiedad antes de contar pendientes. Calendario UTC/zona propia, reservas/caducidad, publicación con tipo y acceso/auditoría conservan sus correcciones verificadas. No queda conflicto MUST identificado en la revisión final.

Las 37 tareas están implementadas y verificadas. `checklists/requirements.md` conserva sus 16 checks originales (solo lectura). `.specify/extensions.yml` no existe: no hay hooks posteriores registrados. Verificación exclusivamente local; no se desplegó ni aplicó migración remota.
