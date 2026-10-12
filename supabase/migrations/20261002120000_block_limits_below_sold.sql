-- Feature 001: ningún límite baja por debajo de lo ya vendido.
-- Reemplaza el cuerpo de las dos funciones de validación de aforo; los triggers
-- ticket_types_validate_capacity y events_validate_capacity ya apuntan a ellas.
-- Códigos de error: DL001 (cupo de un tipo) y DL002 (aforo del evento); la cantidad
-- vendida viaja en `detail`.

create or replace function public.validate_ticket_type_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_capacity integer;
  assigned_capacity integer;
  sold_count integer;
begin
  -- Mismo bloqueo del evento que usa register_for_event: lo vendido se cuenta después de él.
  select max_capacity into event_capacity from public.events where id = new.event_id for update;

  if tg_op = 'UPDATE' and new.max_capacity < old.max_capacity then
    select count(*)::integer into sold_count
    from public.registrations
    where ticket_type_id = new.id;

    if new.max_capacity < sold_count then
      raise exception using
        errcode = 'DL001',
        message = format('El cupo del tipo no puede ser menor que las entradas ya vendidas (%s).', sold_count),
        detail = sold_count::text;
    end if;
  end if;

  select coalesce(sum(max_capacity), 0) into assigned_capacity
  from public.ticket_types where event_id = new.event_id and id is distinct from new.id;
  if assigned_capacity + new.max_capacity > event_capacity then
    raise exception using errcode = '23514', message = format('La capacidad asignada (%s) supera el aforo del evento (%s).', assigned_capacity + new.max_capacity, event_capacity);
  end if;
  return new;
end;
$$;

create or replace function public.validate_event_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_capacity integer;
  sold_count integer;
begin
  if new.max_capacity < old.max_capacity then
    select count(*)::integer into sold_count
    from public.registrations
    where event_id = new.id;

    if new.max_capacity < sold_count then
      raise exception using
        errcode = 'DL002',
        message = format('El aforo del evento no puede ser menor que las entradas ya vendidas (%s).', sold_count),
        detail = sold_count::text;
    end if;
  end if;

  select coalesce(sum(max_capacity), 0) into assigned_capacity from public.ticket_types where event_id = new.id;
  if new.max_capacity < assigned_capacity then
    raise exception using errcode = '23514', message = format('El aforo del evento no puede ser menor que las entradas ya asignadas (%s).', assigned_capacity);
  end if;
  return new;
end;
$$;
