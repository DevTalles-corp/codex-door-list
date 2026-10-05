-- Historical import into the original schema, only in an isolated test installation.
-- Temporarily remove only the original assignment guards, before specs 002–005
-- exist, then restore their exact definitions. Product migrations are untouched.
create extension if not exists pgtap with schema extensions;
insert into auth.users(id,email,email_confirmed_at) values ('61000000-0000-4000-8000-000000000001','capacity-legacy@example.test',now());
drop trigger events_validate_capacity on public.events;
drop trigger ticket_types_validate_capacity on public.ticket_types;
insert into public.events(id,created_by,title,event_date,venue,max_capacity,status) values('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','Legacy US1',now(),'Test',4,'published');
insert into public.ticket_types(id,event_id,name,max_capacity) values('63000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','VIP',1);
insert into public.registrations(id,event_id,ticket_type_id,attendee_name,attendee_email) values('64000000-0000-4000-8000-000000000100','62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','Legacy 0','legacy-1-0@example.test');
insert into public.tickets(registration_id,status) values('64000000-0000-4000-8000-000000000100','valid');
insert into public.registrations(id,event_id,ticket_type_id,attendee_name,attendee_email) values('64000000-0000-4000-8000-000000000101','62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','Legacy 1','legacy-1-1@example.test');
insert into public.tickets(registration_id,status) values('64000000-0000-4000-8000-000000000101','used');
insert into public.events(id,created_by,title,event_date,venue,max_capacity,status) values('62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','Legacy US2',now(),'Test',2,'published');
insert into public.ticket_types(id,event_id,name,max_capacity) values('63000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000002','VIP',3);
insert into public.registrations(id,event_id,ticket_type_id,attendee_name,attendee_email) values('64000000-0000-4000-8000-000000000200','62000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000002','Legacy 0','legacy-2-0@example.test');
insert into public.tickets(registration_id,status) values('64000000-0000-4000-8000-000000000200','valid');
insert into public.registrations(id,event_id,ticket_type_id,attendee_name,attendee_email) values('64000000-0000-4000-8000-000000000201','62000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000002','Legacy 1','legacy-2-1@example.test');
insert into public.tickets(registration_id,status) values('64000000-0000-4000-8000-000000000201','used');
insert into public.registrations(id,event_id,ticket_type_id,attendee_name,attendee_email) values('64000000-0000-4000-8000-000000000202','62000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000002','Legacy 2','legacy-2-2@example.test');
insert into public.tickets(registration_id,status) values('64000000-0000-4000-8000-000000000202','revoked');
insert into public.events(id,created_by,title,event_date,venue,max_capacity,status) values('62000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000001','Legacy US3',now(),'Test',3,'published');
insert into public.ticket_types(id,event_id,name,max_capacity) values('63000000-0000-4000-8000-000000000003','62000000-0000-4000-8000-000000000003','VIP',10);
insert into public.registrations(id,event_id,ticket_type_id,attendee_name,attendee_email) values('64000000-0000-4000-8000-000000000300','62000000-0000-4000-8000-000000000003','63000000-0000-4000-8000-000000000003','Legacy 0','legacy-3-0@example.test');
insert into public.tickets(registration_id,status) values('64000000-0000-4000-8000-000000000300','valid');
insert into public.registrations(id,event_id,ticket_type_id,attendee_name,attendee_email) values('64000000-0000-4000-8000-000000000301','62000000-0000-4000-8000-000000000003','63000000-0000-4000-8000-000000000003','Legacy 1','legacy-3-1@example.test');
insert into public.tickets(registration_id,status) values('64000000-0000-4000-8000-000000000301','used');
create trigger events_validate_capacity before update of max_capacity on public.events for each row execute function public.validate_event_capacity();
create trigger ticket_types_validate_capacity before insert or update of event_id,max_capacity on public.ticket_types for each row execute function public.validate_ticket_type_capacity();
