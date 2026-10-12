import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAccount, createEvent } from "./constitutional-fixtures";

export { coverFixtureDirectory, maxCoverBytes, generateCoverFixtures, coverFixture } from "./generate-cover-fixtures.mjs";
export const newCoverOperationId = () => randomBytes(32).toString("hex");

export async function createCoverActors(admin: SupabaseClient) {
  const owner = await createAccount(admin, "cover-owner");
  const otherOwner = await createAccount(admin, "cover-other");
  const doorOnly = await createAccount(admin, "cover-door");
  const event = await createEvent(admin, owner.id, 10);
  const { error } = await admin.from("event_door_staff").insert({ event_id: event.id, user_id: doorOnly.id });
  if (error) throw new Error("Could not assign cover fixture door staff");
  return { owner, otherOwner, doorOnly, event };
}

export function controlledCoverClock(initial: number) {
  let now = initial;
  return { now: () => now, advance: (milliseconds: number) => { now += milliseconds; } };
}
