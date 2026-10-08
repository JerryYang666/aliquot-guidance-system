# Aliquot guidance system — design

A multi-device, real-time guide for splitting each source sample into three
labeled aliquot tubes. Three operators work as a pipeline, each with a screen
(laptop or phone) that stays in sync with the others. Every action lands in an
append-only log with server timestamps to the microsecond.

## The physical process

A **job** is one aliquot workbook: about 1,000 source samples split into
**batches** of up to 100. Each batch fills three destination boxes that share
the batch's box number — e.g. batch 1 fills _Ship 1_, _Keep2 1_ and _Keep3 1_.
Each sample gets a new ID (`S0066`) and a fixed **slot** (`G6`). Its three
aliquot tubes are labeled `S0066-1`, `S0066-2` and `S0066-3`, and each goes to
the same slot in its own set's box: `-1` → Ship, `-2` → Keep2, `-3` → Keep3.
Destination boxes are 10×10, rows A–H, J, K (no I), columns 1–10.

Work follows the **pull list** of each batch, which is sorted by where the
source tubes are stored, to save freezer trips. The three roles:

| Role                       | Does                                                                                                                                                                                   | Confirms with                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Puller** (operator 1)    | Finds the next source tube in the freezer, hands it to the aliquoter. Later returns aliquoted source tubes to their positions.                                                         | `Space` / `→` = pulled. `Enter` = returned. |
| **Labeler** (operator 3)   | At the same time, finds the three printed labels for that sample and sticks them on three empty tubes; hands them to the aliquoter.                                                    | `Space` / `→` = labeled.                    |
| **Aliquoter** (operator 2) | Checks the source tube's original ID against the screen, pipettes, then holds each new tube to the phone camera. Each scan confirms that tube and shows which box and slot it goes in. | Data Matrix scan (camera always on).        |

The puller and labeler run one sample ahead of the aliquoter. Nobody needs to
touch the screen during normal flow; buttons exist for exceptions.

One person can work several roles by opening one browser tab per role.

## Jobs, codes, and identity — no accounts

The home page offers **Create a job** or **Join a job**.

- **Create**: upload the workbook, review the parsed summary (batches, sample
  counts, low-volume tubes, any warnings), confirm the three destination set
  names, and get a **job code**: 8 letters from an alphabet without `I`, `L`,
  `O` (shown as `ABCD-EFGH`; typing ignores case, spaces and dashes). The
  create screen also shows a QR code and link (`/j/ABCDEFGH`) so phones join
  by pointing the camera at it. 23⁸ ≈ 7.8·10¹⁰ codes make guessing
  impractical; the code is the only gate, by design.
- **Join**: enter the code, your **name**, the **batch**, and a **role**
  (Puller, Labeler, Aliquoter, or Overview). The join is logged. The server
  returns a signed participant token (HS256, `APP_SECRET`) kept in the tab's
  `sessionStorage`, so each tab is its own station and every action is
  attributed to the name given at join. The name is remembered in
  `localStorage` to prefill the next join.

## Pipeline rules

Within a batch, the **queue order** is the pull-list order, except that
samples someone skipped ("can't find it") move to the end, in the order they
were skipped.

- **Puller's next** = first sample in queue order not yet pulled.
- **Labeler's next** = first sample in queue order not yet labeled.
- **Aliquoter's ready list** = samples that are pulled **and** labeled but
  not yet finished, in queue order. The aliquoter's current sample is the head
  of that list unless they tap another one.
- **Return list** (puller) = finished samples not yet returned, oldest first.

