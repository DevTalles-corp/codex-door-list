import type { Metadata } from "next";
import ConfirmReservation from "./confirm-reservation";

export const metadata: Metadata = { title: "Confirmar reserva | Door List", robots: { index: false, follow: false } };

export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <ConfirmReservation token={typeof token === "string" ? token : ""} />;
}
