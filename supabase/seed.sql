-- Development fixtures only. Run after migrations; no schema changes here.
-- Stable IDs and conflict handling make reapplication safe without deleting data.
begin;

-- Placeholder owner for the public examples; this user has no login credentials.
insert into auth.users (id, email, raw_user_meta_data)
values (
  'd0010000-0000-4000-8000-000000000001',
  'organizer@door-list.example',
  '{"name":"Organización de ejemplo"}'::jsonb
)
on conflict (id) do nothing;

do $$
declare
  seed_owner constant uuid := 'd0010000-0000-4000-8000-000000000001';
  seed_time_zone constant text := 'America/La_Paz';
  local_now timestamp := current_timestamp at time zone seed_time_zone;
  week_end timestamptz := (date_trunc('week', local_now) + interval '1 week') at time zone seed_time_zone;
  month_end timestamptz := (date_trunc('month', local_now) + interval '1 month') at time zone seed_time_zone;
  event_dates timestamptz[] := array[
    current_timestamp + (week_end - current_timestamp) * 0.35,
    current_timestamp + (week_end - current_timestamp) * 0.75,
    current_timestamp + (month_end - current_timestamp) * 0.55,
    current_timestamp + (month_end - current_timestamp) * 0.85,
    (date_trunc('month', local_now) + interval '1 month 10 days 19 hours') at time zone seed_time_zone,
    (date_trunc('month', local_now) + interval '2 months 18 days 11 hours') at time zone seed_time_zone,
    current_timestamp + (week_end - current_timestamp) * 0.55
  ];
  fixture record;
  seed_event_id uuid;
  inserted_event_id uuid;
  seed_general_type_id uuid;
  seed_special_type_id uuid;
begin
  for fixture in select * from (values
    (1, 'Jazz en la ciudad',
      'Una noche de jazz en vivo con músicos locales. Disfruta de un repertorio de clásicos y composiciones propias en un ambiente íntimo.',
      'Teatro Nuna · Zona Sur, La Paz', 60, 'Primera fila', 3,
      '8d1e42291a2b980e74a5b19558f976b1c2cf8dd7f37df7072a255dc60383aa25', 39130,
      'Ilustración de notas musicales en tonos azul y naranja'),
    (2, 'Encuentro de tecnología y comunidad',
      'Charlas cortas, demostraciones y conversaciones para quienes construyen productos digitales. Ven a compartir ideas y conocer a la comunidad.',
      'Centro de Innovación · Sopocachi, La Paz', 100, 'Taller práctico', 20,
      '72d2ed395894c8e2c7aaa6bae538311912261f6cab1eb77f746b680ea976f2f4', 49410,
      'Ilustración geométrica de un encuentro de tecnología en verde y coral'),
    (3, 'Taller de cocina boliviana',
      'Aprende a preparar sabores tradicionales con ingredientes de temporada. Incluye materiales, una degustación y recetas para llevar a casa.',
      'Cocina Abierta · San Miguel, La Paz', 18, 'Mesa de degustación', 6,
      'e330b7c32e091edd77adaa55a76325db80a64863a397bf784de1c2a5dd0a871f', 43258,
      'Ilustración de un plato caliente para el taller de cocina boliviana'),
    (4, 'Senderos de los Andes',
      'Una caminata guiada para descubrir paisajes andinos y compartir una mañana al aire libre. Lleva agua, abrigo y calzado cómodo.',
      'Punto de encuentro · Plaza Abaroa, La Paz', 30, 'Caminata con transporte', 10,
      'ade125e3fe1d45f18a367e133e14b5679f59d049f8c462f4f7aad3e94901971d', 46390,
      'Ilustración de montañas andinas bajo un sol amarillo'),
    (5, 'Historias en pantalla: cine y conversación',
      'Proyección de cortometrajes bolivianos seguida de una conversación con sus realizadores. Una invitación a mirar y conversar sobre nuestras historias.',
      'Cinemateca · Centro, La Paz', 80, 'Cine y conversatorio', 20,
      'df71dfbea66b81771acaebce6a517dd013ea149b9a49dea88491f6d472ef49b2', 40282,
      'Ilustración de una pantalla de cine sobre fondo azul'),
    (6, 'Feria de creadores locales',
      'Diseño, ilustración, cerámica y música en una jornada dedicada al talento local. Conoce a los creadores y participa en demostraciones abiertas.',
      'Patio Cultural · Miraflores, La Paz', 160, 'Demostración de cerámica', 15,
      '3d603c05d17293a6ca8984f96feaa2290345fb50c3f924fcbc6c80e94de46200', 37287,
      'Ilustración de un puesto de feria en tonos terracota y ocre'),
    (7, 'Sesión acústica íntima',
      'Un encuentro cercano con canciones de autor y guitarra acústica. Las cinco plazas de esta sesión ya están reservadas.',
      'Sala Acústica · Sopocachi, La Paz', 3, 'Primera fila', 2,
      '032b3ff14b7fb744f6ad2c7622219053fcc35ea45250d02693b98ca38a6965c7', 59793,
      'Ilustración de una guitarra acústica sobre fondo verde oscuro')
  ) as fixtures(sequence, title, description, venue, general_capacity, special_name, special_capacity, cover_hash, cover_bytes, cover_alt)
  loop
    seed_event_id := ('d0020000-0000-4000-8000-' || lpad(fixture.sequence::text, 12, '0'))::uuid;
    seed_general_type_id := ('d0030000-0000-4000-8000-' || lpad((fixture.sequence * 10 + 1)::text, 12, '0'))::uuid;
    seed_special_type_id := ('d0030000-0000-4000-8000-' || lpad((fixture.sequence * 10 + 2)::text, 12, '0'))::uuid;

    -- Insert as draft: publication requires an existing TicketType.
    -- Existing fixtures keep their edits and original schedule on reapplication.
    insert into public.events (
      id, created_by, title, description, venue, status, max_capacity,
      event_date, time_zone, registration_closes_at, entry_opens_at, entry_closes_at
    ) values (
      seed_event_id, seed_owner, fixture.title, fixture.description, fixture.venue, 'draft',
      fixture.general_capacity + fixture.special_capacity, event_dates[fixture.sequence], seed_time_zone,
      event_dates[fixture.sequence], event_dates[fixture.sequence] - interval '1 hour',
      event_dates[fixture.sequence] + interval '4 hours'
    ) on conflict (id) do nothing
    returning id into inserted_event_id;

    insert into public.ticket_types (id, event_id, name, max_capacity) values
      (seed_general_type_id, seed_event_id, 'General', fixture.general_capacity),
      (seed_special_type_id, seed_event_id, fixture.special_name, fixture.special_capacity)
    on conflict do nothing;

    if inserted_event_id is not null then
      update public.events set status = 'published' where id = inserted_event_id;
    end if;

    -- The Event insert trigger initializes this row. Only fill a new cover;
    -- keep an organizer's replacement/removal and revision if the seed is rerun.
    update public.event_covers set
      revision = revision + 1,
      object_path = 'covers/' || fixture.cover_hash,
      media_type = 'image/png', byte_size = fixture.cover_bytes,
      width = 1200, height = 675, content_hash = fixture.cover_hash,
      alt_text = fixture.cover_alt
    where event_id = seed_event_id and object_path is null and revision = 0;
  end loop;
