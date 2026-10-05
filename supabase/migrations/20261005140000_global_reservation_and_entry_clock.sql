-- Preserve prior migrations; tighten the global reservation bound and post-lock entry clock.

create or replace function public.reserve_for_event(
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

  select e.status, e.registration_closes_at, e.max_capacity into event_row
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
  if occupied >= type_capacity or public.capacity_consumption(p_event_id) >= event_row.max_capacity then
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

create or replace function public.check_in_ticket(p_event_id uuid, p_code text)
returns table (status text, attendee_name text, ticket_type_name text)
language plpgsql security definer set search_path = '' as $$
declare ticket_row record;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.events e where e.id = p_event_id and (
      e.created_by = (select auth.uid()) or exists (
        select 1 from public.event_door_staff s where s.event_id = e.id and s.user_id = (select auth.uid())
      )
    )
  ) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_code is null or p_code !~ '^[0-9a-f]{64}$' then
    return query select 'not_found'::text, null::text, null::text; return;
  end if;
  select t.id, t.status, r.attendee_name, tt.name as type_name,
    e.status as event_status, e.entry_opens_at, e.entry_closes_at
  into ticket_row from public.tickets t
  join public.registrations r on r.id = t.registration_id
  join public.ticket_types tt on tt.id = r.ticket_type_id
  join public.events e on e.id = r.event_id
  where t.code = p_code and e.id = p_event_id for update of t;
  if not found then return query select 'not_found'::text, null::text, null::text; return; end if;
  if ticket_row.status = 'revoked' or ticket_row.event_status <> 'published'
    or pg_catalog.clock_timestamp() < ticket_row.entry_opens_at
    or pg_catalog.clock_timestamp() >= ticket_row.entry_closes_at then
    return query select 'not_found'::text, null::text, null::text; return;
  end if;
  if ticket_row.status = 'used' then
    return query select 'used'::text, ticket_row.attendee_name::text, ticket_row.type_name::text; return;
  end if;
  update public.tickets set status = 'used', checked_in_at = pg_catalog.clock_timestamp() where id = ticket_row.id;
  return query select 'valid'::text, ticket_row.attendee_name::text, ticket_row.type_name::text;
end;
$$;


create or replace function public.get_public_event_registration(p_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'title', e.title,
      'description', e.description, 'event_date', e.event_date,
      'venue', e.venue, 'time_zone', e.time_zone,
      'registration_closes_at', e.registration_closes_at),
    'ticket_types', coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'max_capacity', t.max_capacity,
      'remaining_capacity', least(greatest(e.max_capacity - public.capacity_consumption(e.id), 0), greatest(t.max_capacity
        - (select count(*) from public.registrations r where r.ticket_type_id = t.id)
        - (select count(*) from public.registration_reservations q
          where q.ticket_type_id = t.id and q.status = 'pending' and q.expires_at > pg_catalog.now()), 0))
    ) order by t.created_at) from public.ticket_types t where t.event_id = e.id), '[]'::jsonb)
  ) from public.events e where p_code ~ '^[0-9a-f]{64}$' and e.public_code = p_code and e.status = 'published'
    and pg_catalog.now() < e.registration_closes_at;
$$;
revoke all on function public.get_public_event_registration(text) from public;
grant execute on function public.get_public_event_registration(text) to anon, authenticated;

create or replace function public.get_public_event_list()
returns table (
  id uuid, title text, description text, event_date timestamptz, venue text,
  status public.event_status, max_capacity integer, remaining_capacity integer,
  time_zone text, registration_closes_at timestamptz, public_code text
) language sql stable security definer set search_path = '' as $$
  select e.id, e.title, e.description, e.event_date, e.venue, e.status, e.max_capacity,
    least(greatest(e.max_capacity - public.capacity_consumption(e.id), 0), (select coalesce(sum(greatest(t.max_capacity
      - (select count(*) from public.registrations r where r.ticket_type_id = t.id)
      - (select count(*) from public.registration_reservations q
        where q.ticket_type_id = t.id and q.status = 'pending' and q.expires_at > pg_catalog.now()), 0)), 0)::integer
      from public.ticket_types t where t.event_id = e.id))::integer,
    e.time_zone, e.registration_closes_at, e.public_code
  from public.events e where e.status = 'published' order by e.event_date;
$$;
revoke all on function public.get_public_event_list() from public;
grant execute on function public.get_public_event_list() to anon, authenticated;

