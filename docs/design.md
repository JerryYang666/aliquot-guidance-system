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

| Role                       | Does                                                                                                                                                                                                                                              | Confirms with                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Puller** (operator 1)    | Finds the next source tube in the freezer, hands it to the aliquoter. Later returns aliquoted source tubes to their positions.                                                                                                                    | `Space` / `→` = pulled. `Enter` = returned.       |
| **Labeler** (operator 3)   | At the same time, finds the three printed labels for that sample and sticks them on three empty tubes; hands them to the aliquoter.                                                                                                               | `Space` / `→` = labeled, or scan all three tubes. |
| **Aliquoter** (operator 2) | Checks the source tube's original ID and the new tubes' labels against the screen, pipettes, then holds one of the new tubes to the phone camera. The scan confirms the sample and shows its slot, where all three tubes go, each in its own box. | Data Matrix scan (camera always on).              |

The puller and labeler run one sample ahead of the aliquoter. Nobody needs to
touch the screen during normal flow; buttons exist for exceptions.

One person can work several roles by opening one browser tab per role.

**Working alone.** One person can also do a batch alone, as its Aliquoter
and nothing else: they pull each source tube and stick on its labels
themselves, then only scan. The Aliquoter is the last step, so a scan
stands for the steps before it. With no sample under way, a scan of any
tube in the batch records its sample as pulled and labeled, logged as
implied by the scan, and places all of its tubes (see
[What a scan does](#what-a-scan-does)). The screen shows the slot and the
boxes, and the next scan can be of any other sample: samples go in any
order. Returning the source tube is still the Puller's to confirm, so
working alone, finished samples stay on the return list.

## Jobs, codes, and identity — no accounts

The home page offers **Create a job** or **Join a job**. Operators have no
accounts; only admins sign in (see [Admins](#admins)).

- **Create**: upload the workbook, review the parsed summary (batches, sample
  counts, low-volume tubes, any warnings), confirm the three destination set
  names, and get a **job code**: 8 letters from an alphabet without `I`, `L`,
  `O` (shown as `ABCD-EFGH`; typing ignores case, spaces and dashes). The
  create screen also shows a QR code and link (`/j/ABCDEFGH`) so phones join
  by pointing the camera at it. The same QR code is one tap away later:
  **QR code to join** on the join screen and in every station's header.
  23⁸ ≈ 7.8·10¹⁰ codes make guessing impractical; the code is the only
  gate, by design.
- **Join**: enter the code, your **name**, the **batch**, and a **role**
  (Puller, Labeler, Aliquoter, or Overview). Pressing Start first shows the
  role's instructions, a few plain steps, every time: in English, or in
  Chinese at the tap of a button (the device remembers which). Start stays
  off for 3 seconds so they are read. A batch has one Puller, one
  Labeler and one Aliquoter at work at a time. Nobody is turned away: the
  join screen says who has a role, and someone who joins it anyway waits.
  Their station is locked, says who has the role and to ask them to leave,
  and opens by itself when that person has gone (see
  [Real-time sync](#real-time-sync)). Overview is open to any number of
  people. The join is logged. The server returns a signed participant token
  (HS256, `APP_SECRET`) kept in the tab's `sessionStorage`, so each tab is
  its own station and every action is attributed to the name given at join.
  The name is remembered in `localStorage` to prefill the next join.

## Pipeline rules

Within a batch, the **queue order** is the pull-list order, except that
samples someone skipped ("can't find it") move to the end, in the order they
were skipped.

- **Puller's next** = first sample in queue order not yet pulled.
- **Labeler's next** = first sample in queue order not yet labeled.
- **Aliquoter's ready list** = samples that are pulled **and** labeled but
  not yet finished, in queue order. A source tube can reach the aliquoter
  before its labels are on, so the screen also lists the samples that are
  pulled but not yet labeled, by original ID. The aliquoter's current sample
  is the head of the ready list, or with nothing ready the first pulled one,
  unless they tap another one. It is the source tube on the screen, which
  every scan is checked against; there is none only when no source tube of
  the batch is out (pulled, not finished).
- **Return list** (puller) = finished samples not yet returned, oldest first.

Each sample has three tubes, each `pending`, `placed`, or `not_filled`. The
three go in the same slot, each in its own set's box, so scanning one of
them places them all. A sample is **finished** when no tube is pending:
either one of its tubes was scanned, or the aliquoter pressed **Finish
sample**, which marks the rest `not_filled` (used for low-volume tubes or
spills; what to do is the operator's call, and they can add a note).

### What a scan does

The scanned text must be `<new ID>-<1|2|3>` for a sample in this job.

| Situation                                                     | Result                                                                                                                                                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tube already placed                                           | Shows its destination again (logged as a repeat).                                                                                                                                                                               |
| Label belongs to the aliquoter's current sample               | **Accepted**: the tube is placed, and the sample's other pending tubes with it, which finishes the sample. The screen shows the slot and the boxes, e.g. `SHIP KEEP2 KEEP3 · box 1 · G6`, and advances to the next source tube. |
| No source tube is out, so the aliquoter has no current sample | **Accepted** the same way, for any sample of the batch, in any order. If it was not marked pulled/labeled, that is recorded as implied by the scan.                                                                             |
| Label belongs to a different sample than the current one      | **Rejected** — red screen, error tone, message naming both samples. Logged.                                                                                                                                                     |
| Unknown label                                                 | **Rejected** and logged.                                                                                                                                                                                                        |

So within a batch, the one check is against the Puller's tube: the source
tube they handed over is on the screen, labeled yet or not, and a scan must
carry its new ID. With nobody pulling, no tube is out, and the Aliquoter
scans in any order.

Each tube placed is logged as `tube_placed`; one placed along with the
scanned tube names that tube's label (`withLabel`), so the log keeps which
one was scanned. Scanning the other tubes afterwards is not needed; it
shows where they went, as a repeat.

A tube of **another batch** depends on what the aliquoter's screen shows:

| Situation                                                                                  | Result                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A source tube of this batch is out (pulled, not finished): the screen shows an original ID | **Rejected**: red, error tone, names both batches. Logged.                                                                                                                                               |
| No source tube of this batch is out, so nothing on the screen to check the tube against    | **Accepted** as if the station were on that batch and waiting, and the station **moves** there at once. A warning pop-up (amber, gone after 4 s) says the tube goes in that batch's box, not this one's. |
| As above, but someone else is that batch's Aliquoter                                       | **Rejected** (red), naming them. Logged.                                                                                                                                                                 |
| As above, but the tube is already placed                                                   | Shows its destination again; the station stays.                                                                                                                                                          |

Moving is logged (`participant_moved`, from and to which batch, by which
label) in the same transaction as the placement. Like joining the batch, the
station takes its place in line for the role from then (see
[Real-time sync](#real-time-sync)), and the screen carries on with a new
token for that batch. Only an Aliquoter moves; a Labeler's scan of another
batch's tube is always rejected.

The phone computes the destination locally from its synced state and shows it
instantly; the server's answer (normally within a few hundred ms) confirms or
overturns it. A tube of another batch is not in the phone's state, so for it
the screen waits for the server. Identical decodes are debounced for 2.5 s so
a tube held in front of the camera is not logged repeatedly.

### Labeler scans (optional)

The labeler can confirm with `Space` as before, or scan each freshly labeled
tube (camera, a USB scanner, or by typing). Each scan is checked against the
sample on the labeler's screen and stored on the tube (`labelScannedAt` /
`labelScannedBy` in its JSON), so a reload keeps the progress:

| Situation                                                     | Result                                                                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Label of the sample on screen                                 | **Recorded**; the tube shows as scanned. The last of the sample's labels marks it labeled (as `Space` would) and the screen moves to the next sample. |
| Label already scanned                                         | Shown as a repeat (logged).                                                                                                                           |
| Label of another sample, while the one on screen is unlabeled | **Rejected** — red, error tone, names the expected sample. Logged.                                                                                    |
| Unreadable, unknown, wrong tube number, another batch         | **Rejected** and logged, by the same checks as the aliquoter's scans.                                                                                 |

Scanning is never required: a sample is labeled by `Space` or by its last
scan, whichever comes first. Undoing a sample's labels clears its scans.
Letter shortcuts ignore Shift, so a scanner typing `S0066-1` does not trigger
`S` (skip).

### Low-volume tubes

Volume notes from the workbook (`Low`, `Very low`, …) appear as a warning badge
on all three roles' screens for that sample. The system does not enforce
anything. A scan places all of the sample's pending tubes, so a tube that
could not be filled is set aside first: the aliquoter taps it on the screen
(`tube_not_filled`), then scans one of the others, which places only those.
Forgotten, it is put right afterwards on Overview: undo the tube, then
finish the sample. With nothing filled, **Finish sample** records all three
as not filled, optionally with a note.

### Corrections

Corrections are new log entries that reverse an earlier one; nothing is
edited or deleted.

- Puller: undo last pull (`←`) while no tube of that sample is placed; undo
  a return; skip a sample (`S`).
- Labeler: undo last label (`←`) while no tube is placed; skip a sample.
- Aliquoter: mark a tube not filled before the scan; undo a tube placement
  or a tube marked not filled; reopen a finished sample.
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

`migrations/0002_admin_passkeys.sql` adds `admin_passkeys` and
`admin_invites` (see [Admins](#admins)).
`migrations/0003_participant_presence.sql` adds to `participants` when a
station said goodbye and since when it has been in line for its role (see
[Real-time sync](#real-time-sync)). `migrations/0004_job_archived.sql` adds
to `jobs` when the job was archived (see [Admins](#admins)).

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
`participant_moved`, `sample_pulled`, `sample_labeled`, `sample_skipped`, `label_scanned`,
`label_scan_repeated`, `label_scan_rejected`, `tube_placed`, `tube_not_filled`,
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
  the participants seen in the last 75 s. A page that is closed or reloaded
  does not wait to be missed: it sends a goodbye as it goes, and counts as
  offline 5 seconds later unless it is back by then (a reload is). The 75 s
  are the fallback for a station that vanishes without a word. None of this
  is logged; only joining and leaving are.
- **Who holds a role**: of several people online in the same working role on
  a batch, the one who has been there longest holds it and the others wait
  with their stations locked. "Longest" counts from joining, and again from
  each return after being offline, so someone who drops out and comes back
  waits behind whoever took over. Presence lives in the database, not in the
  relay: the relay only tells screens to ask again, so the rule holds
  without it and survives its restarts.

## Phone and browser details

- **Screen stays on**: Screen Wake Lock API on every operator screen,
  re-acquired when the tab becomes visible again.
- **Top bar**: every station's header leads with its role, batch and box in
  large type. On a phone it slides away while the page is scrolled down and
  returns on the first scroll back up, so the camera and the tube keep the
  screen.
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

## Admins

A job's code is its only gate, and nothing in the app lists the jobs. Admins
are the exception: they sign in at `/admin` and see every job.

- **Passkeys only.** An admin signs in with a passkey (WebAuthn): no
  password and no username. `admin_passkeys` holds each passkey's public
  key and the name its owner gave. A passkey is bound to the site's
  hostname (`APP_ORIGIN`) and works nowhere else, and it must verify its
  owner (fingerprint, face or PIN) every time.
- **By invitation.** There is no sign-up. A passkey is added by opening an
  invite link, `/admin/invite/<token>`, entering a name and creating the
  passkey, which also signs its owner in. A link works once and expires 10
  minutes after it is made. Opening it does not spend it; adding the
  passkey does. `admin_invites` stores only the SHA-256 of the token. Any
  admin can make a link on the admin page. The first link comes from
  `scripts/admin-invite-sql.ts` (see deploy.md), which is also the way back
  in if every passkey is lost.
- **Sessions.** Signing in sets an HttpOnly, SameSite=Lax cookie holding a
  token (HS256, `APP_SECRET`) that names the passkey and lasts 12 hours.
  Every admin request looks the passkey up again, so removing a passkey
  ends its sessions at once. While a passkey prompt is open, its challenge
  waits in a second signed cookie (5 minutes); the server stores nothing
  for it.
- **Removing an admin.** The admin page lists the passkeys and who invited
  each. An admin can remove any passkey except the one they are signed in
  with, so removing passkeys never leaves the site without an admin. A
  removed passkey stays in the table, marked revoked.
- **One address.** Requests to `/api/admin` from a browser at any other
  origin are refused, because a passkey made there would not work here.

The admin page lists every job: code, creator, how many samples are
aliquoted, how many people are online, and when it was last active.

**Archive** closes a job to new people. A job's code works for as long as
the job exists, so a finished job could otherwise still be joined by anyone
who kept its code or QR code. Once a job is archived, joining it is refused
and its join page says so. The people already on it carry on working, and
their screens show that the job is archived: the QR button goes, and
leaving is marked as final, since they could not join again. **Unarchive**
opens the job again. Both are logged in the job's own event log under the
admin's name, and archived jobs are listed after the open ones.

**Watch** opens one job live: every batch's progress and who is on it, with
one batch opened up as the Overview role sees it (the box grid, progress,
people online, activity), following whichever batch people are working on
until the admin picks another. The admin has not joined the job. Watching
writes no event, does not appear on the job's online list, and cannot change
a sample; to fix something, join the job as Overview like anyone else. The
screen stays in sync the way a station's does (see
[Real-time sync](#real-time-sync)), through its own endpoints under
`/api/admin/jobs/<code>`, except that it holds every batch's samples rather
than one batch's, and its snapshot brings the latest events with it.

## Seeding the first job

The workbook's sample data does not go in the repository.
`scripts/workbook-to-seed-sql.ts` turns a workbook into a standalone SQL file
that creates the job (and prints its code); it is run locally and the output
applied with `psql`. Creating a job through the web UI does the same thing.

## Out of scope

Accounts and permissions for operators beyond the job code; photos; offline operation
beyond retrying; editing a job's pull list after creation.
