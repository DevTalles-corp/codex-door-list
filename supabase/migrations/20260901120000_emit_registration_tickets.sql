create type public.ticket_status as enum ('valid', 'used', 'revoked');

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique
    references public.registrations (id) on delete cascade,
  code text not null unique
    default encode(extensions.gen_random_bytes(32), 'hex')
    check (code ~ '^[0-9a-f]{64}$'),
  status public.ticket_status not null default 'valid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tickets_status_idx on public.tickets (status);

create trigger tickets_set_updated_at
before update on public.tickets
for each row execute function public.set_events_updated_at();

alter table public.tickets enable row level security;

revoke all on public.tickets from anon, authenticated;

insert into public.tickets (registration_id)
select registration.id
from public.registrations as registration
on conflict (registration_id) do nothing;

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
  join public.tickets_types as ticket_type
    on ticket_type.id = registration.ticket_type_id
  where p_code ~ '^[0-9a-f]{64}$'
    and ticket.code = p_code;
$$;

drop function public.register_for_event(uuid, uuid, text, text);

create function public.register_for_event(
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
  ticket_capacity integer;
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

  select ticket.max_capacity
  into ticket_capacity
  from public.tickets_types as ticket
  where ticket.id = p_ticket_type_id
    and ticket.event_id = p_event_id
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

  if registration_count >= ticket_capacity then
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

revoke all on function public.get_public_ticket(text) from public;
revoke all on function public.register_for_event(uuid, uuid, text, text) from public;

grant execute on function public.get_public_ticket(text) to anon, authenticated;
grant execute on function public.register_for_event(uuid, uuid, text, text) to anon, authenticated;
