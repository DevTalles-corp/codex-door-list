-- Synthetic upgrade fixture, applied only in the disposable cover project.
-- Existing buckets with stale settings must not block the upgrade.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-cover-uploads', 'event-cover-uploads', true, 1024, array['image/png']),
  ('event-covers', 'event-covers', false, 1024, array['application/octet-stream']);
insert into auth.users (id, email) values ('71000000-0000-4000-8000-000000000001', 'cover-upgrade@example.test');
insert into public.events (id, created_by, title, venue, event_date, max_capacity, time_zone, registration_closes_at, entry_opens_at, entry_closes_at)
values ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'Existing cover upgrade Event', 'Test venue', now(), 10, 'UTC', now()+interval '1 day', now()-interval '1 hour', now()+interval '1 day');
insert into public.ticket_types (event_id, name, max_capacity) values ('72000000-0000-4000-8000-000000000001', 'General', 10);
update public.events set status='published' where id='72000000-0000-4000-8000-000000000001';
