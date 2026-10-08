/** Request and response shapes shared by the API routes and the browser. */
import type { Destination } from "@/lib/pipeline/destination";
import type { JobLayouts } from "@/lib/pipeline/layout";
import type {
  Batch,
  JobInfo,
  LogEvent,
  Role,
  Sample,
} from "@/lib/pipeline/types";
import type { BatchSummary, ParsedWorkbook } from "@/lib/workbook/model";

export interface ApiError {
  error: { code: string; message: string };
}

export interface BatchListItem extends Batch {
  total: number;
  finished: number;
  returned: number;
  firstNewId: string;
  lastNewId: string;
}

export interface OnlineParticipant {
  id: string;
  name: string;
  role: Role;
  batchNumber: number | null;
}

export interface Me {
  participantId: string;
  name: string;
  role: Role;
  batchNumber: number;
}

export interface ParseResponse {
  workbook: ParsedWorkbook | null;
  summary: BatchSummary[];
  errors: string[];
  warnings: string[];
}

export interface CreateJobResponse {
  code: string;
}

export interface JobSummaryResponse {
  job: Omit<JobInfo, "id">;
  batches: BatchListItem[];
  /** Who is on the job now, so the join screen can show which roles are taken. */
  online: OnlineParticipant[];
}

export interface JoinResponse {
  token: string;
  me: Me;
}

export interface StateResponse {
  version: number;
  job: JobInfo;
  batch: Batch;
  batches: BatchListItem[];
  samples: Sample[];
  online: OnlineParticipant[];
  me: Me;
  layouts: JobLayouts;
}

export type ScanOutcome =
  | {
      kind: "place" | "repeat";
      label: string;
      destination: Destination;
      sampleFinished: boolean;
    }
  | { kind: "reject"; reason: string; message: string };

export type LabelScanOutcome =
  | {
      kind: "record" | "repeat";
      label: string;
      tube: number;
      set: string;
      /** True once all of the sample's labels are scanned (or it was labeled anyway). */
      sampleLabeled: boolean;
    }
  | { kind: "reject"; reason: string; message: string };

export interface ActionResponse {
  ok: boolean;
  version: number;
  samples: Sample[];
  events: LogEvent[];
  scan?: ScanOutcome;
  labelScan?: LabelScanOutcome;
  duplicate?: boolean;
}

/** What the relay delivers to every screen on a job after a logged change. */
export interface ChangeMessage {
  type: "change";
  version: number;
  samples: Sample[];
  events: LogEvent[];
}

export interface EventsResponse {
  events: LogEvent[];
  nextBefore: number | null;
}

export interface TicketResponse {
  url: string | null;
  ticket: string | null;
}

/** A job as the admin page lists it. */
export interface AdminJob {
  code: string;
  name: string;
  createdBy: string;
  createdAt: string;
  batches: number;
  samples: number;
  finished: number;
  online: number;
  lastActivityAt: string | null;
}

/** A passkey that can sign in as an admin. */
export interface AdminPasskey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  /** Who made the invite it was added with; null for a seeded invite. */
  invitedBy: string | null;
}

export interface AdminOverviewResponse {
  jobs: AdminJob[];
  passkeys: AdminPasskey[];
}

/** A whole job as an admin watches it: every batch, as of one job version. */
export interface AdminJobStateResponse {
  version: number;
  job: JobInfo;
  batches: Batch[];
  /** Every sample, in batch and pull-list order. */
  samples: Sample[];
  online: OnlineParticipant[];
  /** The latest events, newest first. */
  feed: LogEvent[];
  layouts: JobLayouts;
}

export interface AdminInviteResponse {
  /** The link's path on this site: /admin/invite/<token>. */
  path: string;
  expiresAt: string;
}
