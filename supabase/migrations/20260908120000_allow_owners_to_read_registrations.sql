grant select on public.registrations to authenticated;

create policy "Owners can read registrations for their events"
on public.registrations
for select
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = registrations.event_id
      and events.created_by = (select auth.uid())
  )
);
