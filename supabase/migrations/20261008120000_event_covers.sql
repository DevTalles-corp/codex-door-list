-- Cover storage is separate from owner-editable Event configuration.
create table public.event_covers (
  event_id uuid primary key references public.events(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  object_path text unique check (object_path ~ '^covers/[0-9a-f]{64}$'),
  media_type text check (media_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer check (byte_size between 1 and 5242880),
  width integer check (width >= 640),
  height integer check (height >= 360),
  content_hash text check (content_hash ~ '^[0-9a-f]{64}$'),
  alt_text text check (alt_text is null or (alt_text = btrim(alt_text) and alt_text <> '')),
  position_x double precision not null default 0.5 check (position_x between 0 and 1),
  position_y double precision not null default 0.5 check (position_y between 0 and 1),
  updated_at timestamptz not null default clock_timestamp(),
  constraint event_covers_coherent check (
    (object_path is null and media_type is null and byte_size is null and width is null and height is null
      and content_hash is null and alt_text is null and position_x=0.5 and position_y=0.5)
    or (object_path is not null and media_type is not null and byte_size is not null and width is not null
      and height is not null and content_hash is not null)
  )
);
alter table public.event_covers enable row level security;
revoke all on public.event_covers from public, anon, authenticated;
grant select on public.event_covers to authenticated;
grant all on public.event_covers to service_role;
create policy "Owners read event covers" on public.event_covers for select to authenticated
using (exists (select 1 from public.events e where e.id=event_id and e.created_by=(select auth.uid())));

insert into public.event_covers(event_id) select id from public.events;
create function public.initialize_event_cover() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.event_covers(event_id) values(new.id);
  return new;
end;
$$;
revoke all on function public.initialize_event_cover() from public, anon, authenticated;
create trigger events_initialize_cover after insert on public.events
for each row execute function public.initialize_event_cover();

create table public.event_cover_operations (
  operation_id text primary key check (operation_id ~ '^[0-9a-f]{64}$'),
  event_id uuid references public.events(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('upload','metadata','remove')),
  expected_revision bigint not null check (expected_revision >= 0),
  request_fingerprint text check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  staging_path text unique check (staging_path ~ '^uploads/[0-9a-f]{64}$'),
  upload_expires_at timestamptz,
  state text not null default 'pending' check (state in ('pending','processing','prepared','committed','rejected','conflict','expired')),
  lease_token text check (lease_token ~ '^[0-9a-f]{64}$'),
  lease_until timestamptz,
  processing_deadline_at timestamptz,
  candidate_path text unique check (candidate_path ~ '^covers/[0-9a-f]{64}$'),
  validated_metadata jsonb,
  requested_metadata jsonb,
  result_revision bigint check (result_revision >= 0),
  result_snapshot jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index event_cover_operations_event_idx on public.event_cover_operations(event_id, created_at);
create index event_cover_operations_lease_idx on public.event_cover_operations(state, lease_until);
create index event_cover_operations_expiration_idx on public.event_cover_operations(state, upload_expires_at);
alter table public.event_cover_operations enable row level security;
revoke all on public.event_cover_operations from public, anon, authenticated;
grant all on public.event_cover_operations to service_role;

create table public.event_cover_cleanup_jobs (
  id bigint generated always as identity primary key,
  operation_id text references public.event_cover_operations(operation_id) on delete set null,
  bucket_id text not null check (bucket_id in ('event-cover-uploads','event-covers')),
  object_path text not null,
  due_at timestamptz not null,
  next_attempt_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending','processing','done')),
  attempts integer not null default 0 check (attempts >= 0),
  lease_token text check (lease_token ~ '^[0-9a-f]{64}$'),
  lease_until timestamptz,
  last_error_code text check (last_error_code ~ '^[a-z_]+$'),
  transfer_uncertain boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (bucket_id, object_path),
  constraint event_cover_cleanup_path check (
    (bucket_id='event-cover-uploads' and object_path ~ '^uploads/[0-9a-f]{64}$')
    or (bucket_id='event-covers' and object_path ~ '^covers/[0-9a-f]{64}$')
  )
);
create index event_cover_cleanup_due_idx on public.event_cover_cleanup_jobs(state, next_attempt_at);
alter table public.event_cover_cleanup_jobs enable row level security;
revoke all on public.event_cover_cleanup_jobs from public, anon, authenticated;
grant all on public.event_cover_cleanup_jobs to service_role;
grant usage, select on sequence public.event_cover_cleanup_jobs_id_seq to service_role;

-- Reconcile buckets that may already have been provisioned before this migration.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('event-cover-uploads','event-cover-uploads',false,5242880,array['application/octet-stream']),
  ('event-covers','event-covers',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
-- No browser policies: signed uploads grant access to one private staging key only.

create function public.lock_event_cover(p_event_id uuid, p_actor_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  select created_by into v_owner from public.events where id=p_event_id;
  if not found then raise exception using errcode='P0002', message='cover_not_found'; end if;
  if v_owner is distinct from p_actor_id then raise exception using errcode='42501', message='cover_forbidden'; end if;
  select created_by into v_owner from public.events where id=p_event_id for update;
  if not found then raise exception using errcode='P0002', message='cover_not_found'; end if;
  if v_owner is distinct from p_actor_id then raise exception using errcode='42501', message='cover_forbidden'; end if;
  perform 1 from public.event_covers where event_id=p_event_id for update;
end;
$$;

create function public.validate_event_cover_config(p_config jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  foreach v_key in array array['decodeConcurrency','decodeTimeoutMs','storageRequestTimeoutMs','processingTimeoutMs','processingLeaseMs','cleanupTransferMarginMs'] loop
    if jsonb_typeof(p_config->v_key) is distinct from 'number'
      or (p_config->>v_key)::numeric <> trunc((p_config->>v_key)::numeric)
      or (p_config->>v_key)::numeric <= 0 or (p_config->>v_key)::numeric > 9007199254740991 then
      raise exception using errcode='22023', message='cover_invalid_config';
    end if;
  end loop;
  if (p_config->>'processingTimeoutMs')::numeric < greatest((p_config->>'decodeTimeoutMs')::numeric,(p_config->>'storageRequestTimeoutMs')::numeric)
    or (p_config->>'processingLeaseMs')::numeric <= (p_config->>'processingTimeoutMs')::numeric
    or (p_config->>'cleanupTransferMarginMs')::numeric < 300000 then
    raise exception using errcode='22023', message='cover_invalid_config';
  end if;
end;
$$;

create function public.check_event_cover_fence(p_operation public.event_cover_operations, p_lease_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_lease_token is null or p_operation.lease_token is null or p_operation.lease_until is null
    or p_operation.processing_deadline_at is null
    or p_operation.lease_token is distinct from p_lease_token or p_operation.lease_until <= clock_timestamp()
    or p_operation.processing_deadline_at <= clock_timestamp()
    or p_operation.state not in ('processing','prepared') then
    raise exception using errcode='40001', message='cover_lease_lost';
  end if;
end;
$$;

revoke all on function public.lock_event_cover(uuid,uuid), public.validate_event_cover_config(jsonb),
  public.check_event_cover_fence(public.event_cover_operations,text) from public, anon, authenticated;
grant execute on function public.lock_event_cover(uuid,uuid), public.validate_event_cover_config(jsonb),
  public.check_event_cover_fence(public.event_cover_operations,text) to service_role;

create function public.event_cover_projection(p_event_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when object_path is null then null else jsonb_build_object(
    'objectPath',object_path,'width',width,'height',height,'altText',alt_text,
    'positionX',position_x,'positionY',position_y) end
  from public.event_covers where event_id=p_event_id;
$$;

create function public.event_cover_snapshot(p_event_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('eventId',p_event_id,'revision',coalesce((select revision::text from public.event_covers where event_id=p_event_id),'0'),
    'cover',public.event_cover_projection(p_event_id));
$$;

create function public.get_event_cover_state(p_event_id uuid, p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_event_cover(p_event_id,p_actor_id);
  return public.event_cover_snapshot(p_event_id);
end;
$$;

create function public.enqueue_event_cover_cleanup(p_operation_id text,p_bucket_id text,p_object_path text,p_due_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_object_path is null then return; end if;
  insert into public.event_cover_cleanup_jobs(operation_id,bucket_id,object_path,due_at,next_attempt_at)
  values(p_operation_id,p_bucket_id,p_object_path,p_due_at,p_due_at)
  on conflict (bucket_id,object_path) do update set
    due_at=greatest(public.event_cover_cleanup_jobs.due_at,excluded.due_at),
    next_attempt_at=greatest(public.event_cover_cleanup_jobs.next_attempt_at,excluded.due_at);
end;
$$;

create function public.prepare_event_cover_upload(p_event_id uuid,p_actor_id uuid,p_operation_id text,
  p_expected_revision bigint,p_staging_path text,p_config jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_expires timestamptz;
begin
  perform public.validate_event_cover_config(p_config);
  -- Conservative expiry covers a signing request whose response is lost.
  v_expires:=clock_timestamp()+interval '2 hours'+(p_config->>'storageRequestTimeoutMs')::double precision*interval '1 millisecond';
  perform public.lock_event_cover(p_event_id,p_actor_id);
  if (select revision from public.event_covers where event_id=p_event_id) <> p_expected_revision then
    raise exception using errcode='40001',message='cover_conflict';
  end if;
  insert into public.event_cover_operations(operation_id,event_id,actor_id,kind,expected_revision,staging_path,upload_expires_at)
  values(p_operation_id,p_event_id,p_actor_id,'upload',p_expected_revision,p_staging_path,v_expires);
  perform public.enqueue_event_cover_cleanup(p_operation_id,'event-cover-uploads',p_staging_path,
    v_expires+(p_config->>'cleanupTransferMarginMs')::double precision*interval '1 millisecond');
  return jsonb_build_object('operationId',p_operation_id,'expiresAt',v_expires);
end;
$$;

create function public.record_event_cover_upload_expiry(p_event_id uuid,p_actor_id uuid,p_operation_id text,p_expires_at timestamptz,p_config jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_path text;
begin
  perform public.validate_event_cover_config(p_config);
  perform public.lock_event_cover(p_event_id,p_actor_id);
  update public.event_cover_operations set upload_expires_at=p_expires_at
    where operation_id=p_operation_id and actor_id=p_actor_id and event_id=p_event_id and state='pending'
    returning staging_path into v_path;
  if not found then raise exception using errcode='P0002',message='cover_not_found'; end if;
  perform public.enqueue_event_cover_cleanup(p_operation_id,'event-cover-uploads',v_path,
    p_expires_at+(p_config->>'cleanupTransferMarginMs')::double precision*interval '1 millisecond');
end;
$$;
revoke all on function public.record_event_cover_upload_expiry(uuid,uuid,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.record_event_cover_upload_expiry(uuid,uuid,text,timestamptz,jsonb) to service_role;

create function public.claim_event_cover_upload(p_event_id uuid,p_actor_id uuid,p_operation_id text,
  p_expected_revision bigint,p_fingerprint text,p_metadata jsonb,p_lease_token text,p_candidate_path text,p_config jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_operation public.event_cover_operations; v_now timestamptz:=clock_timestamp();
begin
  perform public.validate_event_cover_config(p_config);
  perform public.lock_event_cover(p_event_id,p_actor_id);
  select * into v_operation from public.event_cover_operations where operation_id=p_operation_id for update;
  if not found or v_operation.event_id is distinct from p_event_id or v_operation.actor_id is distinct from p_actor_id
    or v_operation.kind <> 'upload' then raise exception using errcode='P0002',message='cover_not_found'; end if;
  if v_operation.expected_revision <> p_expected_revision or (v_operation.request_fingerprint is not null and v_operation.request_fingerprint <> p_fingerprint) then
    raise exception using errcode='40001',message='cover_payload_conflict';
  end if;
  if v_operation.state='committed' then return jsonb_build_object('status','committed','result',v_operation.result_snapshot); end if;
  if v_operation.state in ('rejected','conflict','expired') then return jsonb_build_object('status',v_operation.state); end if;
  if v_operation.upload_expires_at <= v_now then
    update public.event_cover_operations set state='expired',lease_token=null,updated_at=v_now where operation_id=p_operation_id;
    return jsonb_build_object('status','expired');
  end if;
  if (select revision from public.event_covers where event_id=p_event_id) <> p_expected_revision then
    update public.event_cover_operations set state='conflict',lease_token=null,updated_at=v_now where operation_id=p_operation_id;
    return jsonb_build_object('status','conflict');
  end if;
  if v_operation.state in ('processing','prepared') and v_operation.lease_until > v_now then
    return jsonb_build_object('status','processing');
  end if;
  update public.event_cover_operations set state='processing',request_fingerprint=p_fingerprint,
    requested_metadata=p_metadata,lease_token=p_lease_token,
    lease_until=v_now+(p_config->>'processingLeaseMs')::double precision*interval '1 millisecond',
    processing_deadline_at=v_now+(p_config->>'processingTimeoutMs')::double precision*interval '1 millisecond',
    candidate_path=p_candidate_path,validated_metadata=null,updated_at=v_now
  where operation_id=p_operation_id returning * into v_operation;
  -- Every attempt's independent candidate is registered BEFORE external publication.
  -- Previous attempt jobs keep their original, later-safe deadline.
  perform public.enqueue_event_cover_cleanup(p_operation_id,'event-covers',p_candidate_path,
    v_operation.lease_until+((p_config->>'storageRequestTimeoutMs')::double precision+(p_config->>'cleanupTransferMarginMs')::double precision)*interval '1 millisecond');
  return jsonb_build_object('status','claimed','stagingPath',v_operation.staging_path,'candidatePath',p_candidate_path,
    'deadlineAt',v_operation.processing_deadline_at,'leaseUntil',v_operation.lease_until);
end;
$$;

create function public.finish_event_cover_upload(p_event_id uuid,p_actor_id uuid,p_operation_id text,p_lease_token text,p_validated_metadata jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_operation public.event_cover_operations; v_previous text; v_result jsonb;
begin
  perform public.lock_event_cover(p_event_id,p_actor_id);
  select * into v_operation from public.event_cover_operations where operation_id=p_operation_id for update;
  if not found or v_operation.event_id is distinct from p_event_id or v_operation.actor_id is distinct from p_actor_id then
    raise exception using errcode='P0002',message='cover_not_found'; end if;
  if v_operation.state='committed' then return jsonb_build_object('status','committed','result',v_operation.result_snapshot); end if;
  perform public.check_event_cover_fence(v_operation,p_lease_token);
  if (select revision from public.event_covers where event_id=p_event_id) <> v_operation.expected_revision then
    update public.event_cover_operations set state='conflict',lease_token=null,updated_at=clock_timestamp() where operation_id=p_operation_id;
    return jsonb_build_object('status','conflict');
  end if;
  select object_path into v_previous from public.event_covers where event_id=p_event_id;
  update public.event_cover_operations set state='prepared',validated_metadata=p_validated_metadata where operation_id=p_operation_id;
  update public.event_covers set revision=revision+1,object_path=v_operation.candidate_path,
    media_type=p_validated_metadata->>'mediaType',byte_size=(p_validated_metadata->>'byteSize')::integer,
    width=(p_validated_metadata->>'width')::integer,height=(p_validated_metadata->>'height')::integer,
    content_hash=p_validated_metadata->>'contentHash',alt_text=nullif(btrim(v_operation.requested_metadata->>'altText'),''),
    position_x=coalesce((v_operation.requested_metadata->>'positionX')::double precision,0.5),
    position_y=coalesce((v_operation.requested_metadata->>'positionY')::double precision,0.5),updated_at=clock_timestamp()
  where event_id=p_event_id;
  v_result:=public.event_cover_snapshot(p_event_id);
  update public.event_cover_operations set state='committed',result_revision=(v_result->>'revision')::bigint,
    result_snapshot=v_result,updated_at=clock_timestamp() where operation_id=p_operation_id;
  perform public.enqueue_event_cover_cleanup(p_operation_id,'event-covers',v_previous,clock_timestamp());
  return jsonb_build_object('status','committed','result',v_result);
end;
$$;

create function public.fail_event_cover_upload(p_event_id uuid,p_actor_id uuid,p_operation_id text,p_lease_token text,p_state text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_state not in ('pending','rejected','conflict') then raise exception using errcode='22023',message='cover_invalid_state'; end if;
  perform public.lock_event_cover(p_event_id,p_actor_id);
  -- A late callback cannot alter a newer attempt or a committed result.
  update public.event_cover_operations set state=p_state,lease_token=null,updated_at=clock_timestamp()
  where operation_id=p_operation_id and event_id=p_event_id and actor_id=p_actor_id
    and lease_token=p_lease_token and state in ('processing','prepared');
end;
$$;

create function public.get_event_cover_operation(p_event_id uuid,p_actor_id uuid,p_operation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_operation public.event_cover_operations;
begin
  perform public.lock_event_cover(p_event_id,p_actor_id);
  select * into v_operation from public.event_cover_operations where operation_id=p_operation_id and event_id=p_event_id and actor_id=p_actor_id;
  if not found then raise exception using errcode='P0002',message='cover_not_found'; end if;
  return jsonb_build_object('operationId',p_operation_id,'status',v_operation.state,'result',v_operation.result_snapshot);
end;
$$;

revoke all on function public.event_cover_projection(uuid),public.event_cover_snapshot(uuid),public.get_event_cover_state(uuid,uuid),
  public.enqueue_event_cover_cleanup(text,text,text,timestamptz),public.prepare_event_cover_upload(uuid,uuid,text,bigint,text,jsonb),
  public.claim_event_cover_upload(uuid,uuid,text,bigint,text,jsonb,text,text,jsonb),public.finish_event_cover_upload(uuid,uuid,text,text,jsonb),
  public.fail_event_cover_upload(uuid,uuid,text,text,text),public.get_event_cover_operation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.event_cover_projection(uuid),public.event_cover_snapshot(uuid),public.get_event_cover_state(uuid,uuid),
  public.enqueue_event_cover_cleanup(text,text,text,timestamptz),public.prepare_event_cover_upload(uuid,uuid,text,bigint,text,jsonb),
  public.claim_event_cover_upload(uuid,uuid,text,bigint,text,jsonb,text,text,jsonb),public.finish_event_cover_upload(uuid,uuid,text,text,jsonb),
  public.fail_event_cover_upload(uuid,uuid,text,text,text),public.get_event_cover_operation(uuid,uuid,text) to service_role;

-- Existing public calculations and filters, with safe nullable cover projection.
create or replace function public.get_public_event_registration(p_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'title', e.title,
      'description', e.description, 'event_date', e.event_date,
      'venue', e.venue, 'time_zone', e.time_zone,
      'registration_closes_at', e.registration_closes_at, 'cover', public.event_cover_projection(e.id)),
    'ticket_types', coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'max_capacity', t.max_capacity,
      'remaining_capacity', least(greatest(e.max_capacity - public.capacity_consumption(e.id), 0), greatest(t.max_capacity
        - (select count(*) from public.registrations r where r.ticket_type_id = t.id)
        - (select count(*) from public.registration_reservations q
          where q.ticket_type_id = t.id and q.status = 'pending' and q.expires_at > pg_catalog.now()), 0))
    ) order by t.created_at) from public.ticket_types t where t.event_id = e.id), '[]'::jsonb)
  ) from public.events e where p_code ~ '^[0-9a-f]{64}$' and e.public_code = p_code and e.status = 'published'
    and pg_catalog.now() < e.registration_closes_at;
$$;
revoke all on function public.get_public_event_registration(text) from public;
grant execute on function public.get_public_event_registration(text) to anon, authenticated;

drop function public.get_public_event_list();
create function public.get_public_event_list()
returns table (
  id uuid, title text, description text, event_date timestamptz, venue text,
  status public.event_status, max_capacity integer, remaining_capacity integer,
  time_zone text, registration_closes_at timestamptz, public_code text, cover jsonb
) language sql stable security definer set search_path = '' as $$
  select e.id, e.title, e.description, e.event_date, e.venue, e.status, e.max_capacity,
    least(greatest(e.max_capacity - public.capacity_consumption(e.id), 0), (select coalesce(sum(greatest(t.max_capacity
      - (select count(*) from public.registrations r where r.ticket_type_id = t.id)
      - (select count(*) from public.registration_reservations q
        where q.ticket_type_id = t.id and q.status = 'pending' and q.expires_at > pg_catalog.now()), 0)), 0)::integer
      from public.ticket_types t where t.event_id = e.id))::integer,
    e.time_zone, e.registration_closes_at, e.public_code, public.event_cover_projection(e.id)
  from public.events e where e.status = 'published' order by e.event_date;
$$;
revoke all on function public.get_public_event_list() from public;
grant execute on function public.get_public_event_list() to anon, authenticated;

create function public.mark_event_cover_transfer(p_event_id uuid,p_actor_id uuid,p_operation_id text,p_lease_token text,p_finished boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_operation public.event_cover_operations;
begin
  perform public.lock_event_cover(p_event_id,p_actor_id);
  select * into v_operation from public.event_cover_operations where operation_id=p_operation_id for update;
  if not found or v_operation.event_id is distinct from p_event_id or v_operation.actor_id is distinct from p_actor_id then
    raise exception using errcode='P0002',message='cover_not_found'; end if;
  perform public.check_event_cover_fence(v_operation,p_lease_token);
  update public.event_cover_cleanup_jobs set transfer_uncertain=not p_finished
  where bucket_id='event-covers' and object_path=v_operation.candidate_path;
end;
$$;

create function public.reconcile_event_cover_cleanup(p_config jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_row record; v_operation public.event_cover_operations; v_owner uuid;
begin
  perform public.validate_event_cover_config(p_config);
  for v_row in select operation_id,event_id from public.event_cover_operations where state in ('pending','processing','prepared') order by event_id,operation_id loop
    select created_by into v_owner from public.events where id=v_row.event_id for update;
    perform 1 from public.event_covers where event_id=v_row.event_id for update;
    select * into v_operation from public.event_cover_operations where operation_id=v_row.operation_id for update;
    if v_operation.state in ('pending','processing','prepared') and
      (v_operation.event_id is null or v_operation.actor_id is null or v_owner is distinct from v_operation.actor_id
       or v_operation.upload_expires_at <= clock_timestamp()) then
      update public.event_cover_operations set state='expired',lease_token=null,updated_at=clock_timestamp() where operation_id=v_row.operation_id;
    end if;
  end loop;
  -- Keep path tombstones. A completed job is reopened if a late object appears;
  -- elapsed time or an HTTP timeout is never proof that a transfer ended.
  update public.event_cover_cleanup_jobs j set state='pending',next_attempt_at=clock_timestamp()
  where j.state='done' and j.due_at <= clock_timestamp() and exists
    (select 1 from storage.objects o where o.bucket_id=j.bucket_id and o.name=j.object_path);
end;
$$;

create function public.claim_event_cover_cleanup(p_lease_token text,p_config jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row record; v_job public.event_cover_cleanup_jobs; v_operation public.event_cover_operations;
begin
  perform public.validate_event_cover_config(p_config);
  for v_row in select id,operation_id from public.event_cover_cleanup_jobs
    where state in ('pending','processing') and next_attempt_at <= clock_timestamp() and due_at <= clock_timestamp()
      and (state='pending' or lease_until <= clock_timestamp()) order by next_attempt_at,id limit 100 loop
    -- Consistent order: Event -> EventCover -> Operation -> job.
    select * into v_operation from public.event_cover_operations where operation_id=v_row.operation_id;
    perform 1 from public.events where id=v_operation.event_id for update;
    perform 1 from public.event_covers where event_id=v_operation.event_id for update;
    select * into v_operation from public.event_cover_operations where operation_id=v_row.operation_id for update;
    select * into v_job from public.event_cover_cleanup_jobs where id=v_row.id for update skip locked;
    if not found or v_job.state='done' or v_job.next_attempt_at > clock_timestamp()
      or (v_job.state='processing' and v_job.lease_until > clock_timestamp()) then continue; end if;
    if exists(select 1 from public.event_covers where object_path=v_job.object_path and v_job.bucket_id='event-covers')
      or (v_operation.candidate_path=v_job.object_path and v_operation.state in ('processing','prepared') and v_operation.lease_until > clock_timestamp())
      or (v_job.bucket_id='event-cover-uploads' and v_operation.upload_expires_at > clock_timestamp()) then
      update public.event_cover_cleanup_jobs set state='pending',next_attempt_at=clock_timestamp()+interval '15 minutes',last_error_code='protected_object' where id=v_job.id;
      continue;
    end if;
    update public.event_cover_cleanup_jobs set state='processing',attempts=attempts+1,lease_token=p_lease_token,
      lease_until=clock_timestamp()+(p_config->>'processingLeaseMs')::double precision*interval '1 millisecond',updated_at=clock_timestamp()
    where id=v_job.id;
    return jsonb_build_object('id',v_job.id::text,'bucketId',v_job.bucket_id,'objectPath',v_job.object_path,
      'transferUncertain',v_job.transfer_uncertain);
  end loop;
  return null;
end;
$$;

create function public.complete_event_cover_cleanup(p_job_id bigint,p_lease_token text,p_error_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_attempts integer;
begin
  select attempts into v_attempts from public.event_cover_cleanup_jobs where id=p_job_id
    and state='processing' and lease_token=p_lease_token and lease_until>clock_timestamp() for update;
  if not found then return false; end if;
  update public.event_cover_cleanup_jobs set state=case when p_error_code is null then 'done' else 'pending' end,
    next_attempt_at=clock_timestamp()+least(3600,power(2,least(v_attempts,10))*15)*interval '1 second',
    last_error_code=p_error_code,transfer_uncertain=case when p_error_code is null then false else transfer_uncertain end,
    lease_token=null,lease_until=null,updated_at=clock_timestamp() where id=p_job_id;
  return true;
end;
$$;

create function public.retire_event_cover() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_cover public.event_covers; v_operation record;
begin
  select * into v_cover from public.event_covers where event_id=old.id for update;
  for v_operation in select operation_id from public.event_cover_operations where event_id=old.id order by operation_id for update loop
    update public.event_cover_operations set state=case when state='committed' then state else 'expired' end,
      lease_token=null,updated_at=clock_timestamp() where operation_id=v_operation.operation_id;
  end loop;
  perform public.enqueue_event_cover_cleanup(null,'event-covers',v_cover.object_path,clock_timestamp());
  return old;
end;
$$;
create trigger events_retire_cover before delete on public.events for each row execute function public.retire_event_cover();

create function public.retire_actor_cover_operations() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row record;
begin
  for v_row in select operation_id,event_id from public.event_cover_operations where actor_id=old.id order by event_id,operation_id loop
    perform 1 from public.events where id=v_row.event_id for update;
    perform 1 from public.event_covers where event_id=v_row.event_id for update;
    -- Detach before Auth's Event cascade: the Event retirement update must not
    -- recheck an actor FK whose parent has already been deleted in that cascade.
    update public.event_cover_operations set actor_id=null,state=case when state='committed' then state else 'expired' end,
      lease_token=null,updated_at=clock_timestamp() where operation_id=v_row.operation_id;
  end loop;
  return old;
end;
$$;
create trigger users_retire_cover_operations before delete on auth.users for each row execute function public.retire_actor_cover_operations();

revoke all on function public.mark_event_cover_transfer(uuid,uuid,text,text,boolean),public.reconcile_event_cover_cleanup(jsonb),
  public.claim_event_cover_cleanup(text,jsonb),public.complete_event_cover_cleanup(bigint,text,text),
  public.retire_event_cover(),public.retire_actor_cover_operations() from public,anon,authenticated;
grant execute on function public.mark_event_cover_transfer(uuid,uuid,text,text,boolean),public.reconcile_event_cover_cleanup(jsonb),
  public.claim_event_cover_cleanup(text,jsonb),public.complete_event_cover_cleanup(bigint,text,text) to service_role;

create function public.mutate_event_cover(p_event_id uuid,p_actor_id uuid,p_operation_id text,p_kind text,
  p_expected_revision bigint,p_fingerprint text,p_metadata jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_operation public.event_cover_operations; v_cover public.event_covers; v_result jsonb;
begin
  if p_kind not in ('metadata','remove') or (p_kind='metadata' and not (p_metadata ?| array['altText','positionX','positionY'])) then
    raise exception using errcode='22023',message='cover_invalid_payload'; end if;
  perform public.lock_event_cover(p_event_id,p_actor_id);
  select * into v_cover from public.event_covers where event_id=p_event_id;
  select * into v_operation from public.event_cover_operations where operation_id=p_operation_id for update;
  if found then
    if v_operation.event_id is distinct from p_event_id or v_operation.actor_id is distinct from p_actor_id
      or v_operation.kind<>p_kind or v_operation.expected_revision<>p_expected_revision or v_operation.request_fingerprint<>p_fingerprint then
      raise exception using errcode='40001',message='cover_payload_conflict'; end if;
    if v_operation.state='committed' then return jsonb_build_object('status','committed','result',v_operation.result_snapshot); end if;
    return jsonb_build_object('status',v_operation.state);
  end if;
  insert into public.event_cover_operations(operation_id,event_id,actor_id,kind,expected_revision,request_fingerprint,requested_metadata)
  values(p_operation_id,p_event_id,p_actor_id,p_kind,p_expected_revision,p_fingerprint,p_metadata);
  if v_cover.revision<>p_expected_revision or (p_kind='metadata' and v_cover.object_path is null) then
    update public.event_cover_operations set state='conflict',updated_at=clock_timestamp() where operation_id=p_operation_id;
    return jsonb_build_object('status','conflict');
  end if;
  if p_kind='metadata' then
    update public.event_covers set revision=revision+1,
      alt_text=case when p_metadata ? 'altText' then nullif(btrim(p_metadata->>'altText'),'') else alt_text end,
      position_x=case when p_metadata ? 'positionX' then (p_metadata->>'positionX')::double precision else position_x end,
      position_y=case when p_metadata ? 'positionY' then (p_metadata->>'positionY')::double precision else position_y end,
      updated_at=clock_timestamp() where event_id=p_event_id;
  elsif v_cover.object_path is not null then
    update public.event_covers set revision=revision+1,object_path=null,media_type=null,byte_size=null,width=null,height=null,
      content_hash=null,alt_text=null,position_x=0.5,position_y=0.5,updated_at=clock_timestamp() where event_id=p_event_id;
    perform public.enqueue_event_cover_cleanup(p_operation_id,'event-covers',v_cover.object_path,clock_timestamp());
  end if;
  v_result:=public.event_cover_snapshot(p_event_id);
  update public.event_cover_operations set state='committed',result_revision=(v_result->>'revision')::bigint,
    result_snapshot=v_result,updated_at=clock_timestamp() where operation_id=p_operation_id;
  return jsonb_build_object('status','committed','result',v_result);
end;
$$;
revoke all on function public.mutate_event_cover(uuid,uuid,text,text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_event_cover(uuid,uuid,text,text,bigint,text,jsonb) to service_role;
