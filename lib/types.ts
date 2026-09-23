export type EventStatus = "draft" | "published";

export type Event = {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  venue: string;
  max_capacity: number;
  status: EventStatus;
  published_at: string | null;
};

export type EventListing = Pick<
  Event,
  "id" | "title" | "description" | "event_date" | "venue" | "status" | "max_capacity"
> & {
  remaining_capacity: number;
};

export type RegistrationEvent = Pick<
  Event,
  "id" | "title" | "description" | "event_date" | "venue"
>;

export type TicketType = {
  id: string;
  event_id: string;
  name: string;
  max_capacity: number;
};

export type AvailableTicketType = Pick<TicketType, "id" | "name" | "max_capacity"> & {
  remaining_capacity: number;
};

export type RegistrationData = {
  event: RegistrationEvent;
  ticket_types: AvailableTicketType[];
};

export type RegistrationRpcStatus =
  | "success"
  | "event_unavailable"
  | "ticket_unavailable"
  | "duplicate_registration"
  | "invalid_input"
  | "server_error";

export type RegistrationRequest = {
  eventId?: unknown;
  ticketTypeId?: unknown;
  name?: unknown;
  email?: unknown;
};

export type RegistrationRpcResult = {
  status: RegistrationRpcStatus;
  registration_id: string | null;
  ticket_code: string | null;
};

export type RegistrationErrorCode = Exclude<RegistrationRpcStatus, "success"> | "service_unavailable";

export type RegistrationErrorResponse = {
  error: RegistrationErrorCode;
};

export type RegistrationSuccessResponse = {
  registrationId: string;
  ticketCode: string;
  emailSent: boolean;
};

export type TicketStatus = "valid" | "used" | "revoked";

export type Ticket = {
  code: string;
  status: TicketStatus;
  issued_at: string;
  attendee: {
    name: string;
    email: string;
  };
  event: {
    title: string;
    event_date: string;
    venue: string;
  };
  ticket_type: {
    name: string;
  };
};

export type RegistrationTicket = Omit<Ticket, "status" | "issued_at">;

export type OrganizerEventSummary = {
  id: string;
  title: string;
  description: string | null;
  eventDate: string;
  venue: string;
  maxCapacity: number;
  status: EventStatus;
};

export type OrganizerTicketTypeMetrics = {
  id: string;
  name: string;
  maxCapacity: number | null;
  registrationCount: number;
};

export type OrganizerTicket = {
  code: string;
  status: Exclude<TicketStatus, "revoked">;
  checkedInAt: string | null;
};

export type CheckInRequest = { eventId?: unknown; ticketCode?: unknown };
export type CheckInSuccessResponse = {
  status: "valid";
  attendeeName: string;
  ticketTypeName: string;
};
export type CheckInRpcResult = {
  status: "valid" | "used" | "not_found";
  attendee_name: string | null;
  ticket_type_name: string | null;
};

export type OrganizerRegistration = {
  id: string;
  attendeeName: string;
  attendeeEmail: string;
  registeredAt: string;
  ticketType: Pick<OrganizerTicketTypeMetrics, "id" | "name">;
  ticket: OrganizerTicket;
};

export type OrganizerEventDashboard = {
  event: OrganizerEventSummary;
  ticketTypes: OrganizerTicketTypeMetrics[];
  registrations: OrganizerRegistration[];
};

export type DailyRegistrationCount = {
  date: string;
  count: number;
};

export type DailyRegistrationsResponse = {
  publishedAt: string | null;
  registrationsByDay: DailyRegistrationCount[];
};

export type ApiErrorResponse = {
  error: string;
};
