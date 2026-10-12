# Door List

Landing inicial para una plataforma de tickets de eventos.

## Desarrollo

Copia `.env.example` a `.env.local` y completa los valores. Las variables
`NEXT_PUBLIC_` se envían al navegador; `RESEND_API_KEY` y
`SUPABASE_SERVICE_ROLE_KEY` deben permanecer en el servidor. La clave de servicio
se usa en los flujos privados de reserva, confirmación y portadas. La edición de
portadas verifica el JWT y la propiedad antes de usarla y revalida el owner bajo
lock transaccional; el resto de operaciones conserva su JWT y RLS.

Para enviar confirmaciones a participantes, verifica un dominio propio en Resend
y configura `RESEND_FROM_EMAIL` con una dirección de ese dominio. El remitente de
prueba `onboarding@resend.dev` solo permite enviar al email de la cuenta de Resend.
Si Resend rechaza el correo, la API cancela la reserva para liberar el cupo y
devuelve `503`; el servidor registra el código del rechazo sin emails, tokens ni
claves.

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Datos de ejemplo para desarrollo

`supabase/seed.sql` carga siete eventos publicados de música, tecnología, cocina,
senderismo, cine y arte local. Crea catorce tipos de entrada, quince registros
confirmados y sus quince tickets. El tipo **Primera fila** de **Jazz en la ciudad**
tiene sus tres plazas ocupadas; la entrada General sigue disponible. Además,
**Sesión acústica íntima** tiene sus cinco plazas ocupadas: tres de General y dos
de Primera fila. Aparece como un evento sin cupos disponibles.

Las fechas se calculan al crear los datos, usando `America/La_Paz`: tres eventos
en lo que queda de esta semana, dos en lo que queda de este mes y dos en meses
posteriores. Al final de mes esos grupos pueden coincidir. El registro permanece
abierto hasta el inicio de cada evento. Los identificadores fijos y `ON CONFLICT`
permiten volver a ejecutar la semilla sin duplicar datos. Una reaplicación conserva
las fechas, las ediciones y los códigos de tickets existentes; un reset los recrea
con fechas actualizadas. Los eventos pertenecen a un organizador ficticio sin
credenciales de acceso. Los emails usan el dominio reservado `.example` y la
carga no envía correos.

### Local

Requiere Docker activo y Supabase CLI (comandos verificados con 2.116.0). Desde
la raíz del repositorio:

```bash
supabase start
supabase db reset --local
supabase seed buckets --local
supabase status -o env
```

**El reset borra los datos locales**, aplica todas las migraciones y ejecuta
`supabase/seed.sql`, ya habilitado en `[db.seed]` de `supabase/config.toml`.
El comando de buckets carga las siete portadas PNG de 1200 × 675 px incluidas en
`supabase/seed-assets/event-covers/` mediante la API de Storage. Es seguro repetirlo;
también sirve si el CLI ya cargó los archivos al iniciar o resetear. Los nombres
sin extensión conservan el formato `covers/<sha256>` que exige la aplicación;
el CLI detecta el tipo PNG por su contenido. No basta con insertar filas en
`storage.objects`: Storage necesita los archivos reales.

Configura `.env.local` con `API_URL` como `NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY`
como `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SERVICE_ROLE_KEY` como
`SUPABASE_SERVICE_ROLE_KEY`, tomados de `supabase status -o env`. Reinicia
`npm run dev` si cambias estas variables. La cartelera de `/` mostrará los ejemplos.

### Remoto vinculado

