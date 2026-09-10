import EventDashboard from "./event-dashboard";

export default async function EventDashboardPage({ params }: PageProps<"/dashboard/[id]">) {
  const { id } = await params;
  return <EventDashboard eventId={id} />;
}
