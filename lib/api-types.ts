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