**Usar únicamente en un proyecto remoto de desarrollo desechable.**
`supabase db reset --linked` elimina las entidades y los datos de aplicación del
proyecto vinculado antes de reconstruirlo. Comprueba el proyecto elegido y guarda
una copia de cualquier dato que quieras conservar. El ejecutable se escribe
`supabase` (no `supbase`).

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF_DE_DESARROLLO
supabase db reset --linked
supabase seed buckets --linked
```

El reset remoto aplica las migraciones y la misma semilla SQL. La carga de buckets
publica después las portadas en el Storage del proyecto vinculado. Para verlas,
la aplicación debe usar la URL y las claves de **ese mismo proyecto** en
`.env.local`. El esquema y los buckets siguen definidos en las migraciones;
la semilla solo escribe datos y el CLI carga los archivos.

Para reaplicar únicamente los datos, sin resetear, ejecuta el contenido de
`supabase/seed.sql` desde el SQL Editor de Studio local o del proyecto remoto de
desarrollo, y repite `supabase seed buckets --local` o `--linked` según corresponda.
No uses esta semilla para despliegues de producción.

La verificación aislada prueba el reset, la idempotencia, el evento y el tipo
agotados y la descarga de todas las portadas, sin modificar el proyecto de desarrollo:

```bash
node tests/db/run-seed.mjs
```

Referencia: [semillas de Supabase](https://supabase.com/docs/guides/local-development/seeding-your-database)
y [comandos del CLI](https://supabase.com/docs/reference/cli/supabase-db-reset).

## Compilación

```bash
npm run build
```

## Prueba end-to-end

La prueba de Playwright usa Supabase local, crea un organizador temporal y lo
elimina al terminar. Un servidor Resend local captura el correo para comprobar
su enlace y el QR adjunto sin enviar mensajes reales. Chromium recibe un flujo
de cámara simulado con el QR de la entrada para probar el lector de `/scan`.

```bash
supabase start
supabase migration up --local
npx playwright install chromium
npm run test:e2e
```

Para ejecutar la cobertura completa, incluida la inyección de fallos de Storage:

```bash
npm run test:e2e:full
```

Este comando ejecuta primero la suite general y después el runner aislado de
portadas, en secuencia; se detiene si alguna ejecución falla. Requiere el proyecto
local actualizado, Docker, Supabase CLI y Chromium. La suite general omite
intencionalmente el caso `Storage failures and lost commit responses`, porque
necesita el proxy de fallos exclusivo del runner aislado; la segunda ejecución
activa ese proxy y ejecuta el caso. Un resultado general con un test omitido no
equivale a haber completado toda la cobertura.

El servidor E2E usa `.next-e2e/dev`, separado de `.next/dev` del desarrollo
habitual y de `.next` del build de producción. Los traces y adjuntos se guardan
en `test-results/e2e` y `test-results/event-covers`, respectivamente, para
conservar los resultados de ambas suites. Los runners comparten los puertos
`3100/3101/3102` y deben ejecutarse en secuencia.

`test:e2e` obtiene la URL y las claves del proyecto desde `supabase status -o env`.
Si Supabase ya corre fuera del CLI, establece `E2E_SUPABASE_URL`,
`E2E_SUPABASE_ANON_KEY` y `E2E_SUPABASE_SERVICE_ROLE_KEY` antes de ejecutar
la prueba. Solo se acepta una URL local para evitar crear datos de prueba en
un proyecto remoto.

Antes de abrir Playwright, el ejecutor comprueba mediante consultas de solo lectura
que las tablas y columnas requeridas estén disponibles. Si falla esta comprobación,
revisa las credenciales y ejecuta `supabase migration list --local` y
`supabase migration up --local` en el proyecto local al que apuntan las pruebas.
Iniciar Supabase no actualiza una base existente automáticamente. No hace falta
reiniciar ni borrar los datos para aplicar las migraciones pendientes.

## Correcciones constitucionales

Las specs `002`–`005` definen calendario por evento, reservas de 10 minutos con
confirmación por email, publicación con tipo de entrada, permisos de puerta y
auditoría. Las migraciones nuevas conservan Tickets existentes; eventos publicados
sin tipos pasan a borrador. Los enlaces públicos de registro usan un código nuevo:
regenera los enlaces antiguos con UUID desde el panel. El Ticket público no muestra
nombre ni email; el CSV de auditoría del owner incluye revocadas.

Para verificar upgrade y comportamiento sin modificar el proyecto de desarrollo:

```bash
node tests/db/run-constitutional.mjs
```

Requiere Docker, Supabase CLI y Chromium de Playwright instalados. El runner crea
un proyecto temporal en puertos `554xx`, aplica el historial y datos sintéticos,
ejecuta pgTAP, carreras con sesiones independientes y Playwright con correo
simulado. Detiene únicamente su proyecto al terminar. Los logs privados quedan
en el directorio temporal indicado si falla; las claves nunca se imprimen.

`npm run lint` y `npm run build` verifican código y compilación. Estas pruebas
locales no despliegan la aplicación ni aplican migraciones al proyecto remoto.

## Protección de aforo (spec 001)

El editor envía cambios autenticados a `PATCH /api/eventos/[id]/configuracion`.
PostgreSQL protege tanto el aforo como el cupo de cada tipo, contando registros
confirmados y reservas pendientes vigentes, incluidas entradas revocadas. Una
petición conjunta se acepta completa o revierte todos sus campos. Las migraciones
conservan límites y datos heredados al activarse; los límites solicitados se validan
incluso si repiten el valor guardado. Editar solo metadatos omite límites no tocados.

```bash
node tests/db/run-capacity-verification.mjs
node tests/db/run-capacity-concurrency.mjs
node tests/db/run-capacity-upgrade.mjs --story US1
```

Requiere Docker activo, Supabase CLI y Chromium. Ejecutar los runners en secuencia:
usan puertos `555xx`, proyectos temporales independientes, correo simulado y limpieza
al terminar. El primero ejecuta upgrade de las tres historias, 111 comprobaciones
SQL y la regresión de navegador. `--story` acepta `US1`, `US2` o `US3`; omitido ejecuta
todas. La RPC y las operaciones de límites requieren READ COMMITTED.

Ver [guía y evidencia](specs/001-proteger-limites-aforo/quickstart.md) y los
[contratos](specs/001-proteger-limites-aforo/contracts/event-configuration.md).

## Portadas de eventos (spec 006)

Requiere Node >=22 y sharp 0.35.3 con su binario nativo de producción. El owner
puede guardar JPEG, PNG o WebP estáticos de hasta 5 MiB, con dimensiones orientadas
de al menos 640 × 360 px. La portada, alternativa y encuadre se guardan por separado
de los detalles del Event. Una revisión protege contra cambios simultáneos y un
registro durable permite recuperar respuestas perdidas. Los originales validados
se publican con claves inmutables; el staging permanece privado.

El esquema y los buckets se crean únicamente mediante las migraciones versionadas
de `supabase/migrations/`, incluida `20261008120000_event_covers.sql`. Aplicar las
migraciones con el procedimiento habitual del proyecto antes de desplegar código.

```bash
node tests/db/run-event-covers.mjs
npx playwright test --config tests/unit/playwright.config.ts
```

El runner requiere Docker, Supabase CLI y Chromium; usa un proyecto desechable en
`556xx`, Storage real y correo simulado. Comprueba upgrade, SQL, carreras, limpieza,
editor, geometría y las regresiones de reserva/email/QR/check-in, aforo y permisos.
Un proxy de fallos exclusivo del proceso de pruebas ocupa `3102`; navegador y correo
usan `3100/3101`. Ejecutar estos runners en secuencia. `--db-only` limita la ejecución
a SQL/carreras/limpieza; los argumentos de Playwright permiten filtrar el navegador.
`--no-screenshots` permite repetir comprobaciones funcionales del editor sin otra
ronda de capturas. Las pruebas de decoder guardan artefactos en un subdirectorio
propio para conservar las capturas del navegador.

Las imágenes de `tests/e2e/fixtures/event-covers/` se generan bajo demanda y no
se versionan. El generador compartido también se ejecuta antes de las pruebas de
limpieza de base de datos, por lo que `--db-only` funciona desde un checkout limpio.
Las capturas de revisión en `specs/006-imagenes-en-eventos/screenshots/` y los
resultados en `test-results/` son artefactos locales excluidos de Git. Se conservan
en el repositorio únicamente el icono de la aplicación y las siete portadas del
seed, necesarias para reproducir los ejemplos y comprobar su integridad. El seed
y sus imágenes son datos de desarrollo y no deben cargarse en producción.

La limpieza se ejecuta en un proceso de servidor, con las variables existentes
`NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` cargadas en su entorno:

```bash
node scripts/cleanup-event-covers.mjs
```

Configurar en el hosting elegido un scheduler **cada 15 minutos** y alertar por exit
no cero. La salida contiene solo cantidades. Los fallos dejan trabajos con backoff;
la siguiente ejecución reintenta. Una transferencia incierta no se da por terminada
por haber vencido su petición: se conserva su evidencia y se revisan objetos tardíos.
Los resultados y tombstones se retienen al menos 24 horas y actualmente no se purgan
automáticamente, para permitir reconciliación posterior. La portada vigente se protege.

`lib/event-cover-config.json` es la única configuración compartida entre servicio,
decoder y worker: decodeConcurrency=1, decodeTimeoutMs=30000,
storageRequestTimeoutMs=30000, processingTimeoutMs=120000,
processingLeaseMs=180000 y cleanupTransferMarginMs=300000. Los valores deben ser
enteros positivos; el deadline cubre cada timeout individual, el lease supera el
deadline y el margen es al menos 300000 ms. Cada intento persiste sus propios límites;
cambiar la configuración no acorta la protección de un objeto anterior.

Antes del despliegue, verificar en ese hosting el binario sharp, memoria/concurrencia,
duración disponible de API/worker y el scheduler con un fallo y un reintento reales.
Estas comprobaciones operativas siguen pendientes: el runner local no configura
hosting ni aplica migraciones remotas. Ver [evidencia de portadas](specs/006-imagenes-en-eventos/verification.md).
