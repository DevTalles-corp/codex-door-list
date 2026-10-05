alter table public.events
  add column time_zone text not null default 'America/La_Paz',
  add column registration_closes_at timestamptz,
  add column entry_opens_at timestamptz,
  add column entry_closes_at timestamptz;

update public.events
set entry_opens_at = ((event_date at time zone 'America/La_Paz')::date::timestamp at time zone 'America/La_Paz'),
    entry_closes_at = (((event_date at time zone 'America/La_Paz')::date + 1)::timestamp at time zone 'America/La_Paz'),
    registration_closes_at = (((event_date at time zone 'America/La_Paz')::date + 1)::timestamp at time zone 'America/La_Paz');

alter table public.events
  alter column registration_closes_at set not null,
  alter column entry_opens_at set not null,
  alter column entry_closes_at set not null,
  add constraint events_entry_window_check check (entry_opens_at < entry_closes_at);

create function public.validate_event_time_zone()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'invalid event time zone' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_event_time_zone() from public, anon, authenticated;
create trigger events_validate_time_zone before insert or update of time_zone on public.events
  for each row execute function public.validate_event_time_zone();

create or replace function public.get_public_event_registration(p_event_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', event_row.id, 'title', event_row.title,
      'description', event_row.description, 'event_date', event_row.event_date,
      'venue', event_row.venue, 'time_zone', event_row.time_zone,
      'registration_closes_at', event_row.registration_closes_at
    ),
    'ticket_types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ticket_type.id, 'name', ticket_type.name,
        'max_capacity', ticket_type.max_capacity,
        'remaining_capacity', greatest(ticket_type.max_capacity - (
          select count(*) from public.registrations r where r.ticket_type_id = ticket_type.id
        ), 0)
      ) order by ticket_type.created_at)
      from public.ticket_types ticket_type where ticket_type.event_id = event_row.id
    ), '[]'::jsonb)
  )
  from public.events event_row
  where event_row.id = p_event_id and event_row.status = 'published'
    and pg_catalog.now() < event_row.registration_closes_at;
$$;

drop function public.get_public_event_list();
create function public.get_public_event_list()
returns table (
  id uuid, title text, description text, event_date timestamptz, venue text,
  status public.event_status, max_capacity integer, remaining_capacity integer,
  time_zone text, registration_closes_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select e.id, e.title, e.description, e.event_date, e.venue, e.status,
    e.max_capacity,
    (select coalesce(sum(greatest(t.max_capacity - (
      select count(*) from public.registrations r where r.ticket_type_id = t.id
    ), 0)), 0)::integer from public.ticket_types t where t.event_id = e.id),
    e.time_zone, e.registration_closes_at
  from public.events e where e.status = 'published'
  order by e.event_date;
$$;
revoke all on function public.get_public_event_list() from public;
grant execute on function public.get_public_event_list() to anon, authenticated;

create or replace function public.check_in_ticket(p_event_id uuid, p_code text)
returns table (status text, attendee_name text, ticket_type_name text)
language plpgsql security definer set search_path = '' as $$
declare ticket_row record;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.events e where e.id = p_event_id and e.created_by = (select auth.uid())
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
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
    or pg_catalog.now() < ticket_row.entry_opens_at
    or pg_catalog.now() >= ticket_row.entry_closes_at then
    return query select 'not_found'::text, null::text, null::text; return;
  end if;
  if ticket_row.status = 'used' then
    return query select 'used'::text, ticket_row.attendee_name::text, ticket_row.type_name::text; return;
  end if;
  update public.tickets set status = 'used', checked_in_at = pg_catalog.now() where id = ticket_row.id;
  return query select 'valid'::text, ticket_row.attendee_name::text, ticket_row.type_name::text;
end;
$$;
