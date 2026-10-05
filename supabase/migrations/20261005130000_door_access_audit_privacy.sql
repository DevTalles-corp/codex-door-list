alter table public.events add column public_code text not null unique
  default encode(extensions.gen_random_bytes(32), 'hex') check (public_code ~ '^[0-9a-f]{64}$');

create function public.protect_event_public_code()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.public_code := encode(extensions.gen_random_bytes(32), 'hex');
  elsif new.public_code is distinct from old.public_code then
    raise exception 'public code is immutable' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_event_public_code() from public, anon, authenticated;
create trigger events_protect_public_code before insert or update of public_code on public.events
  for each row execute function public.protect_event_public_code();

drop function public.get_public_event_registration(uuid);
create function public.get_public_event_registration(p_code text)
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
  ) from public.events e where p_code ~ '^[0-9a-f]{64}$' and e.public_code = p_code and e.status = 'published'
    and pg_catalog.now() < e.registration_closes_at;
$$;
revoke all on function public.get_public_event_registration(text) from public;
grant execute on function public.get_public_event_registration(text) to anon, authenticated;

drop function public.get_public_event_list();
create function public.get_public_event_list()
returns table (
  id uuid, title text, description text, event_date timestamptz, venue text,
  status public.event_status, max_capacity integer, remaining_capacity integer,
  time_zone text, registration_closes_at timestamptz, public_code text
) language sql stable security definer set search_path = '' as $$
  select e.id, e.title, e.description, e.event_date, e.venue, e.status, e.max_capacity,
    (select coalesce(sum(greatest(t.max_capacity
      - (select count(*) from public.registrations r where r.ticket_type_id = t.id)
      - (select count(*) from public.registration_reservations q
        where q.ticket_type_id = t.id and q.status = 'pending' and q.expires_at > pg_catalog.now()), 0)), 0)::integer
      from public.ticket_types t where t.event_id = e.id),
    e.time_zone, e.registration_closes_at, e.public_code
  from public.events e where e.status = 'published' order by e.event_date;
$$;
revoke all on function public.get_public_event_list() from public;
grant execute on function public.get_public_event_list() to anon, authenticated;

create table public.event_door_staff (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_door_staff_user_idx on public.event_door_staff(user_id);
alter table public.event_door_staff enable row level security;
revoke all on public.event_door_staff from anon, authenticated;
grant select on public.event_door_staff to authenticated;
create policy "Owners and staff read door grants" on public.event_door_staff
  for select to authenticated using (
    user_id = (select auth.uid()) or exists (
      select 1 from public.events e where e.id = event_id and e.created_by = (select auth.uid())
    )
  );

create function public.manage_door_staff(p_event_id uuid, p_email text, p_assign boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare target_id uuid; normalized_email text := lower(btrim(p_email));
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.events e where e.id = p_event_id and e.created_by = (select auth.uid())
  ) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_assign is null or normalized_email is null or normalized_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid email' using errcode = '22023'; end if;
  select u.id into target_id from auth.users u
    where lower(btrim(u.email)) = normalized_email and u.email_confirmed_at is not null;
  if not found then return 'account_unavailable'; end if;
  if p_assign then
    insert into public.event_door_staff(event_id, user_id) values(p_event_id, target_id)
      on conflict do nothing;
  else
    delete from public.event_door_staff where event_id = p_event_id and user_id = target_id;
  end if;
  return 'success';
end;
$$;
revoke all on function public.manage_door_staff(uuid, text, boolean) from public, anon;
grant execute on function public.manage_door_staff(uuid, text, boolean) to authenticated;

create function public.list_door_staff(p_event_id uuid)
returns table (email text) language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.events e where e.id = p_event_id and e.created_by = (select auth.uid())
  ) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select u.email::text from public.event_door_staff s
    join auth.users u on u.id = s.user_id
    where s.event_id = p_event_id order by u.email;
end;
$$;
revoke all on function public.list_door_staff(uuid) from public, anon;
grant execute on function public.list_door_staff(uuid) to authenticated;

create function public.get_door_events()
returns table(id uuid, title text, event_date timestamptz, status public.event_status,
  time_zone text, entry_opens_at timestamptz, entry_closes_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.id, e.title, e.event_date, e.status, e.time_zone, e.entry_opens_at, e.entry_closes_at
  from public.events e where e.status = 'published' and (
    e.created_by = (select auth.uid()) or exists (
      select 1 from public.event_door_staff s where s.event_id = e.id and s.user_id = (select auth.uid())
    )
  ) order by e.entry_opens_at;
$$;
revoke all on function public.get_door_events() from public, anon;
grant execute on function public.get_door_events() to authenticated;

create function public.search_door_ticket(p_event_id uuid, p_email text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.events e where e.id = p_event_id and (
      e.created_by = (select auth.uid()) or exists (
        select 1 from public.event_door_staff s where s.event_id = e.id and s.user_id = (select auth.uid())
      )
    )
  ) then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object('attendeeName', r.attendee_name,
    'attendeeEmail', r.attendee_email, 'ticketTypeName', tt.name,
    'ticketCode', t.code, 'ticketStatus', t.status)
  into result from public.registrations r
  join public.tickets t on t.registration_id = r.id
  join public.ticket_types tt on tt.id = r.ticket_type_id
  where r.event_id = p_event_id and lower(btrim(r.attendee_email)) = lower(btrim(p_email))
    and t.status in ('valid', 'used');
  return result;
end;
$$;
revoke all on function public.search_door_ticket(uuid, text) from public, anon;
grant execute on function public.search_door_ticket(uuid, text) to authenticated;

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

create or replace function public.get_public_ticket(p_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'code', t.code, 'status', t.status, 'issued_at', t.created_at,
    'event', jsonb_build_object('title', e.title, 'event_date', e.event_date,
      'venue', e.venue, 'time_zone', e.time_zone),
    'ticket_type', jsonb_build_object('name', tt.name)
  ) from public.tickets t
  join public.registrations r on r.id = t.registration_id
  join public.events e on e.id = r.event_id
  join public.ticket_types tt on tt.id = r.ticket_type_id
  where p_code ~ '^[0-9a-f]{64}$' and t.code = p_code;
$$;

alter table public.tickets add column revoked_at timestamptz;
create function public.set_ticket_revoked_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'revoked' and old.status is distinct from 'revoked' then
    new.revoked_at := pg_catalog.now();
  end if;
  return new;
end;
$$;
revoke all on function public.set_ticket_revoked_at() from public, anon, authenticated;
create trigger tickets_set_revoked_at before update of status on public.tickets
  for each row execute function public.set_ticket_revoked_at();

create function public.preserve_issued_ticket_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare has_tickets boolean;
begin
  if tg_table_name = 'events' then
    select exists (select 1 from public.registrations r join public.tickets t on t.registration_id = r.id
      where r.event_id = old.id) into has_tickets;
  else
    select exists (select 1 from public.registrations r join public.tickets t on t.registration_id = r.id
      where r.ticket_type_id = old.id) into has_tickets;
  end if;
  if has_tickets then
    raise exception 'issued tickets must be retained for audit' using errcode = '23503',
      detail = '{"kind":"issuedTicketAudit","version":1}';
  end if;
  return old;
end;
$$;
revoke all on function public.preserve_issued_ticket_audit() from public, anon, authenticated;
create trigger events_preserve_ticket_audit before delete on public.events
  for each row execute function public.preserve_issued_ticket_audit();
create trigger ticket_types_preserve_ticket_audit before delete on public.ticket_types
  for each row execute function public.preserve_issued_ticket_audit();
