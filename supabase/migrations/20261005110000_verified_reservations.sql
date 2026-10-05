create type public.reservation_status as enum ('pending', 'confirmed', 'expired', 'cancelled');

create table public.registration_reservations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  ticket_type_id uuid not null,
  attendee_name text not null check (char_length(btrim(attendee_name)) between 1 and 120),
  attendee_email text not null check (char_length(btrim(attendee_email)) between 3 and 254),
  token_hash text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  status public.reservation_status not null default 'pending',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint reservations_event_type_fkey foreign key (event_id, ticket_type_id)
    references public.ticket_types (event_id, id) on delete cascade
);
create unique index reservations_pending_event_email_idx
  on public.registration_reservations (event_id, lower(btrim(attendee_email)))
  where status = 'pending';
create index reservations_active_type_idx
  on public.registration_reservations (ticket_type_id, expires_at)
  where status = 'pending';
alter table public.registration_reservations enable row level security;
revoke all on public.registration_reservations from anon, authenticated;

create function public.capacity_consumption(p_event_id uuid, p_ticket_type_id uuid default null)
returns bigint language sql volatile security definer set search_path = '' as $$
  select (select count(*) from public.registrations r
    where r.event_id = p_event_id and (p_ticket_type_id is null or r.ticket_type_id = p_ticket_type_id))
    + (select count(*) from public.registration_reservations r
      where r.event_id = p_event_id and (p_ticket_type_id is null or r.ticket_type_id = p_ticket_type_id)
        and r.status = 'pending' and r.expires_at > pg_catalog.clock_timestamp());
$$;
revoke all on function public.capacity_consumption(uuid, uuid) from public, anon, authenticated;

create or replace function public.validate_event_capacity()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare occupied bigint; assigned bigint; violations jsonb := '[]'::jsonb;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'READ COMMITTED required' using errcode = '0A000';
  end if;
  occupied := public.capacity_consumption(new.id);
  select coalesce(sum(t.max_capacity), 0) into assigned from public.ticket_types t where t.event_id = new.id;
  if new.max_capacity < occupied then
    violations := violations || jsonb_build_array(jsonb_build_object('scope', 'event',
      'reason', 'registrationConsumption', 'requestedCapacity', new.max_capacity, 'minimumCapacity', occupied));
  end if;
  if new.max_capacity < assigned then
    violations := violations || jsonb_build_array(jsonb_build_object('scope', 'event',
      'reason', 'assignedCapacity', 'requestedCapacity', new.max_capacity, 'minimumCapacity', assigned));
  end if;
  if jsonb_array_length(violations) > 0 then
    raise exception 'capacity violation' using errcode = '23514',
      detail = jsonb_build_object('kind', 'capacityViolation', 'version', 1, 'violations', violations)::text;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_event_capacity() from public, anon, authenticated;

create or replace function public.validate_ticket_type_capacity()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare event_capacity integer; assigned bigint; occupied bigint; violations jsonb := '[]'::jsonb;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'READ COMMITTED required' using errcode = '0A000';
  end if;
  -- DML already holds the type row: NOWAIT avoids waiting in reverse lock order.
  if tg_op = 'UPDATE' and old.event_id is distinct from new.event_id then
    perform 1 from public.events e where e.id in (old.event_id, new.event_id) order by e.id for update nowait;
  end if;
  select e.max_capacity into event_capacity from public.events e where e.id = new.event_id for update nowait;
  select coalesce(sum(t.max_capacity), 0) + new.max_capacity into assigned
    from public.ticket_types t where t.event_id = new.event_id and t.id is distinct from new.id;
  if tg_op = 'UPDATE' then
    occupied := public.capacity_consumption(old.event_id, new.id);
    if new.max_capacity < occupied then
      violations := violations || jsonb_build_array(jsonb_build_object('scope', 'ticketType',
        'reason', 'registrationConsumption', 'ticketTypeId', new.id, 'ticketTypeName', old.name,
        'requestedCapacity', new.max_capacity, 'minimumCapacity', occupied));
    end if;
  end if;
  if assigned > event_capacity then
    violations := violations || jsonb_build_array(jsonb_build_object('scope', 'event',
      'reason', 'assignedCapacity', 'requestedCapacity', event_capacity, 'minimumCapacity', assigned));
  end if;
  if jsonb_array_length(violations) > 0 then
    raise exception 'capacity violation' using errcode = '23514',
      detail = jsonb_build_object('kind', 'capacityViolation', 'version', 1, 'violations', violations)::text;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_ticket_type_capacity() from public, anon, authenticated;

