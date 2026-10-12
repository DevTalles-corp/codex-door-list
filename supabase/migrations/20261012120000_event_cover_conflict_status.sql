-- Business conflicts must return immediately as HTTP 409, rather than use
-- the serialization-failure SQLSTATE reserved for retryable transactions.
-- CREATE OR REPLACE preserves the existing ownership and execute grants.

create or replace function public.check_event_cover_fence(p_operation public.event_cover_operations, p_lease_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_lease_token is null or p_operation.lease_token is null or p_operation.lease_until is null
    or p_operation.processing_deadline_at is null
    or p_operation.lease_token is distinct from p_lease_token or p_operation.lease_until <= clock_timestamp()
    or p_operation.processing_deadline_at <= clock_timestamp()
    or p_operation.state not in ('processing','prepared') then
    raise exception using errcode='PT409', message='cover_lease_lost';
  end if;
end;
$$;

create or replace function public.prepare_event_cover_upload(p_event_id uuid,p_actor_id uuid,p_operation_id text,
  p_expected_revision bigint,p_staging_path text,p_config jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_expires timestamptz;
begin
  perform public.validate_event_cover_config(p_config);
  -- Conservative expiry covers a signing request whose response is lost.
  v_expires:=clock_timestamp()+interval '2 hours'+(p_config->>'storageRequestTimeoutMs')::double precision*interval '1 millisecond';
  perform public.lock_event_cover(p_event_id,p_actor_id);
  if (select revision from public.event_covers where event_id=p_event_id) <> p_expected_revision then
    raise exception using errcode='PT409',message='cover_conflict';
  end if;
  insert into public.event_cover_operations(operation_id,event_id,actor_id,kind,expected_revision,staging_path,upload_expires_at)
  values(p_operation_id,p_event_id,p_actor_id,'upload',p_expected_revision,p_staging_path,v_expires);
  perform public.enqueue_event_cover_cleanup(p_operation_id,'event-cover-uploads',p_staging_path,
    v_expires+(p_config->>'cleanupTransferMarginMs')::double precision*interval '1 millisecond');
  return jsonb_build_object('operationId',p_operation_id,'expiresAt',v_expires);
end;
$$;

create or replace function public.claim_event_cover_upload(p_event_id uuid,p_actor_id uuid,p_operation_id text,
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
    raise exception using errcode='PT409',message='cover_payload_conflict';
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

create or replace function public.mutate_event_cover(p_event_id uuid,p_actor_id uuid,p_operation_id text,p_kind text,
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
      raise exception using errcode='PT409',message='cover_payload_conflict'; end if;
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
