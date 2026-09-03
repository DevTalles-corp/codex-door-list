Sí: siendo honesto, en buena medida he decidido sobre la marcha. Hay convenciones emergentes, pero no existe una arquitectura o guía explícita aplicada consistentemente. El código funciona y `npm run lint` pasa, pero eso no equivale a coherencia estructural.

Lo que sí es consistente:

- Next.js App Router: rutas con `page.tsx` y API con `route.ts`.
- Componentes y tipos en `PascalCase`; funciones y variables en `camelCase`.
- Base de datos y respuestas provenientes de Supabase en `snake_case`.
- Interfaz y mensajes para usuarios en español; identificadores internos principalmente en inglés.
- Migraciones SQL ordenadas cronológicamente.
- Los flujos públicos suelen distinguir carga, indisponibilidad, error y éxito.

Las inconsistencias concretas más importantes son:

1. El panel del organizador rompe la estructura del resto

[organizer.tsx](/Users/teddypaz/Desktop/door-list/app/organizer.tsx:25) contiene autenticación, consultas, transformación de datos, formularios, validación, CRUD y toda la presentación. Varias declaraciones y prácticamente todo el JSX están comprimidos en una sola línea —especialmente la línea 46— mientras que los flujos públicos están separados por ruta y componente:

- [registro/page.tsx](/Users/teddypaz/Desktop/door-list/app/eventos/[id]/registro/page.tsx:1)
- [public-registration.tsx](/Users/teddypaz/Desktop/door-list/app/eventos/[id]/registro/public-registration.tsx:61)
- [public-ticket.tsx](/Users/teddypaz/Desktop/door-list/app/entradas/[code]/public-ticket.tsx:41)

Además, `organizer.tsx` vive directamente dentro de `app/`, aunque solo pertenece a `/organizador`. Siguiendo el patrón posterior, debería estar junto a su página o dividido por funcionalidad.

2. Los nombres pierden precisión

En [organizer.tsx](/Users/teddypaz/Desktop/door-list/app/organizer.tsx:7) aparecen:

- `Status`, demasiado genérico.
- `EventItem`, mientras que en otros lugares se usa `PublicEvent`.
- `Ticket`, aunque realmente representa un tipo de entrada, no una entrada emitida.
- `load`, sin indicar qué carga.
- `a` y `b` para resultados de consultas.

Esto contrasta con nombres posteriores como `TicketStatus`, `RegistrationResult`, `loadEvent` y `loadTicket`.

La base de datos también usa `tickets_types`, por ejemplo en la [migración inicial](/Users/teddypaz/Desktop/door-list/supabase/migrations/20260827201304_create_events_and_tickets_types.sql:15). El nombre convencional sería `ticket_types`. En TypeScript sí usamos `TicketType`, así que ni siquiera mantenemos exactamente el mismo concepto lingüístico.

3. Los mismos tipos están redefinidos varias veces

`RegistrationTicket` existe tanto en:

- [registration-email.ts](/Users/teddypaz/Desktop/door-list/app/lib/registration-email.ts:4)
- [registrations/route.ts](/Users/teddypaz/Desktop/door-list/app/api/registrations/route.ts:20)

Asimismo, las formas de evento y entrada se vuelven a describir en cada componente. Todavía son pequeñas, pero pueden divergir. De hecho, `RegistrationResult.status` es simplemente `string` en el servidor, mientras que el cliente define una unión cerrada de estados en [public-registration.tsx](/Users/teddypaz/Desktop/door-list/app/eventos/[id]/registro/public-registration.tsx:26).

4. Utilidades duplicadas con estilos diferentes

`formatEventDate` está repetida en:

- [public-registration.tsx](/Users/teddypaz/Desktop/door-list/app/eventos/[id]/registro/public-registration.tsx:49)
- [public-ticket.tsx](/Users/teddypaz/Desktop/door-list/app/entradas/[code]/public-ticket.tsx:33)
- [registration-email.ts](/Users/teddypaz/Desktop/door-list/app/lib/registration-email.ts:29)

