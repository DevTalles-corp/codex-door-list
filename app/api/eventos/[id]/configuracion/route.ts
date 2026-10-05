import { NextResponse } from "next/server";
import { configurationError, parseEventConfiguration, uuidPattern } from "@/lib/event-configuration";
import { getRequestSupabase } from "@/lib/supabase/server";
import type { EventConfigurationResponse } from "@/lib/types";

const headers = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidPattern.test(id) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) return fail("Revisa los datos de configuración.", 400);
  let payload;
  try { payload = parseEventConfiguration(await request.json()); }
  catch { return fail("Revisa los datos de configuración.", 400); }
  if (!payload) return fail("Revisa los datos de configuración.", 400);
  try {
    const auth = await getRequestSupabase(request);
    if (auth.error) return fail(auth.status === 503 ? "El servicio no está disponible. Intenta nuevamente." : "Inicia sesión para editar el evento.", auth.status);
    const { data: event, error: eventError } = await auth.client.from("events").select("created_by").eq("id", id).maybeSingle();
    if (eventError) return fail("No pudimos cargar el evento. Intenta nuevamente.", 500);
    if (!event) return fail("No encontramos el evento.", 404);
    if (event.created_by !== auth.user.id) return fail("No tienes permiso para editar este evento.", 403);
    const { data, error } = await auth.client.rpc("update_event_configuration", { p_request: { eventId: id, ...payload } });
    if (error) { const result = configurationError(error); return fail(result.error, result.status); }
    const result = data as EventConfigurationResponse | null;
    if (!result || result.eventId !== id || (result.ticketTypeId !== null && typeof result.ticketTypeId !== "string")) return fail("No pudimos guardar la configuración. Intenta nuevamente.", 500);
    return NextResponse.json(result, { headers });
  } catch { return fail("No pudimos guardar la configuración. Intenta nuevamente.", 500); }
}
