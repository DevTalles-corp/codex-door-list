-- Only copied to the isolated verification project; never to product migrations.
create extension if not exists pgtap with schema extensions;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000001', 'legacy-owner@example.test', now()),
  ('00000000-0000-4000-8000-000000000002', 'door-staff@example.test', now()),
  ('00000000-0000-4000-8000-000000000003', 'unverified@example.test', null);
insert into public.events (id, created_by, title, event_date, venue, max_capacity, status) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Legacy with tickets', '2026-10-06T02:00:00Z', 'Legacy venue', 4, 'published'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Legacy without types', '2026-10-07T12:00:00Z', 'Legacy venue', 2, 'published'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Legacy undersized type', '2026-10-07T12:00:00Z', 'Legacy venue', 4, 'published');
insert into public.ticket_types (id, event_id, name, max_capacity) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'General', 3),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'VIP', 1);
insert into public.registrations (id, event_id, ticket_type_id, attendee_name, attendee_email) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Legacy attendee', 'legacy-attendee@example.test'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'Legacy VIP 1', 'legacy-vip-1@example.test'),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'Legacy VIP 2', 'legacy-vip-2@example.test');
insert into public.tickets (registration_id, code, status) values
  ('30000000-0000-4000-8000-000000000001', repeat('a', 64), 'revoked'),
  ('30000000-0000-4000-8000-000000000003', repeat('c', 64), 'valid'),
  ('30000000-0000-4000-8000-000000000004', repeat('d', 64), 'used');

-- Historical import exceeding one type, leaving another type free but the Event full.
insert into public.events(id,created_by,title,event_date,venue,max_capacity,status)
values('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Legacy global bound','2026-10-07T12:00:00Z','Test',2,'published');
insert into public.ticket_types(id,event_id,name,max_capacity) values
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','General',1),
('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000004','VIP',1);
insert into public.registrations(event_id,ticket_type_id,attendee_name,attendee_email) values
('10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','Legacy 1','global-1@example.test'),
('10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','Legacy 2','global-2@example.test');
