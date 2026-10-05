create or replace function public.update_event_configuration(p_request jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  event_id_to_update uuid; type_id_to_update uuid;
  event_row public.events%rowtype; type_row public.ticket_types%rowtype;
  event_patch jsonb; type_patch jsonb; key_name text; value jsonb;
  next_event_capacity integer; next_type_capacity integer; occupied bigint; assigned bigint;
  violations jsonb:='[]'::jsonb; assignments text[]; column_name text; cast_type text;
  final_entry_open timestamptz; final_entry_close timestamptz;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'READ COMMITTED required' using errcode='0A000';
  end if;
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_request is null or jsonb_typeof(p_request)<>'object' then raise exception 'invalid configuration' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_request) k where k not in ('eventId','event','ticketType'))
    or jsonb_typeof(p_request->'eventId') is distinct from 'string'
    or not (p_request ? 'event' or p_request ? 'ticketType') then
    raise exception 'invalid configuration' using errcode='22023';
  end if;
  event_id_to_update:=(p_request->>'eventId')::uuid;
  event_patch:=p_request->'event'; type_patch:=p_request->'ticketType';
  if p_request ? 'event' then
    if jsonb_typeof(event_patch)<>'object' or event_patch='{}'::jsonb then raise exception 'invalid configuration' using errcode='22023'; end if;
    if exists(select 1 from jsonb_object_keys(event_patch) k where k not in ('title','description','eventDate','venue','status','maxCapacity','timeZone','registrationClosesAt','entryOpensAt','entryClosesAt')) then
      raise exception 'invalid configuration' using errcode='22023';
    end if;
  end if;
  if p_request ? 'ticketType' then
    if jsonb_typeof(type_patch)<>'object' or jsonb_typeof(type_patch->'id') is distinct from 'string'
      or not (type_patch ? 'name' or type_patch ? 'maxCapacity') then raise exception 'invalid configuration' using errcode='22023'; end if;
    if exists(select 1 from jsonb_object_keys(type_patch) k where k not in ('id','name','maxCapacity')) then raise exception 'invalid configuration' using errcode='22023'; end if;
    type_id_to_update:=(type_patch->>'id')::uuid;
  end if;
  for key_name,value in select k,v from jsonb_each(coalesce(event_patch,'{}')) as x(k,v)
    union all select k,v from jsonb_each(coalesce(type_patch,'{}')) as x(k,v)
  loop
    if key_name='maxCapacity' then
      if jsonb_typeof(value)<>'number' then raise exception 'invalid capacity' using errcode='22023'; end if;
      if value::numeric < 1 or value::numeric > 2147483647 or trunc(value::numeric)<>value::numeric then raise exception 'invalid capacity' using errcode='22023'; end if;
    elsif key_name='description' then
      if jsonb_typeof(value) not in ('string','null') then raise exception 'invalid description' using errcode='22023'; end if;
    else
      if jsonb_typeof(value)<>'string' or btrim(value #>> '{}')='' then raise exception 'invalid field' using errcode='22023'; end if;
      if key_name in ('eventDate','registrationClosesAt','entryOpensAt','entryClosesAt') then
        if (value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'invalid instant' using errcode='22023'; end if;
        perform (value #>> '{}')::timestamptz;
      elsif key_name='status' and (value #>> '{}') not in ('draft','published') then raise exception 'invalid status' using errcode='22023';
      elsif key_name='timeZone' and not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=(value #>> '{}')) then raise exception 'invalid time zone' using errcode='22023';
      end if;
    end if;
  end loop;

  -- RLS for UPDATE hides foreign rows even when they are published. Authorize
  -- using an ordinary visible read first, then recheck after the owner lock.
  select e.* into event_row from public.events e where e.id=event_id_to_update;
  if not found then raise exception 'event not found' using errcode='P0002'; end if;
  if event_row.created_by<>auth.uid() then raise exception 'forbidden' using errcode='42501'; end if;
  select e.* into event_row from public.events e where e.id=event_id_to_update for update;
  if not found then raise exception 'event not found' using errcode='P0002'; end if;
  if event_row.created_by<>auth.uid() then raise exception 'forbidden' using errcode='42501'; end if;
  if type_id_to_update is not null then
    select t.* into type_row from public.ticket_types t where t.id=type_id_to_update and t.event_id=event_id_to_update for update;
    if not found then raise exception 'ticket type not found' using errcode='P0002'; end if;
  end if;
  final_entry_open:=coalesce((event_patch->>'entryOpensAt')::timestamptz,event_row.entry_opens_at);
  final_entry_close:=coalesce((event_patch->>'entryClosesAt')::timestamptz,event_row.entry_closes_at);
  if final_entry_open>=final_entry_close then raise exception 'invalid entry window' using errcode='22023'; end if;
  next_event_capacity:=coalesce((event_patch->>'maxCapacity')::numeric::integer,event_row.max_capacity);
  next_type_capacity:=coalesce((type_patch->>'maxCapacity')::numeric::integer,type_row.max_capacity);
  if event_patch ? 'maxCapacity' then
    occupied:=public.configuration_capacity_consumption(event_id_to_update);
    if next_event_capacity<occupied then violations:=violations||jsonb_build_array(jsonb_build_object('scope','event','reason','registrationConsumption','requestedCapacity',next_event_capacity,'minimumCapacity',occupied)); end if;
  end if;
  if type_patch ? 'maxCapacity' then
    occupied:=public.configuration_capacity_consumption(event_id_to_update,type_id_to_update);
    if next_type_capacity<occupied then violations:=violations||jsonb_build_array(jsonb_build_object('scope','ticketType','reason','registrationConsumption','ticketTypeId',type_id_to_update,'ticketTypeName',type_row.name,'requestedCapacity',next_type_capacity,'minimumCapacity',occupied)); end if;
  end if;
  if event_patch ? 'maxCapacity' or type_patch ? 'maxCapacity' then
    select coalesce(sum(t.max_capacity),0) into assigned from public.ticket_types t where t.event_id=event_id_to_update;
    if type_patch ? 'maxCapacity' then assigned:=assigned-type_row.max_capacity+next_type_capacity; end if;
    if assigned>next_event_capacity then violations:=violations||jsonb_build_array(jsonb_build_object('scope','event','reason','assignedCapacity','requestedCapacity',next_event_capacity,'minimumCapacity',assigned)); end if;
  end if;
  if jsonb_array_length(violations)>0 then raise exception 'capacity violation' using errcode='23514',detail=jsonb_build_object('kind','capacityViolation','version',1,'violations',violations)::text; end if;

  set constraints public.events_capacity_assignment_check, public.ticket_types_capacity_assignment_check deferred;
  if event_patch is not null then
    assignments:='{}';
    for key_name in select jsonb_object_keys(event_patch) loop
      column_name:=case key_name when 'eventDate' then 'event_date' when 'maxCapacity' then 'max_capacity' when 'timeZone' then 'time_zone' when 'registrationClosesAt' then 'registration_closes_at' when 'entryOpensAt' then 'entry_opens_at' when 'entryClosesAt' then 'entry_closes_at' else key_name end;
      cast_type:=case key_name when 'maxCapacity' then 'numeric::integer' when 'status' then 'public.event_status' when 'eventDate' then 'timestamptz' when 'registrationClosesAt' then 'timestamptz' when 'entryOpensAt' then 'timestamptz' when 'entryClosesAt' then 'timestamptz' else 'text' end;
      assignments:=array_append(assignments,format('%I = ($1 ->> %L)::%s',column_name,key_name,cast_type));
    end loop;
    execute 'update public.events set '||array_to_string(assignments,', ')||' where id=$2' using event_patch,event_id_to_update;
  end if;
  if type_patch is not null then
    assignments:='{}';
    if type_patch ? 'name' then assignments:=array_append(assignments,'name = $1 ->> ''name'''); end if;
    if type_patch ? 'maxCapacity' then assignments:=array_append(assignments,'max_capacity = ($1 ->> ''maxCapacity'')::numeric::integer'); end if;
    execute 'update public.ticket_types set '||array_to_string(assignments,', ')||' where id=$2' using type_patch,type_id_to_update;
  end if;
  set constraints public.events_capacity_assignment_check, public.ticket_types_capacity_assignment_check immediate;
  return jsonb_build_object('eventId',event_id_to_update,'ticketTypeId',type_id_to_update);
end;
$$;
revoke all on function public.update_event_configuration(jsonb) from public, anon;
grant execute on function public.update_event_configuration(jsonb) to authenticated;
