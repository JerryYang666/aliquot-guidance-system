import type { OnlineParticipant, StateResponse } from "@/lib/api-types";
import type { RunResult } from "@/lib/client/use-actions";
import type { Action } from "@/lib/pipeline/actions";
import type { LogEvent, Sample } from "@/lib/pipeline/types";

/** What every role's view receives from the station. */
export interface ViewProps {
  snapshot: StateResponse;
  samples: Sample[];
  feed: LogEvent[];
  online: OnlineParticipant[];
  /** Sends an action; failures are already shown to the operator. */
  perform: (action: Action) => Promise<RunResult>;
  busy: boolean;
  /** False while a dialog is open, so typing there does not trigger shortcuts. */
  hotkeysEnabled: boolean;
  setDialogOpen: (open: boolean) => void;
}
