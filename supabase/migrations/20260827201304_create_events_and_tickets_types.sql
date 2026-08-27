create type public.event_status as enum ('draft', 'published');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) > 0),
  description text,
  event_date timestamptz not null,
  venue text not null check (char_length(btrim(venue)) > 0),
  status public.event_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tickets_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  max_capacity integer not null check (max_capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, name)
);

create index events_created_by_idx on public.events (created_by);
create index events_status_event_date_idx on public.events (status, event_date);
create index tickets_types_event_id_idx on public.tickets_types (event_id);

create function public.set_events_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_events_updated_at();

create trigger tickets_types_set_updated_at
before update on public.tickets_types
for each row execute function public.set_events_updated_at();

alter table public.events enable row level security;
alter table public.tickets_types enable row level security;

grant select on public.events, public.tickets_types to anon, authenticated;
grant insert, update, delete on public.events, public.tickets_types to authenticated;

create policy "Published events are publicly readable"
on public.events
for select
to anon, authenticated
using (status = 'published');

create policy "Owners can read their events"
on public.events
for select
to authenticated
using ((select auth.uid()) = created_by);

create policy "Authenticated users can create their events"
on public.events
for insert
to authenticated
with check ((select auth.uid()) = created_by);

create policy "Owners can update their events"
on public.events
for update
to authenticated
using ((select auth.uid()) = created_by)
with check ((select auth.uid()) = created_by);

create policy "Owners can delete their events"
on public.events
for delete
to authenticated
using ((select auth.uid()) = created_by);

create policy "Ticket types of published events are publicly readable"
on public.tickets_types
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = tickets_types.event_id
      and events.status = 'published'
  )
);

create policy "Owners can read ticket types for their events"
on public.tickets_types
for select
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = tickets_types.event_id
      and events.created_by = (select auth.uid())
  )
);

create policy "Owners can create ticket types for their events"
on public.tickets_types
for insert
to authenticated
with check (
  exists (
    select 1
    from public.events
    where events.id = tickets_types.event_id
      and events.created_by = (select auth.uid())
  )
);

create policy "Owners can update ticket types for their events"
on public.tickets_types
for update
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = tickets_types.event_id
      and events.created_by = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.events
    where events.id = tickets_types.event_id
      and events.created_by = (select auth.uid())
  )
);

create policy "Owners can delete ticket types for their events"
on public.tickets_types
for delete
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = tickets_types.event_id
      and events.created_by = (select auth.uid())
  )
);
