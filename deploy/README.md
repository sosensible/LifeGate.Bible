# Deploying to the Intel ZimaOS box behind a Cloudflare Tunnel

Target: self-hosted Nitro **node-server** in a Docker container on x86_64 ZimaOS,
published to the public by `cloudflared`. Public pages only.

## Why Docker and not a systemd service

ZimaOS runs an immutable, read-only root filesystem and installs applications as
Docker containers through its App Store. Hand-placed systemd units and files
dropped onto `/` do not survive OTA updates. A container is the supported unit of
deployment here, so that is what `../Dockerfile` produces.

## Architecture note

`.output/` is **not** architecture-neutral. It once was, and the Dockerfile was
built around that; since accounts were added it carries

```
.output/server/node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

Nitro cannot bundle a native addon, so it externalises `better-sqlite3` and the
compiled binary ships inside the build output. It must match the machine that
runs it on **two** counts:

- **Architecture.** Built on Apple Silicon it is arm64 and will not load on the
  Intel box.
- **C library.** Built on Debian it is glibc and will not load on Alpine. The
  Dockerfile used to build on `node:24-slim` and run on `node:24-alpine`, which
  could not have worked on any machine, whatever the chip.

Both stages are therefore pinned to `--platform=linux/amd64` on a glibc base.

> **`docker buildx build --platform linux/amd64` does not fix this by itself.**
> That flag sets `TARGETPLATFORM`; a stage pinned to `$BUILDPLATFORM` still runs
> native and still produces the laptop's binary. The constant in the Dockerfile
> is what decides.

The consequence: on an amd64 machine the build is free, and on Apple Silicon
`npm ci` runs under QEMU and is slow. **Build in CI** — GitHub's runners are
amd64 natively. See [Build](#1-build).

The container checks this for itself before starting
(`deploy/docker-entrypoint.sh`): if the native module cannot load, it prints one
sentence explaining why and exits, rather than failing deep inside a dependency.

## 1. Build

### In CI — the normal path

Push to `main`. `.github/workflows/image.yml` runs the tests, builds on an
amd64 runner, pushes to GHCR, and then *runs the image* to prove the native
module loads before you ever touch the box.

```
ghcr.io/<owner>/lifegate-church:<version>
```

Make the GHCR package **public once** (package settings → change visibility).
ZimaOS has no registry-login UI, so a public package is what lets the App Store
pull with no credentials and no SSH. The repository itself can stay private;
visibility of the two is independent.

> A public image publishes what is compiled into it. No secrets are baked in —
> every credential arrives as an environment variable at runtime — but the build
> does emit sourcemaps, so the server code is readable by anyone who pulls it.
> Set `nitro.sourceMap: false` before making the package public if that matters.

### Locally — only if you must

```
./deploy/build-image.sh
```

Produces `deploy/out/lifegate-church-<version>.tar`. Requires Docker Desktop
running, and on Apple Silicon it builds `npm ci` under QEMU, so expect it to be
slow. The output is correct — both stages are pinned — just not quick.

### Registry, or save/load?

Both work. The script defaults to save/load because this repo has no remote yet.

**Docker Hub under the `sosapps` account:**

```
docker login
REGISTRY=sosapps ./deploy/build-image.sh
```

That produces and pushes `sosapps/lifegate-church:<version>`; then set `image:`
in `zimaos-compose.yaml` to that same string.

Two caveats before choosing this:

1. **Public vs private.** ZimaOS/CasaOS has no UI for registry credentials, and
   private pulls are a known sore point -- the usual workaround is SSH'ing in and
   running `docker pull` by hand, which the App Store import will not do for you.
   A *public* repo pulls with no credentials and is the frictionless path.
2. **A public image publishes whatever is compiled into it.** See the warning
   below before making this repo public.

**Save/load** (`./deploy/build-image.sh` with no `REGISTRY`) sidesteps both: no
account, no credentials on an immutable OS, nothing published. For a single box
that is updated by hand, this is perfectly reasonable.

### Member data is not in the image

Directory records live in the SQLite database (`DATABASE_PATH`), not in the
build. Keep that file on a mounted volume, outside the image, and never bake a
database into an image you push anywhere.

> All four of the gaps this note used to list are now closed: the database and
> photos sit on a bind mount, `BETTER_AUTH_*` and the mail variables are in the
> app definitions, migrations run at startup, and the native module is built for
> amd64. What remains is a **backup job** — see [Backups](#5-backups).

### Always build for amd64

The classic failure mode is pushing an arm64 image from an Apple Silicon laptop;
it pulls fine and then will not start on the Intel box. Both Dockerfile stages
are pinned to `linux/amd64`, which is the part that actually decides — the CLI
flag alone does not (see [Architecture note](#architecture-note)). The image
checks itself at startup regardless.

Tags are pinned, not `latest`, so ZimaOS never silently swaps versions under you.
Deploying a new build means bumping the version in `package.json`, rebuilding,
and updating `image:` in the compose YAML.

### Hostname and indexing are runtime settings

`/sitemap.xml` and `/robots.txt` are served live, not prerendered. Set these in
the compose file's `environment:` and restart; no rebuild is needed:

- `NUXT_PUBLIC_SITE_URL` -- the public origin (default `https://new.lifegate.bible`)
- `NUXT_PUBLIC_INDEXABLE` -- `false` (default) sends `X-Robots-Tag: noindex` on
  every response and omits the sitemap from robots.txt; set `true` at launch.

