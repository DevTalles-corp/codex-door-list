import OrganizerAuth from "@/components/organizer-auth";
import ScanScreen from "./scan-screen";

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ eventId?: string }> }) {
  const { eventId } = await searchParams;
  return <OrganizerAuth><ScanScreen initialEventId={typeof eventId === "string" ? eventId : ""} /></OrganizerAuth>;
}
