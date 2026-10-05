import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createCapacityEnvironment } from "./local-capacity-environment.mjs";

const owner = "61000000-0000-4000-8000-000000000001";
const claims = `set request.jwt.claim.sub='${owner}'; set role authenticated;`;
const request = (index, event, ticketType) => `select public.update_event_configuration('${JSON.stringify({ eventId: `62000000-0000-4000-8000-${String(index).padStart(12,"0")}`, ...(event ? { event } : {}), ...(ticketType ? { ticketType: { id: `63000000-0000-4000-8000-${String(index).padStart(12,"0")}`, ...ticketType } } : {}) })}');`;
const capacityError = (error) => /23514:.*capacity violation/.test(error.output ?? "");

export async function verifyCapacityUpgrade(environment, stories = ["US1", "US2", "US3"]) {
  const snapshotQuery = `select jsonb_build_object('events',(select jsonb_agg(to_jsonb(e) order by e.id) from public.events e),
    'types',(select jsonb_agg(to_jsonb(t) order by t.id) from public.ticket_types t),
    'registrations',(select jsonb_agg(to_jsonb(r) order by r.id) from public.registrations r),
    'tickets',(select jsonb_agg(to_jsonb(t) order by t.id) from public.tickets t));`;
  const before = await environment.sql(snapshotQuery);
  await environment.apply();
  assert.equal(await environment.sql(snapshotQuery), before, "Activation must preserve every historical row and limit");
  console.log("Capacity activation preserves the complete Event/Type/Registration/Ticket snapshot.");
  for (const story of stories) {
    if (story === "US1") {
      await assert.rejects(environment.sql(`begin; ${claims} ${request(1,null,{ maxCapacity:1 })}`),capacityError);
      await environment.sql(`begin; ${claims} ${request(1,null,{ name:"Renamed legacy" })} ${request(1,null,{ maxCapacity:2 })} rollback;`);
      console.log("US1 upgrade: aforo 4/VIP 1/consumption 2 preserved; explicit 1 rejects, metadata and 2 accept.");
    } else if (story === "US2") {
      await assert.rejects(environment.sql(`begin; ${claims} ${request(2,{ maxCapacity:2 })}`),capacityError);
      await environment.sql(`begin; ${claims} ${request(2,{ title:"Renamed legacy" })} ${request(2,{ maxCapacity:3 })} rollback;`);
      console.log("US2 upgrade: aforo 2/VIP 3/consumption 3 preserved; explicit 2 rejects, metadata and 3 accept.");
    } else if (story === "US3") {
      await assert.rejects(environment.sql(`begin; ${claims} ${request(3,{ title:"Rollback",maxCapacity:1 },{ maxCapacity:1 })}`),capacityError);
      const result = await environment.sql(`begin; ${claims} ${request(3,{ maxCapacity:5 },{ maxCapacity:5 })}
        select jsonb_build_array((select max_capacity from public.events where id='62000000-0000-4000-8000-000000000003'),(select max_capacity from public.ticket_types where id='63000000-0000-4000-8000-000000000003')); rollback;`);
      assert.equal(result.trim().split("\n").at(-1),"[5, 5]");
      console.log("US3 upgrade: aforo 3/VIP 10/consumption 2 preserved; atomic 5/5 accepts, invalid request rolls back.");
    } else throw new Error("Unknown story; select US1, US2 or US3");
    assert.equal(await environment.sql(snapshotQuery), before, `${story} verification leaves the historical fixture intact`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const index = process.argv.indexOf("--story");
  const stories = index < 0 ? ["US1","US2","US3"] : [process.argv[index+1]];
  const environment = await createCapacityEnvironment({ legacy: true });
  try { await environment.start(); await verifyCapacityUpgrade(environment,stories); }
  catch (error) { console.error(error.message); process.exitCode=1; }
  finally { await environment.stop().catch((error) => { console.error(error.message); process.exitCode=1; }); }
}
