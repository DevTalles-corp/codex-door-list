import { getCurrentEventCover, handleCoverRequest, mutateEventCover } from "@/lib/event-cover-service";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleCoverRequest(() => getCurrentEventCover(request, id));
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleCoverRequest(() => mutateEventCover(request, id, "metadata"));
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleCoverRequest(() => mutateEventCover(request, id, "remove"));
}
