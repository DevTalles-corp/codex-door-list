import { NextResponse } from "next/server";
import { buildAuditCsv } from "@/lib/export/audit-csv";
import { getAuditRegistrations } from "@/lib/organizer-audit";
import { getRequestSupabase } from "@/lib/supabase/server";

const noStore = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return fail("invalid_event_id", 400);
  const auth = await getRequestSupabase(request);
  if (auth.error) return fail(auth.error, auth.status);
  const { data: event, error } = await auth.client.from("events")
    .select("title,time_zone").eq("id", id).eq("created_by", auth.user.id).maybeSingle();
  if (error) return fail("could_not_export_audit", 500);
  if (!event) return fail("forbidden", 403);
  try {
    const rows = await getAuditRegistrations(auth.client, id);
    const csv = buildAuditCsv(event.title, rows, event.time_zone);
    return new NextResponse(csv.content, { headers: { ...noStore,
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${csv.fileName}"` } });
  } catch { return fail("could_not_export_audit", 500); }
}
