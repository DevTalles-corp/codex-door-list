grant select on public.tickets to authenticated;

create policy "Owners can read tickets for their events"
on public.tickets
for select
to authenticated
using (
  exists (
    select 1
    from public.registrations
    join public.events
      on events.id = registrations.event_id
    where registrations.id = tickets.registration_id
      and events.created_by = (select auth.uid())
  )
);
