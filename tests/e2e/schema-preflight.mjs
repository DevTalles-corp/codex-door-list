// These read-only probes also work when Supabase is supplied through E2E_* variables.
const requiredSchema = {
  events: "id,time_zone,registration_closes_at,entry_opens_at,entry_closes_at,public_code",
  ticket_types: "id,event_id,max_capacity",
  tickets: "id,registration_id,checked_in_at,revoked_at",
  registration_reservations: "id,event_id,ticket_type_id,status,expires_at",
  event_door_staff: "event_id,user_id",
  event_covers: "event_id,revision,object_path",
  event_cover_operations: "operation_id,event_id,state,lease_token",
  event_cover_cleanup_jobs: "id,bucket_id,object_path,state",
};

export async function verifyE2ESchema(client) {
  const results = await Promise.all(Object.entries(requiredSchema).map(async ([table, columns]) => {
    const { error } = await client.from(table).select(columns).limit(0);
    return error ? `${table}: ${error.code || "request failed"}` : null;
  }));
  const failures = results.filter(Boolean);
  if (failures.length) {
    throw new Error([
      "E2E database preflight failed. Required tables or columns could not be read:",
      ...failures.map((failure) => `- ${failure}`),
      "Check the E2E_SUPABASE_* credentials and apply pending migrations to the target local project with `supabase migration up --local`.",
      "No tests were started and no data was changed by this check.",
    ].join("\n"));
  }
}
