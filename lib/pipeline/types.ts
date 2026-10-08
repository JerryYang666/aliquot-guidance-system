export type Role = "puller" | "labeler" | "aliquoter" | "overview";

export const ROLES: readonly Role[] = [
  "puller",
  "labeler",
  "aliquoter",
  "overview",
];

export const ROLE_LABELS: Record<Role, string> = {
  puller: "Puller",
  labeler: "Labeler",
  aliquoter: "Aliquoter",
  overview: "Overview",
};

export type TubeStatus = "pending" | "placed" | "not_filled";

export interface TubeState {
  /** Where the aliquot stands: set by the aliquoter's scan or by finishing the sample. */
  status: TubeStatus;
  at: string | null;
  by: string | null;
  /** When the labeler scanned this tube's new label, if they did. */
  labelScannedAt?: string | null;
  labelScannedBy?: string | null;
}

export interface Note {
  at: string;
  by: string;
  text: string;
}

/** A pull-list row with its current state, as every screen sees it. */
export interface Sample {
  id: string;
  batchNumber: number;
  pullOrder: number;
  newId: string;
  originalId: string;
  sourceBox: string;
  sourceLocation: string | null;
  sourcePosition: string | null;
  slot: string;
  volumeNote: string | null;
  pulledAt: string | null;
  pulledBy: string | null;
  labeledAt: string | null;
  labeledBy: string | null;
  finishedAt: string | null;
  finishedBy: string | null;
  returnedAt: string | null;
  returnedBy: string | null;
  skipRank: number | null;
  /** One per destination set; index 0 is the "-1" tube. */
  tubes: TubeState[];
  notes: Note[];
}

export interface Batch {
  number: number;
  boxNumber: number;
  title: string | null;
}

export interface JobInfo {
  id: string;
  code: string;
  name: string;
  destSets: string[];
  createdAt: string;
  createdBy: string;
}

/** An event about to be appended to the log. */
export interface EventDraft {
  type: EventType;
  batchNumber?: number | null;
  sampleId?: string | null;
  newId?: string | null;
  tube?: number | null;
  data?: Record<string, unknown>;
}

export type EventType =
  | "job_created"
  | "participant_joined"
  | "participant_left"
  | "sample_pulled"
  | "sample_pull_undone"
  | "sample_labeled"
  | "sample_label_undone"
  | "label_scanned"
  | "label_scan_repeated"
  | "label_scan_rejected"
  | "sample_skipped"
  | "tube_placed"
  | "tube_undone"
  | "scan_repeated"
  | "scan_rejected"
  | "sample_finished"
  | "sample_reopened"
  | "sample_returned"
  | "sample_return_undone"
  | "note_added";

/** A logged event as clients receive it. */
export interface LogEvent {
  id: number;
  version: number;
  at: string;
  clientAt: string | null;
  actorName: string | null;
  actorRole: string | null;
  type: EventType;
  batchNumber: number | null;
  sampleId: string | null;
  newId: string | null;
  tube: number | null;
  data: Record<string, unknown>;
}
