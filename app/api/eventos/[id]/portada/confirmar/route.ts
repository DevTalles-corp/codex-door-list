import { confirmEventCover, handleCoverRequest } from "@/lib/event-cover-service";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleCoverRequest(() => confirmEventCover(request, id));
}