end;
$$;

-- Confirmed example Registrations: three exhaust the Jazz "Primera fila" type.
-- Five fill both TicketTypes and the entire capacity of "Sesión acústica íntima".
-- All addresses are reserved examples; inserting data does not send email.
insert into public.registrations (id, event_id, ticket_type_id, attendee_name, attendee_email)
select
  ('d0040000-0000-4000-8000-' || lpad(fixture.sequence::text, 12, '0'))::uuid,
  ('d0020000-0000-4000-8000-' || lpad(fixture.event_sequence::text, 12, '0'))::uuid,
  ('d0030000-0000-4000-8000-' || lpad(fixture.type_sequence::text, 12, '0'))::uuid,
  fixture.attendee_name, fixture.attendee_email
from (values
  (1, 1, 12, 'Ana Pérez', 'ana@door-list.example'),
  (2, 1, 12, 'Luis Mamani', 'luis@door-list.example'),
  (3, 1, 12, 'Carla Flores', 'carla@door-list.example'),
  (4, 1, 11, 'Diego Rojas', 'diego@door-list.example'),
  (5, 2, 21, 'Lucía Vargas', 'lucia@door-list.example'),
  (6, 2, 22, 'Mateo Quispe', 'mateo@door-list.example'),
  (7, 3, 31, 'Sofía Arce', 'sofia@door-list.example'),
  (8, 4, 42, 'Pablo Choque', 'pablo@door-list.example'),
  (9, 5, 51, 'Valeria Cruz', 'valeria@door-list.example'),
  (10, 6, 61, 'Andrés Salinas', 'andres@door-list.example'),
  (11, 7, 71, 'María Fernández', 'maria@door-list.example'),
  (12, 7, 71, 'Gabriel Soto', 'gabriel@door-list.example'),
  (13, 7, 71, 'Camila Mendoza', 'camila@door-list.example'),
  (14, 7, 72, 'Javier Medina', 'javier@door-list.example'),
  (15, 7, 72, 'Elena López', 'elena@door-list.example')
) as fixture(sequence, event_sequence, type_sequence, attendee_name, attendee_email)
on conflict do nothing;

-- A Registration and a Ticket are different entities: issue one valid Ticket
-- per seeded Registration and preserve its code/status when reapplied.
insert into public.tickets (registration_id)
select id from public.registrations
where id in (
  select ('d0040000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid
  from generate_series(1, 15) as sequence
)
on conflict (registration_id) do nothing;

commit;
