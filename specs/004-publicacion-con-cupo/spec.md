# Publicación con cupo definido

## Objetivo

Un Event publicado siempre tiene al menos un TicketType con `max_capacity > 0`.

## Reglas

- Al publicar se comprueba en PostgreSQL la existencia del tipo; no basta una validación de UI.
- No se permite borrar ni trasladar el último tipo de un Event publicado. Despublicar a borrador permite después quitarlo.
- Eventos publicados anteriores que carecen de tipos pasan a borrador en una migración nueva; se conservan sus datos y `published_at` histórico. El panel explica que se debe añadir un tipo y republicar.
- El editor crea eventos nuevos en borrador, configura tipos y luego publica. La RPC conjunta de aforo respetará la misma guarda.

## Criterios de aceptación

- Publicar un Event sin tipos falla y deja el Event en borrador, incluso mediante DML directo.
- Publicar con un tipo de cupo 2 funciona; borrar ese tipo mientras el Event sigue publicado falla.
- La migración cambia solo eventos publicados sin tipos y el panel muestra la acción de recuperación.
