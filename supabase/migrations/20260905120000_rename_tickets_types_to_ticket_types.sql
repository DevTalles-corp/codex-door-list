alter table public.tickets_types rename to ticket_types;

alter index public.tickets_types_event_id_idx rename to ticket_types_event_id_idx;

alter table public.ticket_types rename constraint tickets_types_pkey to ticket_types_pkey;
alter table public.ticket_types rename constraint tickets_types_event_id_fkey to ticket_types_event_id_fkey;
alter table public.ticket_types rename constraint tickets_types_name_check to ticket_types_name_check;
alter table public.ticket_types rename constraint tickets_types_max_capacity_check to ticket_types_max_capacity_check;
alter table public.ticket_types rename constraint tickets_types_event_id_name_key to ticket_types_event_id_name_key;
alter table public.ticket_types rename constraint tickets_types_event_id_id_key to ticket_types_event_id_id_key;

alter trigger tickets_types_set_updated_at on public.ticket_types rename to ticket_types_set_updated_at;

alter table public.ticket_types enable row level security;

alter policy "Ticket types of published events are publicly readable"
on public.ticket_types
using (
  exists (
    select 1
    from public.events
    where events.id = ticket_types.event_id
      and events.status = 'published'
  )
);

alter policy "Owners can read ticket types for their events"
on public.ticket_types
using (
  exists (
    select 1
    from public.events
    where events.id = ticket_types.event_id
      and events.created_by = (select auth.uid())
  )
);

alter policy "Owners can create ticket types for their events"
on public.ticket_types
with check (
  exists (
    select 1
    from public.events
    where events.id = ticket_types.event_id
      and events.created_by = (select auth.uid())
  )
);

alter policy "Owners can update ticket types for their events"
on public.ticket_types
using (
  exists (
    select 1
    from public.events
    where events.id = ticket_types.event_id
      and events.created_by = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.events
    where events.id = ticket_types.event_id
      and events.created_by = (select auth.uid())
  )
);

alter policy "Owners can delete ticket types for their events"
on public.ticket_types
using (
  exists (
    select 1
    from public.events
    where events.id = ticket_types.event_id
      and events.created_by = (select auth.uid())
  )
);

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
declare assigned_capacity integer;
begin
  select coalesce(sum(max_capacity), 0) into assigned_capacity from public.ticket_types where event_id = new.id;
  if new.max_capacity < assigned_capacity then
    raise exception using errcode = '23514', message = format('El aforo del evento no puede ser menor que las entradas ya asignadas (%s).', assigned_capacity);
  end if;
  return new;
end;
$$;

create or replace function public.get_public_event_registration(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', event_row.id,
      'title', event_row.title,
      'description', event_row.description,
      'event_date', event_row.event_date,
      'venue', event_row.venue
    ),
    'ticket_types', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ticket_type_summary.id,
            'name', ticket_type_summary.name,
            'max_capacity', ticket_type_summary.max_capacity,
            'remaining_capacity', greatest(ticket_type_summary.max_capacity - ticket_type_summary.registration_count, 0)
          )
          order by ticket_type_summary.created_at
        )
        from (
          select
            ticket_type.id,
            ticket_type.name,
            ticket_type.max_capacity,
            ticket_type.created_at,
            count(registration.id)::integer as registration_count
          from public.ticket_types as ticket_type
          left join public.registrations as registration
            on registration.ticket_type_id = ticket_type.id
          where ticket_type.event_id = event_row.id
          group by ticket_type.id
        ) as ticket_type_summary
      ),
      '[]'::jsonb
    )
  )
  from public.events as event_row
  where event_row.id = p_event_id
    and event_row.status = 'published'
    and (event_row.event_date at time zone 'America/La_Paz')::date
      >= (pg_catalog.now() at time zone 'America/La_Paz')::date;
$$;

create or replace function public.get_public_ticket(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', ticket.code,
    'status', ticket.status,
    'issued_at', ticket.created_at,
    'attendee', jsonb_build_object(
      'name', registration.attendee_name,
      'email', registration.attendee_email
    ),
    'event', jsonb_build_object(
      'title', event.title,
      'event_date', event.event_date,
      'venue', event.venue
    ),
    'ticket_type', jsonb_build_object(
      'name', ticket_type.name
    )
  )
  from public.tickets as ticket
  join public.registrations as registration
    on registration.id = ticket.registration_id
  join public.events as event
    on event.id = registration.event_id
  join public.ticket_types as ticket_type
    on ticket_type.id = registration.ticket_type_id
  where p_code ~ '^[0-9a-f]{64}$'
    and ticket.code = p_code;
$$;

create or replace function public.register_for_event(
  p_event_id uuid,
  p_ticket_type_id uuid,
  p_name text,
  p_email text
)
returns table (status text, registration_id uuid, ticket_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_status public.event_status;
  event_date timestamptz;
  ticket_type_capacity integer;
  registration_count integer;
  normalized_name text := btrim(p_name);
  normalized_email text := lower(btrim(p_email));
  new_registration_id uuid;
  new_ticket_code text;
begin
  if p_event_id is null
    or p_ticket_type_id is null
    or normalized_name is null
    or char_length(normalized_name) not between 1 and 120
    or normalized_email is null
    or char_length(normalized_email) not between 3 and 254
    or normalized_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    return query select 'invalid_input'::text, null::uuid, null::text;
    return;
  end if;

  select event.status, event.event_date
  into event_status, event_date
  from public.events as event
  where event.id = p_event_id
  for update;

  if not found
    or event_status <> 'published'
    or (event_date at time zone 'America/La_Paz')::date
      < (pg_catalog.now() at time zone 'America/La_Paz')::date
  then
    return query select 'event_unavailable'::text, null::uuid, null::text;
    return;
  end if;

  select ticket_type.max_capacity
  into ticket_type_capacity
  from public.ticket_types as ticket_type
  where ticket_type.id = p_ticket_type_id
    and ticket_type.event_id = p_event_id
  for update;

  if not found then
    return query select 'ticket_unavailable'::text, null::uuid, null::text;
    return;
  end if;

  if exists (
    select 1
    from public.registrations as registration
    where registration.event_id = p_event_id
      and lower(btrim(registration.attendee_email)) = normalized_email
  ) then
    return query select 'duplicate_registration'::text, null::uuid, null::text;
    return;
  end if;

  select count(*)::integer
  into registration_count
  from public.registrations as registration
  where registration.ticket_type_id = p_ticket_type_id;

  if registration_count >= ticket_type_capacity then
    return query select 'ticket_unavailable'::text, null::uuid, null::text;
    return;
  end if;

  insert into public.registrations (
    event_id,
    ticket_type_id,
    attendee_name,
    attendee_email
  )
  values (
    p_event_id,
    p_ticket_type_id,
    normalized_name,
    normalized_email
  )
  on conflict do nothing
  returning id into new_registration_id;

  if new_registration_id is null then
    return query select 'duplicate_registration'::text, null::uuid, null::text;
    return;
  end if;

  insert into public.tickets (registration_id)
  values (new_registration_id)
  returning code into new_ticket_code;

  return query select 'success'::text, new_registration_id, new_ticket_code;
end;
$$;
