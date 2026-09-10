alter table public.events
add column published_at timestamptz;

update public.events
set published_at = created_at
where status = 'published';

create function public.set_event_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at = pg_catalog.now();
  end if;

  return new;
end;
$$;

create trigger events_set_published_at
before insert or update of status on public.events
for each row execute function public.set_event_published_at();
