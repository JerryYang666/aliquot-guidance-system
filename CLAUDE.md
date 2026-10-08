# CLAUDE.md

Aliquot Guide: a real-time, multi-device guide for aliquoting (see
`README.md`, `docs/design.md`, `docs/deploy.md`).

## Keep the repository clean

This repository started with zero lint warnings and fully formatted code.
Keep it that way:

- Before every commit, run `npm run check` (typecheck, ESLint with
  `--max-warnings 0`, Prettier check, tests). CI fails otherwise.
- `npm run format` (Prettier) is safe to run on the whole tree; the tree is
  already formatted, so it only touches what you changed.
- Never disable a lint rule to get past it. Fix the code; an
  `eslint-disable` needs a comment saying why it is right.
- Go code in `realtime/`: `gofmt`, `go vet ./...`, `go test -race ./...`.
- Commit each verified piece of work as you go.

## Rules that keep the system correct

- Every change to a sample goes through `POST /api/jobs/<code>/actions`:
  the pure rule in `lib/pipeline/actions.ts`, applied inside the job-locked
  transaction in `lib/server/actions.ts`, which appends the events in the
  same transaction. Never update `samples` any other way.
- `events` is append-only (database triggers enforce it). Corrections are
  new events.
- A new action type needs: the rule and its tests, the request schema in
  `lib/server/actions.ts`, an event type, and a line in
  `lib/client/describe-event.ts`.
- Screens apply changes in job-version order (`lib/client/sync-state.ts`);
  anything that changes state must bump the version through `commitChange`.

## Database

- Migrations are hand-written `migrations/NNNN_name.sql`, applied by hand
  with psql in order. Start each with a comment saying why it exists.
  Mirror every change in `lib/db/schema.ts`.
- Lab data (workbooks, `*.seed.sql`) never goes in the repository.

## Next.js 16

APIs differ from older versions (async `params`, `proxy.ts`, flat ESLint
config). Read the relevant guide in `node_modules/next/dist/docs/` before
writing framework code.
