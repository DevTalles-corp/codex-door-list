import type { ReactNode } from "react";
import DashboardAuth from "./dashboard-auth";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardAuth>{children}</DashboardAuth>;
}
