import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createCapacityEnvironment } from "./local-capacity-environment.mjs";

const owner="81000000-0000-4000-8000-000000000001";
const authorize=`set request.jwt.claim.sub='${owner}'; set role authenticated;`;
const hasCode=(code)=>(error)=>new RegExp(`${code}:`).test(error.output ?? "");
const capture=(promise)=>promise.then((value)=>({ value }), (error)=>({ error }));
const token=()=>randomBytes(32).toString("hex");
let sessionIndex=0;

export async function verifyCapacityConcurrency(env) {
  await env.sql(`insert into auth.users(id,email,email_confirmed_at) values('${owner}','capacity-races@example.test',now()) on conflict(id) do nothing;`);
  async function fixture({ capacity=4, general=false, typeCapacity=3, count=1, generalCount=1 }={}) {
    const id=randomUUID(), typeId=randomUUID(), generalId=general ? randomUUID() : null;
    await env.sql(`insert into public.events(id,created_by,title,event_date,venue,max_capacity,time_zone,registration_closes_at,entry_opens_at,entry_closes_at)
      values('${id}','${owner}','Race event',now(),'Test',${capacity},'UTC',now()+interval '1 hour',now()-interval '1 hour',now()+interval '1 hour');
      insert into public.ticket_types(id,event_id,name,max_capacity) values('${typeId}','${id}','VIP',${typeCapacity});
      ${general ? `insert into public.ticket_types(id,event_id,name,max_capacity) values('${generalId}','${id}','General',1);` : ""}
      update public.events set status='published' where id='${id}';`);
    for (const [ticketTypeId,total] of [[typeId,count],[generalId,general ? generalCount : 0]]) {
      for (let index=0; index<total; index++) {
        const registrationId=randomUUID();
        await env.sql(`insert into public.registrations(id,event_id,ticket_type_id,attendee_name,attendee_email)
          values('${registrationId}','${id}','${ticketTypeId}','Initial','${registrationId}@example.test');
          insert into public.tickets(registration_id) values('${registrationId}');`);
      }
    }
    return { id,typeId,generalId };
  }
  const reserve=(f,hash)=>`select status from public.reserve_for_event('${f.id}','${f.typeId}','Race','${hash}@example.test','${hash}');`;
  const confirm=(hash)=>`select status from public.confirm_reservation('${hash}');`;
  const rpc=(f,patch)=>`select public.update_event_configuration('${JSON.stringify({ eventId:f.id,...patch })}');`;
  const edit=(f,combined)=>rpc(f,{ ...(combined ? { event:{ title:"Changed event",maxCapacity:2 } } : {}),ticketType:{ id:f.typeId,name:"Changed VIP",maxCapacity:1 } });
  async function state(f) {
    return JSON.parse((await env.sql(`select jsonb_build_object('capacity',e.max_capacity,'typeCapacity',t.max_capacity,'title',e.title,'typeName',t.name,
      'total',(select count(*) from public.registrations r where r.event_id=e.id),
      'vip',(select count(*) from public.registrations r where r.ticket_type_id=t.id),
      'tickets',(select count(*) from public.tickets q join public.registrations r on r.id=q.registration_id where r.event_id=e.id))
      from public.events e join public.ticket_types t on t.event_id=e.id where e.id='${f.id}' and t.id='${f.typeId}';`)).trim());
  }
  async function snapshot(f) {
    return env.sql(`select jsonb_build_object('event',(select to_jsonb(e) from public.events e where id='${f.id}'),
      'types',(select jsonb_agg(to_jsonb(t) order by id) from public.ticket_types t where event_id='${f.id}'),
      'registrations',(select jsonb_agg(to_jsonb(r) order by id) from public.registrations r where event_id='${f.id}'),
      'tickets',(select jsonb_agg(to_jsonb(t) order by t.id) from public.tickets t join public.registrations r on r.id=t.registration_id where r.event_id='${f.id}'));`);
  }
  function pair() {
    const serial=++sessionIndex;
    const aName=`capacity_a_${serial}`,bName=`capacity_b_${serial}`;
    return { a:env.session(aName),b:env.session(bName),aName,bName };
  }
  for (const combined of [true,false]) {
    for (const order of ["sale-first","edit-first"]) {
      const f=await fixture({ general:combined }); const { a,b,bName }=pair(); const hash=token();
      try {
        if (order==="sale-first") {
          await a.query("begin;"); assert.equal(await a.query(reserve(f,hash)),"pending"); assert.equal(await a.query(confirm(hash)),"success");
          await b.query(authorize); const editing=capture(b.query(edit(f,combined)));
          await env.waitForLock(bName); await a.query("commit;");
          const result=await editing; assert.ok(result.error && hasCode("23514")(result.error));
          assert.deepEqual(await state(f),{ capacity:4,typeCapacity:3,title:"Race event",typeName:"VIP",total:combined ? 3 : 2,vip:2,tickets:combined ? 3 : 2 });
        } else {
          await a.query(authorize); await a.query("begin;"); await a.query(edit(f,combined));
          const selling=capture(b.query(reserve(f,hash))); await env.waitForLock(bName); await a.query("commit;");
          assert.equal((await selling).value,"ticket_unavailable");
          assert.deepEqual(await state(f),{ capacity:combined ? 2 : 4,typeCapacity:1,title:combined ? "Changed event" : "Race event",typeName:"Changed VIP",total:combined ? 2 : 1,vip:1,tickets:combined ? 2 : 1 });
        }
        console.log(`${combined ? "US3.2 combined" : "US3.3 type"} ${order}: ${JSON.stringify(await state(f))}`);
      } finally { a.close(); b.close(); }
    }
  }

  // DML has the type first. Let a sale hold Event and wait for that type,
  // then prove the reverse-order DML aborts NOWAIT and releases the type.
  {
    const f=await fixture(); const { a,b,aName }=pair(); const hash=token();
    try {
      await b.query(authorize); await b.query("begin;"); await b.query(`select id from public.ticket_types where id='${f.typeId}' for update;`);
      await a.query("begin;"); const selling=capture(a.query(reserve(f,hash))); await env.waitForLock(aName);
      await assert.rejects(b.query(`update public.ticket_types set max_capacity=1 where id='${f.typeId}';`),hasCode("55P03"));
      assert.equal((await selling).value,"pending"); assert.equal(await a.query(confirm(hash)),"success"); await a.query("commit;");
      await assert.rejects(env.sql(`begin; ${authorize} update public.ticket_types set max_capacity=1 where id='${f.typeId}';`),hasCode("23514"));
      assert.equal((await state(f)).typeCapacity,3); assert.equal((await state(f)).vip,2);
      await env.sql(`begin; ${authorize} update public.ticket_types set max_capacity=2 where id='${f.typeId}'; commit;`);
      assert.equal((await state(f)).typeCapacity,2);
      console.log("Direct DML: 55P03 with reverse locks; sale commits; fresh retry counts 2, rejects 1 and accepts 2.");
    } finally { a.close(); b.close(); }
  }
  {
    const f=await fixture({ capacity:1,typeCapacity:1,count:0 }); const { a,b,bName }=pair(); const first=token(),second=token();
    try {
      await a.query("begin;"); assert.equal(await a.query(reserve(f,first)),"pending"); assert.equal(await a.query(confirm(first)),"success");
      const selling=capture(b.query(reserve(f,second))); await env.waitForLock(bName); await a.query("commit;");
      assert.equal((await selling).value,"ticket_unavailable"); assert.equal((await state(f)).total,1); assert.equal((await state(f)).tickets,1);
      console.log("Sale/sale: capacity 1, exactly one confirmed Registration and Ticket.");
    } finally { a.close(); b.close(); }
  }
  {
    const f=await fixture({ general:true,typeCapacity:1,count:0,generalCount:0 }); const { a,b,bName }=pair();
    try {
      await a.query(authorize); await b.query(authorize); await a.query("begin;");
      await a.query(rpc(f,{ ticketType:{ id:f.generalId,maxCapacity:3 } }));
      const editing=capture(b.query(rpc(f,{ ticketType:{ id:f.typeId,maxCapacity:2 } })));
      await env.waitForLock(bName); await a.query("commit;");
      const result=await editing; assert.ok(result.error && hasCode("23514")(result.error));
      assert.equal((await env.sql(`select sum(max_capacity) from public.ticket_types where event_id='${f.id}';`)).trim(),"4");
      assert.equal((await state(f)).typeCapacity,1);
      console.log("Simultaneous type edits: sum 4/4; second edit requesting sum 5 rejects.");
    } finally { a.close(); b.close(); }
  }
  {
    const first=await fixture(),second=await fixture(); const { a,b }=pair();
    try {
      await a.query("begin;"); await a.query(`select id from public.events where id='${first.id}' for update;`);
      await b.query(authorize); await b.query(rpc(second,{ event:{ title:"Independent event" } }));
      assert.equal((await state(second)).title,"Independent event");
      await a.query("rollback;"); console.log("Different Events: second edit commits while first Event lock remains open.");
    } finally { a.close(); b.close(); }
  }
  for (const isolation of ["repeatable read","serializable"]) {
    const f=await fixture(); const before=await snapshot(f);
    const operations=[
      reserve(f,token()),confirm(token()),
      `${authorize} ${rpc(f,{ event:{ title:"Unsupported metadata" } })}`,
      `${authorize} ${rpc(f,{ ticketType:{ id:f.typeId,maxCapacity:2 } })}`,
      `${authorize} update public.events set max_capacity=4 where id='${f.id}';`,
      `${authorize} update public.ticket_types set max_capacity=2 where id='${f.typeId}';`,
      `${authorize} insert into public.ticket_types(event_id,name,max_capacity) values('${f.id}','Unsupported association',1);`,
    ];
    for (const operation of operations) {
      await assert.rejects(env.sql(`begin isolation level ${isolation}; ${operation}`),hasCode("0A000"));
      assert.equal(await snapshot(f),before,"Unsupported isolation must not persist any operation's writes");
    }
    await env.sql(`begin isolation level ${isolation}; ${authorize} update public.events set title='Metadata allowed' where id='${f.id}'; update public.ticket_types set name='Metadata allowed' where id='${f.typeId}'; rollback;`);
    assert.equal(await snapshot(f),before);
    const hash=token(); assert.equal((await env.sql(reserve(f,hash))).trim(),"pending"); assert.equal((await env.sql(confirm(hash))).trim(),"success");
    await env.sql(`begin; ${authorize} ${rpc(f,{ ticketType:{ id:f.typeId,maxCapacity:2 } })} commit;`);
    assert.equal((await state(f)).typeCapacity,2); assert.equal((await state(f)).vip,2); assert.equal((await state(f)).tickets,2);
    console.log(`${isolation.toUpperCase()}: reserve/confirm/RPC (metadata included)/DML/association reject 0A000 with full snapshots; new READ COMMITTED confirms and accepts equality 2.`);
  }
  {
    const f=await fixture(); const before=await snapshot(f);
    await assert.rejects(env.sql(`begin; ${authorize} set constraints public.ticket_types_capacity_assignment_check deferred;
      update public.ticket_types set max_capacity=5,name='Must rollback' where id='${f.typeId}'; commit;`),hasCode("23514"));
    assert.equal(await snapshot(f),before);
    console.log("Invalid deferred assignment at COMMIT rolls back limits, metadata, Registrations and Tickets.");
  }
}

if (import.meta.url===pathToFileURL(process.argv[1]).href) {
  const env=await createCapacityEnvironment();
  try { await env.start(); await verifyCapacityConcurrency(env); }
  catch (error) { console.error(error.message); process.exitCode=1; }
  finally { await env.stop().catch((error)=>{ console.error(error.message); process.exitCode=1; }); }
}
