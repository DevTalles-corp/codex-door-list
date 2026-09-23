alter table public.tickets
add column checked_in_at timestamptz;

create or replace function public.check_in_ticket(p_event_id uuid, p_code text)
returns table (status text, attendee_name text, ticket_type_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticket_row record;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.events as event
    where event.id = p_event_id
      and event.created_by = (select auth.uid())
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_code is null or p_code !~ '^[0-9a-f]{64}$' then
    return query select 'not_found'::text, null::text, null::text;
    return;
  end if;

  select ticket.id, ticket.status, registration.attendee_name,
    ticket_type.name as ticket_type_name, event.status as event_status,
    event.event_date
  into ticket_row
  from public.tickets as ticket
  join public.registrations as registration on registration.id = ticket.registration_id
  join public.ticket_types as ticket_type on ticket_type.id = registration.ticket_type_id
  join public.events as event on event.id = registration.event_id
  where ticket.code = p_code and event.id = p_event_id
  for update of ticket;

  if not found then
    return query select 'not_found'::text, null::text, null::text;
    return;
  end if;

  if ticket_row.status = 'revoked'
    or ticket_row.event_status <> 'published'
    or (ticket_row.event_date at time zone 'America/La_Paz')::date
      <> (pg_catalog.now() at time zone 'America/La_Paz')::date then
    return query select 'not_found'::text, null::text, null::text;
    return;
  end if;

  if ticket_row.status = 'used' then
    return query select 'used'::text, ticket_row.attendee_name::text,
      ticket_row.ticket_type_name::text;
    return;
  end if;

  update public.tickets
  set status = 'used', checked_in_at = pg_catalog.now()
  where id = ticket_row.id;

  return query select 'valid'::text, ticket_row.attendee_name::text,
    ticket_row.ticket_type_name::text;
end;
$$;

revoke all on function public.check_in_ticket(uuid, text) from public;
grant execute on function public.check_in_ticket(uuid, text) to authenticated;
