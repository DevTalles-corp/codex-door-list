import type { ReactNode } from "react";
import OrganizerAuth from "@/components/organizer-auth";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <OrganizerAuth>{children}</OrganizerAuth>;
}
