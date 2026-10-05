# Door List

Landing inicial para una plataforma de tickets de eventos.

## Desarrollo

Copia `.env.example` a `.env.local` y completa los valores. Las variables
`NEXT_PUBLIC_` se envían al navegador; `RESEND_API_KEY` y
`SUPABASE_SERVICE_ROLE_KEY` deben permanecer en el servidor. La clave de servicio
solo se usa en el flujo privado de reserva y confirmación por enlace de email;
las operaciones del organizador conservan su JWT y RLS.

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
npx playwright install chromium
npm run test:e2e
```

`test:e2e` obtiene la URL y las claves del proyecto desde `supabase status -o env`.
Si Supabase ya corre fuera del CLI, establece `E2E_SUPABASE_URL`,
`E2E_SUPABASE_ANON_KEY` y `E2E_SUPABASE_SERVICE_ROLE_KEY` antes de ejecutar
la prueba. Solo se acepta una URL local para evitar crear datos de prueba en
un proyecto remoto.

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