## 2. Load onto the box

```
scp deploy/out/lifegate-church-<version>.tar <user>@<zima>:/DATA/
ssh <user>@<zima> 'docker load -i /DATA/lifegate-church-<version>.tar'
```

SSH must be enabled in ZimaOS settings. **Skip this whole step** when the image
came from CI — the App Store pulls it from GHCR, which is the point of building
there: no SSH, no tarball, no manual `docker load`.

## 3. Install the apps

ZimaOS **App Store -> Install a Custom App**, then paste one of:

| Environment | File | Host port | Data |
|---|---|---|---|
| production | `deploy/zimaos-compose.yaml` | **3010** | `/DATA/AppData/lifegate-production/data` |
| staging | `deploy/zimaos-staging.yaml` | **3009** | `/DATA/AppData/lifegate-staging/data` |

Both run the same image; only the environment, the port and the data directory
differ. Fill in the blank values (secrets) in the CasaOS app configuration, not
in these files.

`APP_ENV` is what separates them. Only the exact string `production` unlocks the
real mail transport, so staging cannot email the congregation even if its mail
settings are wrong. Give the two **different** `BETTER_AUTH_SECRET` values, or a
session minted on staging is valid on the real site.

Seed staging from `scripts/seed-demo.ts`. Never copy production's database into
it: members chose who may see their address, birthday and photo, and those
choices do not travel with the file.

Verify on the LAN before touching the tunnel:

```
curl -I http://<zima-ip>:3010/
```

Expect `200`. If the container exits immediately, read its log — a native module
built for the wrong platform says so in one sentence.

### Stewardship bank sync

Stewardship reads bank data from SimpleFIN Bridge. It is optional; without it
the budget still works with manual accounts.

1. In SimpleFIN Bridge, create a setup token for the church's bank connection.
2. On any machine with the repo: `npm run simplefin:claim -- <setup token>`.
   A token works once. The command prints `SIMPLEFIN_ACCESS_URL=...`.
3. Add that line (and `CHURCH_TIME_ZONE=America/Detroit`) to the container's
   environment in the compose file, then restart the app.

The access URL holds credentials: keep it in the environment only, never in the
image or the database. The container checks the bank at 05:00, 11:00, 17:00 and
23:00 (container time), and the Treasurer can check once every 30 minutes from
Stewardship -> Transactions.

### Giving statements by email

Statements are emailed through Cloudflare Email Service's REST API, which also
sends sign-in links in production.

1. In Cloudflare, onboard `lifegate.bible` for Email Sending (or run
   `npx wrangler email sending enable lifegate.bible`).
2. Create an API token with email sending permission.
3. Add to the container's environment, then restart:
   `MAIL_TRANSPORT=cloudflare`, `CLOUDFLARE_ACCOUNT_ID=...`,
   `CLOUDFLARE_EMAIL_API_TOKEN=...`, and `MAIL_FROM` with an address on that domain.

The Cloudflare transport refuses to run unless **`APP_ENV=production`** — not
`NODE_ENV`, which is `production` on staging too and so would have let a
rehearsal mail real members. An unset `APP_ENV` also refuses: a deployment that
does not say what it is sends nothing. Statement PDFs use pdfmake's built-in
fonts, so the image needs no font files.

### Database migrations

**Applied automatically at startup** by `server/plugins/migrate.ts`, before the
first request is served. Drizzle records what it has already run, so a restart
with nothing to do costs a millisecond, and a release carrying a schema change
needs no more than restarting the app.

The image ships the generated `.sql` files, not drizzle-kit. If the migrations
are missing the server refuses to start rather than serving requests against a
schema that was never applied. `SKIP_MIGRATIONS=1` opts out, for the case where
the schema is managed by hand.

Verified from empty: an unpopulated data directory becomes 18 migrations and 33
tables, and the second start is a no-op.

## 4. Point the tunnel at it

Add an ingress rule per public hostname:

```
new.lifegate.bible      -> service: http://<zima-ip>:3010   # production
staging.lifegate.bible  -> service: http://<zima-ip>:3009   # staging
```

At go-live, production's hostname becomes `lifegate.bible`. Change the ingress
rule, `NUXT_PUBLIC_SITE_URL` and `BETTER_AUTH_URL` together and restart — sign-in
links are built from the last of those, so a stale value mails people the old
host.

