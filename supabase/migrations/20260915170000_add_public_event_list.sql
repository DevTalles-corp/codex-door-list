create or replace function public.get_public_event_list()
returns table (
  id uuid,
  title text,
  description text,
  event_date timestamptz,
  venue text,
  status public.event_status,
  max_capacity integer,
  remaining_capacity integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    event_row.id,
    event_row.title,
    event_row.description,
    event_row.event_date,
    event_row.venue,
    event_row.status,
    event_row.max_capacity,
    coalesce(sum(greatest(ticket_type.max_capacity - registration_count.count, 0)), 0)::integer
  from public.events as event_row
  left join public.ticket_types as ticket_type
    on ticket_type.event_id = event_row.id
  left join lateral (
    select count(*)::integer as count
    from public.registrations
    where registrations.ticket_type_id = ticket_type.id
  ) as registration_count on true
  where event_row.status = 'published'
  group by event_row.id
  order by event_row.event_date;
$$;

grant execute on function public.get_public_event_list() to anon, authenticated;
