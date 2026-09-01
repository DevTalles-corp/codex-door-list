import type { Metadata } from "next";
import PublicTicket from "./public-ticket";

export const metadata: Metadata = {
  title: "Tu entrada | Door List",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function TicketPage({
  params,
}: PageProps<"/entradas/[code]">) {
  const { code } = await params;

  return <PublicTicket code={code} />;
}
