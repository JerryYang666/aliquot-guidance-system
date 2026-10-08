# Realtime relay

Pushes committed job changes to every screen on that job. The Next.js app is
the authority: it writes each change to Postgres and then posts it here, and
the relay forwards it to the job's sockets. Browsers never publish. The relay
keeps nothing but in-memory socket membership, so restarting it is harmless:
screens reconnect, refetch their state, and fall back to polling meanwhile.

| Endpoint | Who calls it | Auth |
|---|---|---|
| `GET /ws?ticket=…` | Browsers | One-minute HS256 ticket from `POST /api/jobs/<code>/realtime-ticket` (audience `ags-relay`, claim `job`) |
| `POST /publish` `{job, message}` | The app, after a commit | Bearer HS256 token (audience `ags-relay-publish`) |
| `GET /health` | Load balancer / monitoring | None; returns socket and job counts |

On connect the relay sends `{"type":"hello","job":…}`; screens fetch their
snapshot after it, so nothing published in between is missed. It pings every
25 s and drops sockets silent for 60 s or too slow to keep up.

## Configuration

| Variable | Meaning |
|---|---|
| `RELAY_SECRET` | Shared with the app (same value as the app's `RELAY_SECRET`), at least 32 characters. |
| `PORT` | Listen port, default `8081`. |
| `ALLOWED_ORIGINS` | Optional comma-separated browser origins, e.g. `https://aliquot.example.org`. Empty allows any origin; the ticket is the real gate. |

## Develop

```sh
go test -race ./...
RELAY_SECRET=… go run .
```

Deployment (Docker + TLS on an EC2 host) is in `docs/deploy.md`.
