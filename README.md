# Aliquot Guide

Real-time guidance for splitting source samples into labeled aliquot tubes
with a team of three, each at their own screen:

- **Puller**: takes each source tube from the freezer, following the pull
  list, and puts it back afterwards.
- **Labeler**: at the same time, finds the sample's three printed labels and
  sticks them on new tubes.
- **Aliquoter**: checks the source tube, pipettes, and holds each new tube
  to a phone camera. The Data Matrix scan confirms the tube and shows which
  box and slot it goes in.

Screens stay in sync within a fraction of a second, work by keyboard and
camera so gloved hands rarely touch them, and every action lands in an
append-only log with millisecond times. There are no accounts: a job is
created from the lab's aliquot workbook and joined with its 8-letter code.

Read [docs/design.md](docs/design.md) for how it works and
[docs/deploy.md](docs/deploy.md) to run it.

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind CSS 4, on Vercel
- Postgres via Drizzle ORM; hand-written SQL migrations in `migrations/`
- A small Go WebSocket relay (`realtime/`) on AWS for live updates; the app
  falls back to polling without it
- Data Matrix decoding in the browser with zxing-wasm

## Develop

Needs Node.js 24, Postgres 14+ and, for the relay, Go 1.24.

```sh
npm install
cp .env.example .env.local      # set DATABASE_URL and APP_SECRET; leave RELAY_* empty to poll
psql "<your DATABASE_URL>" -f migrations/0001_init.sql
npm run dev                     # http://localhost:3000
```

To run with live updates, start the relay and set `RELAY_*` in `.env.local`
(`RELAY_PUBLIC_URL=ws://localhost:8081`, `RELAY_INTERNAL_URL=http://localhost:8081`):

```sh
cd realtime && RELAY_SECRET=<same as .env.local> go run .
```

The camera needs a secure context: `localhost` works, and a phone needs the
deployed HTTPS site (or a tunnel).

## Checks

CI runs all of these on every push; keep them green.

```sh
npm run check        # typecheck, lint (zero warnings), format check, tests
npm run build
cd realtime && gofmt -l . && go vet ./... && go test -race ./...
```

Integration tests run the actions layer against Postgres when
`TEST_DATABASE_URL` points to a database they may wipe:

```sh
TEST_DATABASE_URL=postgres://localhost/ags_test npm test
```

## Layout

| Path                  | What                                                                     |
| --------------------- | ------------------------------------------------------------------------ |
| `app/`                | Pages (home, create, join, station, log) and API routes under `app/api/` |
| `components/station/` | The four role screens and the station shell                              |
| `components/scanner/` | Camera and keyboard-wedge scanning                                       |
| `lib/pipeline/`       | Pure rules: queue order, actions, scan decisions, labels, box layouts    |
| `lib/server/`         | Server side: tokens, the actions transaction, exports, relay publishing  |
| `lib/client/`         | Browser side: API calls, sync in version order, wake lock, feedback      |
| `lib/workbook/`       | Reading and validating aliquot workbooks                                 |
| `migrations/`         | SQL schema, applied by hand in order                                     |
| `realtime/`           | The Go relay                                                             |
| `deploy/relay/`       | Docker Compose + Caddy for the relay host                                |
| `scripts/`            | `workbook-to-seed-sql.ts` (seed a job without the UI)                    |
