# Contexto

- Asume que la versión instalada de Next.js puede diferir de lo que conoces y consulta su documentación oficial antes de escribir código del framework.
- Usa Server Components por defecto.
- Añade `"use client"` solo cuando exista una razón concreta que requiera APIs del cliente.

# Estructura

- Coloca las rutas en `app/`, la UI compartida en `components/`, la lógica y las utilidades compartidas en `lib/`, los clientes de Supabase en `lib/supabase/` y el esquema de la base de datos en migraciones versionadas dentro de `supabase/migrations/`.
- Mantén junto a su ruta todo componente usado por una sola ruta y mueve a `components/` todo componente usado por dos o más rutas.

# Vocabulario

- Usa `Event`, `TicketType`, `Ticket` y `Registration` con un único significado consistente en todo el repositorio y no los uses como sinónimos entre sí.
- Nombra las tablas en plural y `snake_case`, conservando el nombre de su entidad.

# Idioma

- Escribe el código, los nombres y los tipos en inglés.
- Escribe el copy de la interfaz en español.
- Define las rutas públicas en español y nombra en inglés los componentes que las sirven.

# Casing

- Limita `snake_case` a la capa de persistencia.
- Define en `camelCase` todos los contratos de request y response de la API.

# Fuente única de verdad

- Centraliza en `lib/` los tipos compartidos entre API, email y UI y no los redefinas por archivo.
- Centraliza en `lib/` los helpers de fecha y formato y no los copies entre pantallas.

# Errores

- Devuelve todo error de API como JSON con la forma `{ error: string }`.
- Devuelve los errores de negocio con su código HTTP real.
- Comprueba `response.ok` en el cliente antes de interpretar el cuerpo.
- No muestres en la UI mensajes de error crudos del proveedor.

# Base de datos

- Implementa cada cambio de base de datos mediante un archivo de migración versionado.
- No ejecutes ni documentes SQL suelto como mecanismo para cambiar el esquema.
- Habilita RLS en toda tabla expuesta.
