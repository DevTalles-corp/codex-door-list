import type { ApiErrorResponse } from "./types";

export type OrganizerEventCover = {
  url: string;
  width: number;
  height: number;
  altText: string | null;
  positionX: number;
  positionY: number;
};
export type EventCover = Omit<OrganizerEventCover, "altText"> & { altText: string };
export type EventCoverProjection = Omit<OrganizerEventCover, "url"> & { objectPath: string };
export type EventCoverState = { eventId: string; revision: string; cover: OrganizerEventCover | null };
export type PersistedEventCoverState = Omit<EventCoverState, "cover"> & { cover: EventCoverProjection | null };
export type EventCoverClaim = {
  status: EventCoverOperationStatus | "claimed";
  result?: PersistedEventCoverState;
  stagingPath?: string;
  candidatePath?: string;
  deadlineAt?: string;
  leaseUntil?: string;
};
export type EventCoverOperationStatus = "pending" | "processing" | "prepared" | "committed" | "rejected" | "conflict" | "expired";
export type EventCoverOperationKind = "upload" | "metadata" | "remove";
export type EventCoverOperationResult = {
  operationId: string;
  status: EventCoverOperationStatus;
  result: EventCoverState | null;
  error?: string;
};
export type EventCoverMetadata = { altText?: string | null; positionX?: number; positionY?: number };
export type PrepareEventCoverRequest = { expectedRevision: string; byteSize: number };
export type PrepareEventCoverResponse = {
  operationId: string;
  expectedRevision: string;
  upload: { bucket: "event-cover-uploads"; path: string; token: string; expiresAt: string };
};
export type ConfirmEventCoverRequest = EventCoverMetadata & { operationId: string; expectedRevision: string };
export type UpdateEventCoverRequest = ConfirmEventCoverRequest;
export type RemoveEventCoverRequest = { operationId: string; expectedRevision: string };
export type EventCoverProcessingResponse = { operationId: string; status: "processing" };
export type EventCoverResponse = EventCoverState | EventCoverProcessingResponse | ApiErrorResponse;

// Persistence rows are the only snake_case boundary.
export type EventCoverRow = {
  event_id: string;
  revision: string;
  object_path: string | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  position_x: number;
  position_y: number;
};
export type ValidatedEventCover = {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  width: number;
  height: number;
  contentHash: string;
};
export type EventCoverEditorStatus = "idle" | "draft" | "preparing" | "uploading" | "validating" | "saving" | "removing" | "success" | "failed" | "conflict" | "unknown";
