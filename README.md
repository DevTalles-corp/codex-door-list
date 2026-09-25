# Door List

Landing inicial para una plataforma de tickets de eventos.

## Desarrollo

Copia `.env.example` a `.env.local` y completa los valores. Las variables
`NEXT_PUBLIC_` se envían al navegador; `RESEND_API_KEY` debe permanecer en el
servidor.

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
