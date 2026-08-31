create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  ticket_type_id uuid not null,
  attendee_name text not null
    check (char_length(btrim(attendee_name)) between 1 and 120),
  attendee_email text not null
    check (
      char_length(btrim(attendee_email)) between 3 and 254
      and btrim(attendee_email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  created_at timestamptz not null default now()
);

alter table public.tickets_types
add constraint tickets_types_event_id_id_key unique (event_id, id);

alter table public.registrations
add constraint registrations_event_ticket_type_fkey
foreign key (event_id, ticket_type_id)
references public.tickets_types (event_id, id)
on delete cascade;

create unique index registrations_event_email_unique_idx
on public.registrations (event_id, lower(btrim(attendee_email)));

create index registrations_ticket_type_id_idx
on public.registrations (ticket_type_id);

alter table public.registrations enable row level security;

revoke all on public.registrations from anon, authenticated;

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
            'id', ticket.id,
            'name', ticket.name,
            'max_capacity', ticket.max_capacity,
            'remaining_capacity', greatest(ticket.max_capacity - ticket.registration_count, 0)
          )
          order by ticket.created_at
        )
        from (
          select
            ticket_type.id,
            ticket_type.name,
            ticket_type.max_capacity,
            ticket_type.created_at,
            count(registration.id)::integer as registration_count
          from public.tickets_types as ticket_type
          left join public.registrations as registration
            on registration.ticket_type_id = ticket_type.id
          where ticket_type.event_id = event_row.id
          group by ticket_type.id
        ) as ticket
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

create or replace function public.register_for_event(
  p_event_id uuid,
  p_ticket_type_id uuid,
  p_name text,
  p_email text
)
returns table (status text, registration_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_status public.event_status;
  event_date timestamptz;
  ticket_capacity integer;
  registration_count integer;
  normalized_name text := btrim(p_name);
  normalized_email text := lower(btrim(p_email));
  new_registration_id uuid;
begin
  if p_event_id is null
    or p_ticket_type_id is null
    or normalized_name is null
    or char_length(normalized_name) not between 1 and 120
    or normalized_email is null
    or char_length(normalized_email) not between 3 and 254
    or normalized_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    return query select 'invalid_input'::text, null::uuid;
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
    return query select 'event_unavailable'::text, null::uuid;
    return;
  end if;

  select ticket.max_capacity
  into ticket_capacity
  from public.tickets_types as ticket
  where ticket.id = p_ticket_type_id
    and ticket.event_id = p_event_id
  for update;

  if not found then
    return query select 'ticket_unavailable'::text, null::uuid;
    return;
  end if;

  if exists (
    select 1
    from public.registrations as registration
    where registration.event_id = p_event_id
      and lower(btrim(registration.attendee_email)) = normalized_email
  ) then
    return query select 'duplicate_registration'::text, null::uuid;
    return;
  end if;

  select count(*)::integer
  into registration_count
  from public.registrations as registration
  where registration.ticket_type_id = p_ticket_type_id;

  if registration_count >= ticket_capacity then
    return query select 'ticket_unavailable'::text, null::uuid;
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
    return query select 'duplicate_registration'::text, null::uuid;
    return;
  end if;

  return query select 'success'::text, new_registration_id;
end;
$$;

revoke all on function public.get_public_event_registration(uuid) from public;
revoke all on function public.register_for_event(uuid, uuid, text, text) from public;

grant execute on function public.get_public_event_registration(uuid) to anon, authenticated;
grant execute on function public.register_for_event(uuid, uuid, text, text) to anon, authenticated;