drop function public.register_for_event(uuid, uuid, text, text);

create function public.reserve_for_event(
  p_event_id uuid, p_ticket_type_id uuid, p_name text, p_email text, p_token_hash text
) returns table (status text, reservation_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  event_row record;
  type_capacity integer;
  occupied bigint;
  normalized_name text := btrim(p_name);
  normalized_email text := lower(btrim(p_email));
  new_id uuid;
  expiration timestamptz;
  operation_time timestamptz;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'READ COMMITTED required' using errcode = '0A000';
  end if;
  if p_event_id is null or p_ticket_type_id is null
    or normalized_name is null or char_length(normalized_name) not between 1 and 120
    or normalized_email is null or char_length(normalized_email) not between 3 and 254
    or normalized_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return query select 'invalid_input'::text, null::uuid, null::timestamptz; return;
  end if;

  select e.status, e.registration_closes_at into event_row
  from public.events e where e.id = p_event_id for update;
  if not found or event_row.status <> 'published' or pg_catalog.clock_timestamp() >= event_row.registration_closes_at then
    return query select 'event_unavailable'::text, null::uuid, null::timestamptz; return;
  end if;
  select t.max_capacity into type_capacity from public.ticket_types t
    where t.id = p_ticket_type_id and t.event_id = p_event_id for update;
  if not found then
    return query select 'ticket_unavailable'::text, null::uuid, null::timestamptz; return;
  end if;
  operation_time := pg_catalog.clock_timestamp();
  if exists (select 1 from public.registrations r
    where r.event_id = p_event_id and lower(btrim(r.attendee_email)) = normalized_email) then
    return query select 'duplicate_registration'::text, null::uuid, null::timestamptz; return;
  end if;
  update public.registration_reservations r set status = 'expired', token_hash = null
    where r.event_id = p_event_id and r.status = 'pending' and r.expires_at <= operation_time;
  if exists (select 1 from public.registration_reservations r
    where r.event_id = p_event_id and r.status = 'pending'
      and lower(btrim(r.attendee_email)) = normalized_email) then
    return query select 'duplicate_registration'::text, null::uuid, null::timestamptz; return;
  end if;

  select (select count(*) from public.registrations r where r.ticket_type_id = p_ticket_type_id)
       + (select count(*) from public.registration_reservations r
          where r.ticket_type_id = p_ticket_type_id and r.status = 'pending'
            and r.expires_at > operation_time) into occupied;
  if occupied >= type_capacity then
    return query select 'ticket_unavailable'::text, null::uuid, null::timestamptz; return;
  end if;
  expiration := operation_time + interval '10 minutes';
  insert into public.registration_reservations
    (event_id, ticket_type_id, attendee_name, attendee_email, token_hash, expires_at)
    values (p_event_id, p_ticket_type_id, normalized_name, normalized_email, p_token_hash, expiration)
    returning id into new_id;
  return query select 'pending'::text, new_id, expiration;
end;
$$;
revoke all on function public.reserve_for_event(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_for_event(uuid, uuid, text, text, text) to service_role;

create function public.cancel_reservation(p_reservation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.registration_reservations
    set status = 'cancelled', token_hash = null
    where id = p_reservation_id and status = 'pending';
end;
$$;
revoke all on function public.cancel_reservation(uuid) from public, anon, authenticated;
grant execute on function public.cancel_reservation(uuid) to service_role;

create function public.confirm_reservation(p_token_hash text)
returns table (status text, registration_id uuid, ticket_code text)
language plpgsql security definer set search_path = '' as $$
declare reservation_row record; new_registration_id uuid; new_ticket_code text;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'READ COMMITTED required' using errcode = '0A000';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return query select 'invalid_token'::text, null::uuid, null::text; return;
  end if;
  select r.event_id into reservation_row from public.registration_reservations r
    where r.token_hash = p_token_hash and r.status = 'pending';
  if not found then return query select 'invalid_token'::text, null::uuid, null::text; return; end if;
  perform 1 from public.events e where e.id = reservation_row.event_id for update;
  select r.* into reservation_row from public.registration_reservations r
    where r.token_hash = p_token_hash and r.status = 'pending' for update;
  if not found then return query select 'invalid_token'::text, null::uuid, null::text; return; end if;
  if reservation_row.expires_at <= pg_catalog.clock_timestamp() then
    update public.registration_reservations set status = 'expired', token_hash = null
      where id = reservation_row.id;
    return query select 'expired'::text, null::uuid, null::text; return;
  end if;
  if exists (select 1 from public.registrations r where r.event_id = reservation_row.event_id
    and lower(btrim(r.attendee_email)) = lower(btrim(reservation_row.attendee_email))) then
    return query select 'duplicate_registration'::text, null::uuid, null::text; return;
  end if;
  insert into public.registrations (event_id, ticket_type_id, attendee_name, attendee_email)
    values (reservation_row.event_id, reservation_row.ticket_type_id,
      reservation_row.attendee_name, reservation_row.attendee_email)
    returning id into new_registration_id;
  insert into public.tickets (registration_id) values (new_registration_id)
    returning code into new_ticket_code;
  update public.registration_reservations
    set status = 'confirmed', confirmed_at = pg_catalog.clock_timestamp(), token_hash = null
    where id = reservation_row.id;
  return query select 'success'::text, new_registration_id, new_ticket_code;
end;
$$;
revoke all on function public.confirm_reservation(text) from public, anon, authenticated;
grant execute on function public.confirm_reservation(text) to service_role;

create or replace function public.get_public_event_registration(p_event_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'title', e.title,
      'description', e.description, 'event_date', e.event_date,
      'venue', e.venue, 'time_zone', e.time_zone,
      'registration_closes_at', e.registration_closes_at),
    'ticket_types', coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'max_capacity', t.max_capacity,
      'remaining_capacity', greatest(t.max_capacity
        - (select count(*) from public.registrations r where r.ticket_type_id = t.id)
        - (select count(*) from public.registration_reservations q
          where q.ticket_type_id = t.id and q.status = 'pending' and q.expires_at > pg_catalog.now()), 0)
    ) order by t.created_at) from public.ticket_types t where t.event_id = e.id), '[]'::jsonb)
  ) from public.events e where e.id = p_event_id and e.status = 'published'
    and pg_catalog.now() < e.registration_closes_at;
$$;

create or replace function public.get_public_event_list()
returns table (
  id uuid, title text, description text, event_date timestamptz, venue text,
  status public.event_status, max_capacity integer, remaining_capacity integer,
  time_zone text, registration_closes_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select e.id, e.title, e.description, e.event_date, e.venue, e.status, e.max_capacity,
    (select coalesce(sum(greatest(t.max_capacity
      - (select count(*) from public.registrations r where r.ticket_type_id = t.id)
      - (select count(*) from public.registration_reservations q
        where q.ticket_type_id = t.id and q.status = 'pending' and q.expires_at > pg_catalog.now()), 0)), 0)::integer
      from public.ticket_types t where t.event_id = e.id),
    e.time_zone, e.registration_closes_at
  from public.events e where e.status = 'published' order by e.event_date;
$$;
