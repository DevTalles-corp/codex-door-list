alter table public.events
add column max_capacity integer not null default 1 check (max_capacity > 0);

create or replace function public.validate_ticket_type_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_capacity integer;
  assigned_capacity integer;
begin
  select max_capacity into event_capacity from public.events where id = new.event_id for update;
  select coalesce(sum(max_capacity), 0) into assigned_capacity
  from public.tickets_types where event_id = new.event_id and id is distinct from new.id;
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
declare assigned_capacity integer;
begin
  select coalesce(sum(max_capacity), 0) into assigned_capacity from public.tickets_types where event_id = new.id;
  if new.max_capacity < assigned_capacity then
    raise exception using errcode = '23514', message = format('El aforo del evento no puede ser menor que las entradas ya asignadas (%s).', assigned_capacity);
  end if;
  return new;
end;
$$;

create trigger ticket_types_validate_capacity
before insert or update of event_id, max_capacity on public.tickets_types
for each row execute function public.validate_ticket_type_capacity();

create trigger events_validate_capacity
before update of max_capacity on public.events
for each row execute function public.validate_event_capacity();
