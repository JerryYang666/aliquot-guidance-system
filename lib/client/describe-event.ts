import { labelFor } from "@/lib/pipeline/labels";
import { ROLE_LABELS, type LogEvent, type Role } from "@/lib/pipeline/types";

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** One line saying what an event recorded, for the activity feed and the log. */
export function describeEvent(e: LogEvent): string {
  const id = e.newId ?? "";
  const tube = e.newId && e.tube ? labelFor(e.newId, e.tube) : id;
  const d = e.data;
  switch (e.type) {
    case "job_created":
      return `created the job (${String(d.samples)} samples in ${String(d.batches)} batches)`;
    case "job_archived":
      return "archived the job: nobody new can join it";
    case "job_reopened":
      return "reopened the job: people can join it again";
    case "participant_joined":
      return `joined as ${ROLE_LABELS[e.actorRole as Role] ?? e.actorRole} on batch ${e.batchNumber}`;
    case "participant_left":
      return "left";
    case "sample_pulled":
      return d.impliedByScan
        ? `pulled ${id} (recorded by scan)`
        : `pulled ${id}`;
    case "sample_pull_undone":
      return `undid the pull of ${id}`;
    case "sample_labeled":
      if (d.byScan) return `labeled ${id} (all labels scanned)`;
      return d.impliedByScan
        ? `labeled ${id} (recorded by scan)`
        : `labeled ${id}`;
    case "sample_label_undone":
      return `undid the labels of ${id}`;
    case "label_scanned":
      return `checked label ${tube}`;
    case "label_scan_repeated":
      return `scanned label ${tube} again`;
    case "label_scan_rejected":
      return `label scan rejected: ${str(d.message)}`;
    case "sample_skipped":
      return `skipped ${id} for now`;
    case "tube_placed":
      return `placed ${tube} → ${str(d.set)} box ${String(d.box)} · ${str(d.slot)}`;
    case "tube_undone":
      return `undid ${tube}`;
    case "scan_repeated":
      return `scanned ${tube} again (${str(d.destination)})`;
    case "scan_rejected":
      return `scan rejected: ${str(d.message)}`;
    case "sample_finished": {
      const notFilled = Array.isArray(d.notFilled)
        ? (d.notFilled as number[])
        : [];
      return notFilled.length
        ? `finished ${id}; not filled: ${notFilled.map((n) => `-${n}`).join(", ")}`
        : `finished ${id}`;
    }
    case "sample_reopened":
      return `reopened ${id}`;
    case "sample_returned":
      return `returned ${id} to ${str(d.sourceBox)} ${str(d.position)}`;
    case "sample_return_undone":
      return `undid the return of ${id}`;
    case "note_added":
      return `noted on ${id}: “${str(d.text)}”`;
  }
}

export function isProblem(e: LogEvent): boolean {
  return e.type === "scan_rejected" || e.type === "label_scan_rejected";
}

export function formatTime(iso: string, withMs = false): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour12: false });
  return withMs
    ? `${time}.${String(d.getMilliseconds()).padStart(3, "0")}`
    : time;
}
