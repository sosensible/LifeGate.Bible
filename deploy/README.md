# Deploying to the Intel ZimaOS box behind a Cloudflare Tunnel

Target: self-hosted Nitro **node-server** in a Docker container on x86_64 ZimaOS,
published to the public by `cloudflared`. Public pages only.

## Why Docker and not a systemd service

ZimaOS runs an immutable, read-only root filesystem and installs applications as
Docker containers through its App Store. Hand-placed systemd units and files
dropped onto `/` do not survive OTA updates. A container is the supported unit of
deployment here, so that is what `../Dockerfile` produces.

## Architecture note

> **Out of date since accounts were added.** `.output/` now includes
> `better-sqlite3`'s native `.node` binary, built for the machine that ran the
> build. A Mac-built `.output/` will not run on the Intel box; the build stage
> must run as `linux/amd64` (or rebuild that module for it). Everything below
> describes the earlier, JavaScript-only build.

`nuxi build` emitted pure ESM JavaScript into `.output/` with **zero native
binaries**. That makes the build artifact architecture-neutral, so the Dockerfile
compiles in a `$BUILDPLATFORM` stage (fast and native on an Apple Silicon laptop)
and copies the result into a `linux/amd64` runtime stage for the Intel host. No
QEMU emulation, no cross-compile.

The arch-specific toolchain (`rollup`, `@tailwindcss/oxide`) is installed for the
builder's own arch and never reaches the runtime image.

## 1. Build

```
./deploy/build-image.sh
```

Produces `deploy/out/lifegate-church-<version>.tar`. Requires Docker Desktop running.

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

> Not yet covered by this runbook: the database volume, `BETTER_AUTH_*` and
> mail environment variables, running migrations on the box, and building
> `better-sqlite3`'s native module for amd64. Until then this path serves the
> public pages only.

### Always build for amd64

The classic failure mode is pushing an arm64 image from an Apple Silicon laptop;
it pulls fine and then will not start on the Intel box. `deploy/build-image.sh`
always passes `--platform linux/amd64`. If you run `docker buildx build` by hand,
pass it yourself.

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

SSH must be enabled in ZimaOS settings. Skip this step entirely if you pushed to
a registry.

## 3. Install the app

ZimaOS **App Store -> Install a Custom App**, then paste `zimaos-compose.yaml`.

It publishes container port 3000 on host port **3007**. Verify on the LAN before
touching the tunnel:

```
curl -I http://<zima-ip>:3007/
```

Expect `200`. All seven public pages plus all 27 `/sitemap.xml` URLs were
confirmed serving 200 from this build.

## 4. Point the tunnel at it

Add an ingress rule to the tunnel's public hostname:

```
service: http://<zima-ip>:3007
```

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

## What does NOT work on this target

The remaining legacy handlers -- `/api/contact`, `/api/giving`,
`/api/pastoral-candidates` -- still read `event.context.cloudflare.env.db`, the
Cloudflare **D1** binding, which does not exist on Node, so they return **500**.
`server/utils/email.ts` has the same dependency on the `EMAIL` binding. They are
being moved to SQLite phase by phase.

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
