import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { eventCoverConfig } from "./event-cover-config.mjs";

export async function cleanupEventCovers({ url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, maxJobs = 100 } = {}) {
  if (!url || !key) throw new Error("Missing server configuration for cover cleanup");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(eventCoverConfig.storageRequestTimeoutMs) }),
  } });
  const rpc = async (name, parameters) => {
    const result = await admin.rpc(name, parameters);
    if (result.error) throw new Error("Cover cleanup database request failed");
    return result.data;
  };
  await rpc("reconcile_event_cover_cleanup", { p_config: eventCoverConfig });
  const counts = { deleted: 0, absent: 0, deferred: 0, failed: 0 };
  for (let index = 0; index < maxJobs; index++) {
    const token = randomBytes(32).toString("hex");
    const job = await rpc("claim_event_cover_cleanup", { p_lease_token: token, p_config: eventCoverConfig });
    if (!job) break;
    let errorCode = null;
    try {
      const { data, error } = await admin.storage.from(job.bucketId).info(job.objectPath);
      if (error && !["404", "400"].includes(String(error.statusCode))) throw new Error("storage_lookup_failed");
      if (!data && job.transferUncertain) { errorCode = "transfer_uncertain"; counts.deferred++; }
      else if (!data) counts.absent++;
      else {
        const result = await admin.storage.from(job.bucketId).remove([job.objectPath]);
        if (result.error) throw new Error("storage_delete_failed");
        counts.deleted++;
      }
    } catch { errorCode = "storage_unavailable"; counts.failed++; }
    const fenced = await rpc("complete_event_cover_cleanup", { p_job_id: job.id, p_lease_token: token, p_error_code: errorCode });
    if (!fenced) counts.failed++;
  }
  return counts;
}
