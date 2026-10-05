update public.events e set status = 'draft'
where e.status = 'published' and not exists (
  select 1 from public.ticket_types t where t.event_id = e.id and t.max_capacity > 0
);

create function public.check_published_event_ticket_type()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_id_to_check uuid; event_status_to_check public.event_status;
begin
  if tg_table_name = 'events' then
    event_id_to_check := new.id;
  else
    event_id_to_check := old.event_id;
  end if;
  select e.status into event_status_to_check from public.events e
    where e.id = event_id_to_check for update;
  if not found then return null; end if;
  if event_status_to_check = 'published' and not exists (
    select 1 from public.ticket_types t
    where t.event_id = event_id_to_check and t.max_capacity > 0
  ) then
    raise exception 'published event requires a ticket type' using errcode = '23514',
      detail = '{"kind":"publicationRequiresTicketType","version":1}';
  end if;
  return null;
end;
$$;
revoke all on function public.check_published_event_ticket_type() from public, anon, authenticated;
create constraint trigger events_require_ticket_type
  after insert or update of status on public.events
  deferrable initially immediate
  for each row execute function public.check_published_event_ticket_type();
create constraint trigger ticket_types_preserve_published_event
  after delete or update of event_id on public.ticket_types
  deferrable initially immediate
  for each row execute function public.check_published_event_ticket_type();
