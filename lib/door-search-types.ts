export type TicketSearchResponse = {
  attendeeName: string;
  attendeeEmail: string;
  ticketTypeName: string;
  ticketCode: string;
  ticketStatus: "valid" | "used";
};
