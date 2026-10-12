import type { EventCoverProjection } from "./event-cover-types";

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
  time_zone: string;
  registration_closes_at: string;
  entry_opens_at: string;
  entry_closes_at: string;
  public_code: string;
};

export type EventListing = Pick<
  Event,
  "id" | "title" | "description" | "event_date" | "venue" | "status" | "max_capacity" | "time_zone" | "registration_closes_at" | "public_code"
> & {
  remaining_capacity: number;
  cover: EventCoverProjection | null;
};

export type RegistrationEvent = Pick<
  Event,
  "id" | "title" | "description" | "event_date" | "venue" | "time_zone" | "registration_closes_at"
> & { cover: EventCoverProjection | null };

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
  | "pending"
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
  reservation_id: string | null;
  expires_at: string | null;
};

export type RegistrationErrorCode = Exclude<RegistrationRpcStatus, "pending"> | "service_unavailable";

export type RegistrationErrorResponse = {
  error: RegistrationErrorCode;
};

export type RegistrationSuccessResponse = {
  status: "pending";
  expiresAt: string;
};

export type ConfirmationResponse = { registrationId: string; ticketCode: string; emailSent: boolean };

export type TicketStatus = "valid" | "used" | "revoked";

export type Ticket = {
  code: string;
  status: TicketStatus;
  issued_at: string;
  event: {
    title: string;
    event_date: string;
    venue: string;
    time_zone: string;
  };
  ticket_type: {
    name: string;
  };
};

export type RegistrationTicket = Pick<Ticket, "code" | "event" | "ticket_type"> & {
  attendee: { name: string; email: string };
};

export type OrganizerEventSummary = {
  id: string;
  title: string;
  description: string | null;
  eventDate: string;
  venue: string;
  maxCapacity: number;
  status: EventStatus;
  timeZone: string;
  registrationClosesAt: string;
  entryOpensAt: string;
  entryClosesAt: string;
};

export type DoorEvent = Pick<OrganizerEventSummary, "id" | "title" | "eventDate" | "status" | "timeZone" | "entryOpensAt" | "entryClosesAt">;

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

export type AuditRegistration = Omit<OrganizerRegistration, "ticket"> & {
  ticket: { code: string; status: TicketStatus; issuedAt: string; checkedInAt: string | null; revokedAt: string | null };
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

export type CapacityViolation = {
  scope: "event" | "ticketType";
  reason: "registrationConsumption" | "assignedCapacity";
  requestedCapacity: number;
  minimumCapacity: number;
  ticketTypeId?: string;
  ticketTypeName?: string;
};
export type CapacityErrorDetails = { kind: "capacityViolation"; version: 1; violations: CapacityViolation[] };

export type EventConfigurationRequest = {
  event?: Partial<Pick<OrganizerEventSummary, "title" | "description" | "eventDate" | "venue" | "status" | "maxCapacity" | "timeZone" | "registrationClosesAt" | "entryOpensAt" | "entryClosesAt">>;
  ticketType?: { id: string; name?: string; maxCapacity?: number };
};
export type EventConfigurationResponse = { eventId: string; ticketTypeId: string | null };
