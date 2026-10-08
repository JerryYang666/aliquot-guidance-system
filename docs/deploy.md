# Deploying

Three pieces, in this order: the database, the relay on AWS, then the app on
Vercel. The app works without the relay (screens poll every 2 seconds), so
the relay can also come last.

```
phones / laptops ──HTTPS──▶ Vercel (Next.js) ──▶ Postgres
        ▲                         │
        └──── wss ── relay (EC2, Caddy TLS) ◀── HTTPS publish
```

## 1. Postgres

Any Postgres 14 or newer. Apply the migrations once each, in order:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0001_init.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0002_admin_passkeys.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0003_participant_presence.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0004_job_archived.sql
```

Later migrations are numbered files in `migrations/`, applied the same way.
There is no migration runner.

Each Vercel function instance holds up to 5 connections. If the database
limits connections tightly, give Vercel a pooled connection string (RDS
Proxy, PgBouncer, or the provider's pooler). Hosted databases are reached
over TLS automatically; for a local database add `?sslmode=disable`.

### Seeding a job from a workbook

Jobs are normally created in the app (**Create a job**). To create one
directly in the database instead:

```sh
npm ci
npm run --silent seed-sql -- Aliquot_batch_sheets.xlsx --name "Aliquot batches" --by "Your name" > job.seed.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f job.seed.sql
```

The script prints the job code. `--silent` keeps npm's own banner out of
the SQL. `--code ABCDEFGH` chooses a code (8 letters, no I, L or O). The SQL contains the lab's sample data: keep it out of the
repository (`*.seed.sql` is gitignored).

## 2. Secrets

Generate two secrets, each at least 32 characters:

```sh
openssl rand -base64 48   # APP_SECRET: signs operators' session tokens
openssl rand -base64 48   # RELAY_SECRET: shared by the app and the relay
```

Changing `APP_SECRET` signs everyone out: operators join again with the job
code, admins sign in again with their passkey. Nothing is lost.

## 3. Relay on AWS (EC2)

The relay is a small Go program (`realtime/`). CI builds its container for
amd64 and arm64 and, on every push to `main` (after the relay's tests
pass), publishes it to GitHub's container registry as
`ghcr.io/jerryyang666/aliquot-guidance-system/realtime`, tagged `latest`
and with the commit's short SHA. The host only pulls it; no build tools or
registry login are needed there. Caddy sits in front and obtains a Let's
Encrypt certificate on its own.

1. Launch a small instance (t4g.nano or t3.micro is plenty; the image runs
   on both) with Amazon Linux 2023 or Ubuntu. Attach an Elastic IP.
2. Security group: allow inbound TCP 80 and 443 from anywhere (80 is
   needed for the certificate), and SSH from your address only.
3. DNS: point an A record such as `relay.example.org` at the Elastic IP.
4. On the instance, install Docker with the compose plugin and Git, then:

   ```sh
   git clone https://github.com/JerryYang666/aliquot-guidance-system.git
   cd aliquot-guidance-system/deploy/relay
   cp .env.example .env    # set RELAY_DOMAIN, RELAY_SECRET, ALLOWED_ORIGINS
   docker compose up -d
   ```

5. Check it: `curl https://relay.example.org/health` returns
   `{"jobs":0,"ok":true,"sockets":0}`.

The first time the image is published, check that the package is public:
GitHub → the repository → Packages → `realtime` → Package settings →
Change visibility → Public. A new container package can start out private
even in a public repository, and the host's pull then fails with
"unauthorized".

To update: `git pull && docker compose up -d`. Compose pulls the newest
`latest` image each time. To pin a version, set `RELAY_TAG` in `.env` to a
commit's short SHA. Restarting the relay is harmless; screens reconnect and
refetch.

## 4. App on Vercel

1. Import the repository in Vercel. The defaults (Next.js, `npm run build`)
   are right; use Node.js 24 (`package.json` pins it with `engines`).
2. Environment variables (Production, and Preview if wanted):

   | Variable             | Value                            |
   | -------------------- | -------------------------------- |
   | `DATABASE_URL`       | The Postgres connection string   |
   | `APP_SECRET`         | From step 2                      |
   | `APP_ORIGIN`         | `https://aliquot.example.org`    |
   | `RELAY_SECRET`       | From step 2, same as the relay's |
   | `RELAY_PUBLIC_URL`   | `wss://relay.example.org`        |
   | `RELAY_INTERNAL_URL` | `https://relay.example.org`      |

   `APP_ORIGIN` is the address people open the app at. Admin passkeys are
   bound to its hostname: admins sign in at this address only, and if the
   hostname changes, every passkey has to be added again.

3. Put the function region near the database (Project → Settings →
   Functions → Region); every action is a short transaction there.
4. Deploy. Set the relay's `ALLOWED_ORIGINS` to the app's URL and run
   `docker compose up -d` on the relay again.

## 5. The first admin

Admins sign in with a passkey at `/admin` and see every job. A passkey is
added through an invite link, and the first link is made here:

```sh
npm run --silent admin-invite-sql -- --origin https://aliquot.example.org > invite.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f invite.sql
```

The script prints the link on the terminal; the SQL holds only its hash.
Open the link within 10 minutes of applying the SQL (`--minutes 30` allows
longer), enter your name and add a passkey. The link works once. After
that, make invite links for other admins, or for your other devices, on
the admin page. If every passkey is ever lost, run this again.

## 6. Check it end to end

1. Open the app, create a job from the workbook, and join it from two
   devices: a laptop as Puller and a phone as Aliquoter.
2. The header of each station shows a green **Live** dot. **Polling**
   means the relay is not reachable: check `RELAY_*` on Vercel, DNS, the
   security group and `docker compose logs`.
3. Press Space on the laptop. The phone shows the tube as pulled within a
   moment.
4. On the phone, tap **Start camera** and allow it. Scan a printed label.
5. **Download Excel** from the station menu and check the log sheet.

## Phones

- The camera needs HTTPS, which Vercel provides. iOS Safari asks for camera
  permission each session.
- Screens are kept awake with the Screen Wake Lock API (iOS 16.4+, Chrome
  on Android). The header shows a sun when it is active; if it shows a moon,
  tap the screen once.
- Small Data Matrix codes need light and focus. Hold the label 10–15 cm
  from the lens; use the zoom button (where offered) instead of moving
  closer, and the torch in dim light.