`laPazDate` y `registrationIsOpen` también están duplicadas entre [page.tsx](/Users/teddypaz/Desktop/door-list/app/page.tsx:16) y [organizer.tsx](/Users/teddypaz/Desktop/door-list/app/organizer.tsx:17).

Unas utilidades se escriben como `const` con arrow functions y otras como declaraciones `function`. No es grave, pero demuestra que no fijamos una convención.

5. El manejo de errores cambia según la pantalla

El panel administrativo muestra directamente mensajes proporcionados por Supabase mediante `message(error)` en [organizer.tsx](/Users/teddypaz/Desktop/door-list/app/organizer.tsx:11). Eso puede exponer mensajes técnicos en inglés o detalles de la base de datos.

Los flujos públicos, en cambio, convierten los errores en mensajes controlados como “No pudimos cargar el evento” en [public-registration.tsx](/Users/teddypaz/Desktop/door-list/app/eventos/[id]/registro/public-registration.tsx:88).

En el servidor usamos otra estrategia:

- Registramos detalles en inglés con `console.error`.
- Devolvemos códigos genéricos como `server_error`.
- Lanzamos excepciones desde el módulo de correo.

Se puede justificar que cada capa actúe distinto, pero actualmente no hay una política común que lo explique ni tipos de error compartidos.

6. Los estados HTTP no siguen una regla completamente clara

La API devuelve:

- `400` para input inválido.
- `500` o `503` para fallos internos.
- `200` para estados de negocio como `event_unavailable` o `duplicate_registration`.

Eso puede ser una decisión válida, pero el cliente ni siquiera consulta `response.ok`; intenta interpretar cualquier respuesta como `RegistrationResult` en [public-registration.tsx](/Users/teddypaz/Desktop/door-list/app/eventos/[id]/registro/public-registration.tsx:138). Si Next.js o un proxy devuelve HTML, cae accidentalmente en el `catch`, no por una estrategia deliberada.

7. Estado visual y semántica de errores mezclados

En el organizador, `notice` sirve tanto para:

- Errores de autenticación o base de datos.
- Confirmaciones como “Evento guardado”.
- Confirmaciones de eliminación.

Después se representa siempre con la misma clase y, cuando hay sesión, con `role="status"` en [organizer.tsx](/Users/teddypaz/Desktop/door-list/app/organizer.tsx:46). No existe una distinción consistente entre `success`, `error` e información. El flujo público sí usa variantes como `.public-alert.success` y `.public-alert.error`.

8. El CSS revela crecimiento por añadidos

[globals.css](/Users/teddypaz/Desktop/door-list/app/globals.css:3) comienza formateado en bloques multilínea, pero desde la línea 30 muchas reglas quedan comprimidas y varias comparten línea.

También mezcla:

- Estilos globales: `article`, `li`, `small`.
- Clases genéricas: `.link`, `.danger`, `.draft`.
- Clases por funcionalidad: `.ticket-card`, `.registration-card`, `.landing-state`.

Ese alcance global puede producir efectos colaterales cuando aparezcan nuevas pantallas. No hay CSS Modules, agrupación por feature ni una convención de nombres tipo BEM.

9. No hay mecanismos que obliguen a mantener las convenciones

Tenemos TypeScript estricto y ESLint, lo cual es positivo, pero no encontré:

- Prettier u otro formateador.
- Pruebas unitarias o de integración.
- Tipos generados de Supabase.
- Una guía de arquitectura o nombres.
- Validación compartida de requests.
- Scripts separados para `typecheck` o tests.

Mi evaluación resumida: la base no es caótica, pero sí es una implementación incremental. Los primeros módulos —especialmente `organizer.tsx` y parte del CSS— fueron resueltos rápidamente; los flujos posteriores muestran una estructura más cuidada, pero no volvimos atrás para uniformar lo anterior. La deuda principal no es funcional: es duplicación, límites de módulos y una política de errores todavía implícita.