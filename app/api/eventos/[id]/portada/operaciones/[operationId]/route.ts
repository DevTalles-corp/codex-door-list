import { getEventCoverOperation, handleCoverRequest } from "@/lib/event-cover-service";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string; operationId: string }> }) {
  const { id, operationId } = await context.params;
  return handleCoverRequest(() => getEventCoverOperation(request, id, operationId));
}
