export function fixtureError(action: string, error: { code?: string; message: string } | null) {
  let message = error?.message ?? "No data returned";
  for (const secret of [process.env.E2E_SUPABASE_ANON_KEY, process.env.E2E_SUPABASE_SERVICE_ROLE_KEY]) {
    if (secret) message = message.replaceAll(secret, "[redacted]");
  }
  return new Error(`${action}: ${error?.code ?? "unknown"}: ${message}`);
}
