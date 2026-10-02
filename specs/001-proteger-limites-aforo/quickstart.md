# Quickstart: Validar protección de aforo

**Spec**: [spec.md](spec.md) | **Modelo**: [data-model.md](data-model.md) | **Contratos**: [API](contracts/event-configuration.md), [PostgreSQL](contracts/database-capacity.md)

Esta guía se ejecutará después de implementar el plan. Las pruebas/runners nuevos que se nombran abajo aún no existen; no representan validaciones realizadas durante planificación. Los comandos de Supabase se contrastaron con documentación actual y ayuda de CLI instalado 2.116.0.

**Gate previo**: el Constitution Check de [plan.md](plan.md) permanece FAIL por conflictos heredados; implementación BLOCKED hasta la resolución explícita y revisada exigida por T001. Esta guía prepara comprobaciones futuras y no autoriza empezar código o aplicar migraciones mientras ese gate siga abierto.

## Prerrequisitos y preparación

- Dependencias del proyecto instaladas con el lockfile (`npm ci` si hace falta).
- Docker, Supabase CLI y `psql` disponibles. Base de pruebas PostgreSQL 17 local y desechable.
- `.env.local` configurado conforme `.env.example` para uso manual. Pruebas E2E usan variables locales obtenidas por su runner y Resend simulado, como ya documenta `README.md`.
- La nueva migración y los artefactos de pruebas previstos deben estar implementados. No usar proyecto remoto para fixtures ni modificar migraciones históricas.

Desde raíz del repositorio:

```bash
supabase start
supabase migration up --local
npx playwright install chromium
```

`migration up --local` aplica solo migraciones pendientes al local. El runner de upgrade usa otra instalación local aislada anterior a la protección; no rebobina la base de desarrollo ni borra su historial. Todo DDL, incluido cualquier fixture de esquema necesario en ese proyecto aislado, se introduce por una migración de pruebas versionada nueva, nunca SQL suelto ni edición del historial de producción.

## Comprobaciones automáticas previstas

```bash
npm run lint
npm run build
supabase test db --local supabase/tests/capacity_limits.test.sql
node tests/db/run-capacity-concurrency.mjs
node tests/db/run-capacity-upgrade.mjs
npm run test:e2e -- capacity-limits.spec.ts registration-to-check-in.spec.ts
```

Los runners DB deben aceptar únicamente conexión PostgreSQL local, obtener configuración sin imprimir secretos y limpiar sus fixtures. El de concurrencia necesita dos sesiones independientes con barreras explícitas y timeout de fallo, sin sleeps arbitrarios. El runner E2E existente valida URL local y simula Resend; no envía mensajes reales. Cada prueba debe informar escenario, orden efectivo y estado final.

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

El runner de upgrade prepara instalación local aislada con historial anterior, guarda snapshot de límites, Registrations y Tickets, carga fixtures legacy antes de activar y aplica únicamente la migración nueva. La fixture de aforo inferior a suma no se puede crear por las vías normales antiguas: usar una migración fixture versionada solo en el proyecto de pruebas para representar una importación previa, nunca deshabilitar guardas nuevas para fabricar el resultado.

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

**Cierre**: SC-001/002 por matriz completa y upgrade; SC-003/005 por mensajes con causas/cifras en una lectura; SC-004 por ambos órdenes forzados; FR-012 por contrato de aislamiento y snapshots. Registrar resultados reales durante implementación y reevaluar la resolución constitucional de T001 antes de dar el cambio por completo; este plan solo prepara su validación.