Each sample has three tubes, each `pending`, `placed` (scanned), or
`not_filled`. A sample is **finished** when no tube is pending: either all
three were scanned, or the aliquoter pressed **Finish sample**, which marks
the rest `not_filled` (used for low-volume tubes or spills; what to do is the
operator's call, and they can add a note).

### What a scan does

The scanned text must be `<new ID>-<1|2|3>` for a sample in this job.

| Situation                                                                      | Result                                                                                                                                              |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tube already placed                                                            | Shows its destination again (logged as a repeat).                                                                                                   |
| Label belongs to the aliquoter's current sample                                | **Accepted**: tube placed; screen shows e.g. `KEEP2 · box 1 · G6`. Third tube finishes the sample and the screen advances to the next ready sample. |
| Aliquoter has no current sample (waiting) and the label's sample is unfinished | **Accepted**, and the sample becomes current. If it was not marked pulled/labeled, that is recorded as implied by the scan.                         |
| Label belongs to a different sample                                            | **Rejected** — red screen, error tone, message naming both samples. Logged.                                                                         |
| Unknown label, or a sample in another batch                                    | **Rejected** and logged.                                                                                                                            |

The phone computes the destination locally from its synced state and shows it
instantly; the server's answer (normally within a few hundred ms) confirms or
overturns it. Identical decodes are debounced for 2.5 s so a tube held in
front of the camera is not logged repeatedly.

### Low-volume tubes

Volume notes from the workbook (`Low`, `Very low`, …) appear as a warning badge
on all three roles' screens for that sample. The system does not enforce
anything; the aliquoter scans whichever tubes they fill and finishes the
sample, optionally with a note.

### Corrections

Corrections are new log entries that reverse an earlier one; nothing is
edited or deleted.

- Puller: undo last pull (`←`) while no tube of that sample is placed; undo
  a return; skip a sample (`S`).
- Labeler: undo last label (`←`) while no tube is placed; skip a sample.
- Aliquoter: undo a tube placement; reopen a finished sample.
- Anyone: add a note to a sample.

## Data model (Postgres)

`migrations/0001_init.sql` creates:

- `jobs` — code, name, destination set names, `version` (the job's sequence
  counter), creator name.
- `batches` — number, destination box number, title.
- `samples` — the pull list row (source box, location, position, original
  ID, new ID, slot, volume note, pull order) plus current state: pulled /
  labeled / finished / returned timestamps and who, skip order, notes.
- `tubes` — one row per (sample, 1..3): status, timestamp, who.
- `participants` — one row per join: name, role, batch, user agent, last seen.
- `events` — **the append-only log**: server time (`clock_timestamp()`,
  microseconds), device time, job version, participant and name, role, event
  type, batch, sample, new ID, tube, JSON details. A trigger rejects every
  `UPDATE`, `DELETE` and `TRUNCATE` on this table.

`samples` and `tubes` are a projection of the log, written in the same
transaction as the events that change them, so they can never disagree.

### Actions and ordering

All changes go through `POST /api/jobs/<code>/actions`. Each action runs in
one transaction that locks the job row, re-validates against current state,
updates the projection, bumps the job version, and appends its events.
Locking the job row serializes actions within a job, which is what makes the
pipeline rules race-free (two pullers can't pull the same tube). Each action
carries a client-generated id; a retry of the same id returns the original
outcome instead of acting twice, so flaky phone connections can't
double-log.

Logged event types: `job_created`, `participant_joined`, `participant_left`,
`sample_pulled`, `sample_labeled`, `sample_skipped`, `tube_placed`,
`scan_repeated`, `scan_rejected`, `sample_finished`, `sample_returned`,
`note_added`, and an `*_undone` / `sample_reopened` entry for each reversal.

## Real-time sync

```
 browser ──HTTPS──▶ Next.js on Vercel ──SQL──▶ Postgres
    ▲                     │
    │ WebSocket           │ POST /publish (after commit)
    └──── Go relay on AWS ◀┘
```

- **The server is the authority.** Browsers never publish to the relay; they
  call the actions API. After the transaction commits, the route (via
  `after()`) posts the change — job version, updated samples, new events — to
  the relay, which fans it out to every socket on that job.
- **The relay** (`realtime/`) is a small Go service modeled on moodio's,
  minus everything this app does not need (no per-topic permission callback,
  no federation): one job topic per socket, authenticated by a 60-second
  ticket minted by the app (`POST /api/jobs/<code>/realtime-ticket`), HS256
  with a secret shared with the app. The app and relay live on different
  domains, so a ticket replaces moodio's shared cookie.
- **Clients apply changes in version order.** Out-of-order messages wait in a
  buffer; a gap that does not fill within a second, or any reconnect, triggers
  a fresh snapshot fetch. A screen therefore can't silently drift.
- **Fallback**: if the relay is unreachable or not configured, screens poll a
  cheap version endpoint every 2 s and refetch on change. The app works fully
  without the relay, only slower to update.
- **Presence**: each screen heartbeats every 30 s; the job's "online" list is
  the participants seen in the last 75 s.

## Phone and browser details

- **Screen stays on**: Screen Wake Lock API on every operator screen,
  re-acquired when the tab becomes visible again.
- **Scanning**: rear camera at up to 1080p, a center crop decoded several
  times a second with `zxing-wasm` (ZXing-C++ in WebAssembly, Data Matrix
  only). The `.wasm` file is self-hosted. iOS Safari has no native
  `BarcodeDetector`, which is why it isn't used. A USB/Bluetooth scanner that
  types the label and presses Enter also works, as does typing the label.
- **Feedback**: large color-coded destination banner, a success tone and an
  error buzz (Web Audio, unlocked by the "Start camera" tap), and vibration
  where supported.

## Supervision and export

- **Overview** role: a live 10×10 grid of the batch showing each slot's state
  and its three tubes, progress counts, who is online, and a live activity
  feed.
- **Log** page: the full event log, filterable, with millisecond timestamps.
- **Export**: an `.xlsx` with one sheet per batch (the pull list with who
  did what and when for every step) and the complete event log; the log is
  also available as CSV.

## Seeding the first job

The workbook's sample data does not go in the repository.
`scripts/workbook-to-seed-sql.ts` turns a workbook into a standalone SQL file
that creates the job (and prints its code); it is run locally and the output
applied with `psql`. Creating a job through the web UI does the same thing.

## Out of scope

Accounts and permissions beyond the job code; photos; offline operation
beyond retrying; editing a job's pull list after creation.