If `cloudflared` runs as its own container on the same box, add it as a second
app rather than editing `zimaos-compose.yaml` — keeping it out of that file
leaves the `x-casaos` `main`/`port_map` pair pointing unambiguously at the site:

```yaml
name: cloudflared
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token ${TUNNEL_TOKEN}
```

Get the token from Cloudflare Zero Trust -> Networks -> Tunnels. Treat it as a
secret; it authenticates the connector to your account.

### Tunnel hygiene

- The tunnel terminates TLS at Cloudflare's edge and reaches the origin over
  plain HTTP on the LAN. That is expected and fine for this topology.
- Once the tunnel is live, consider dropping the `ports:` publish from
  `zimaos-compose.yaml` and giving `cloudflared` a shared Docker network
  instead, so the site is reachable *only* through Cloudflare. That trade-off
  costs you the ZimaOS dashboard tile link and LAN access.
- Sign-in uses an httpOnly session cookie (Better Auth). Set `BETTER_AUTH_URL`
  to the public `https://` origin so the cookie is issued with `Secure`.

## 5. Backups

**Not yet built. This is the outstanding gap.** The bind mount is not a backup:
it is one directory on one disk, and it holds the only copy of the giving
records, the directory and the member photos.

Two things make this less obvious than it looks:

- **A SQLite file copied while it is being written is not a usable backup.** The
  database runs in WAL mode, so a plain `cp` can capture a file whose committed
  state lives in a `-wal` sidecar you did not copy. Use SQLite's own
  `VACUUM INTO '<destination>'`, which writes a consistent single-file snapshot
  while the app keeps running.
- **The photos are not in the database.** `server/lib/uploads.ts` writes them
  beside it, so a backup covering only the `.db` file restores a directory whose
  faces are all missing. Back up the whole `/DATA/AppData/lifegate-production/data`
  directory, with the snapshot in place of the live `.db`.

Restore is the half worth rehearsing: the point of a backup is the restore, and
an untested one is a guess. Stand up staging from a production snapshot once --
then delete it, because staging must not hold real member data.

## What does NOT work on this target

Two legacy handlers -- `/api/giving` and `/api/pastoral-candidates` -- still read
`event.context.cloudflare.env.db`, the Cloudflare **D1** binding, which does not
exist on Node, so they return **500**. `server/utils/email.ts` has the same
dependency on the `EMAIL` binding and survives only for `/api/giving`.

Neither is a straight port, which is why they are still here:

- **Giving** has no payment processor, and the `gifts` table it writes to is
  stewardship's (`count_id` NOT NULL, foreign-keyed to an offering count), so
  its insert could not succeed even on Workers. It also redirects to
  `/giving/checkout`, which does not exist.
- **Pastoral candidates** has no `pastoral_applications` table, never stores the
  uploaded résumé, and its SQL uses `references`, a reserved word.

Both need a decision about what they should be, not a migration. Until then they
remain in `/sitemap.xml` -- **remove them from `server/routes/sitemap.xml.ts`
before setting `NUXT_PUBLIC_INDEXABLE=true`**, or launch advertises two broken
forms to search engines.

`/api/contact` **was** in this list and is fixed: it uses the app's own mail
layer, escapes what visitors type, and reports a delivery failure instead of
thanking them for a message that never arrived.

Accounts, the directory, ministries, profiles, people admin and sermons already
use SQLite and work on this target once the database and environment are set up.

The box needs outbound HTTPS to YouTube for sermon thumbnails and the admin
"Check" button. The build needs network access too: Nuxt Scripts downloads the
YouTube player loader during `nuxi build`.

## Sitemap

`server/routes/sitemap.xml.ts` emits 8 static paths plus one entry per ministry
in the `ministries` table (19 seeded by migration), read per request.

The `middleware: 'auth'` routes -- `/members`, `/directory`, `/calendar`,
`/profile`, `/admin/*` -- are excluded by design, as is `/login`.

### robots.txt

`server/routes/robots.txt.ts` is a server route rather than a static
`public/robots.txt`, so its output follows the same runtime settings as the
sitemap. While `NUXT_PUBLIC_INDEXABLE` is `false` it allows all crawling (so
crawlers can see the `noindex` header) and lists no sitemap. When `true`, it
disallows the gated areas and advertises `NUXT_PUBLIC_SITE_URL/sitemap.xml`.

It deliberately does not disallow `/login` or `/api/` in preview mode: doing so
blocked automated testing tools from the preview host.

Still worth submitting the sitemap in Google Search Console; robots.txt only
helps crawlers that already found the domain.

## Access control

Member pages are gated during SSR from the session cookie
(`app/middleware/auth.ts`), and every data route checks permissions itself
(`requirePermission`). `curl http://<host>/directory` without a session gets a
302 to `/login` and no roster. The robots.txt `Disallow` rules are crawl
hygiene, not access control.

## Building for Cloudflare instead

The preset is pinned but env-overridable:

```
NITRO_PRESET=cloudflare_pages npm run build
```
