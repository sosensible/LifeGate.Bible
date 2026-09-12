# Deploying to the Intel ZimaOS box behind a Cloudflare Tunnel

Target: self-hosted Nitro **node-server** in a Docker container on x86_64 ZimaOS,
published to the public by `cloudflared`. Public pages only.

## Why Docker and not a systemd service

ZimaOS runs an immutable, read-only root filesystem and installs applications as
Docker containers through its App Store. Hand-placed systemd units and files
dropped onto `/` do not survive OTA updates. A container is the supported unit of
deployment here, so that is what `../Dockerfile` produces.

## Architecture note

`nuxi build` emits pure ESM JavaScript into `.output/` with **zero native
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

### Do not push a public image once real member data lands

`app/data/directory.ts` is bundled into the build, so member names, emails and
phone numbers would be baked into the image layers. On a public Docker Hub repo
that is permanent, world-pullable publication of member PII, and registry layer
history means deleting the tag later does not reliably undo it.

While that file holds demo data this is a non-issue. The moment it holds real
member records, switch to save/load or a private repo. This is the same
underlying problem as the SSR gap documented further down: member data currently
lives in the client bundle rather than behind an authenticated API.

### Always build for amd64

The classic failure mode is pushing an arm64 image from an Apple Silicon laptop;
it pulls fine and then will not start on the Intel box. `deploy/build-image.sh`
always passes `--platform linux/amd64`. If you run `docker buildx build` by hand,
pass it yourself.

Tags are pinned, not `latest`, so ZimaOS never silently swaps versions under you.
Deploying a new build means bumping the version in `package.json`, rebuilding,
and updating `image:` in the compose YAML.

### Sitemap hostname is a build-time input

`/sitemap.xml` is prerendered, so its absolute URLs are frozen when the image is
built. Setting `NUXT_PUBLIC_SITE_URL` in the container environment does nothing.
Defaults to `https://lifegate.bible`; override with:

```
SITE_URL=https://lifegate.bible ./deploy/build-image.sh
```

Keep this the canonical hostname even though traffic arrives through the tunnel.
A sitemap advertising `*.trycloudflare.com` URLs is worse than no sitemap.

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
- No cookies are set by the app (the member gate is `localStorage`-based), so
  there is no `Secure`/`SameSite` flag to reconcile behind the proxy.

## What does NOT work on this target

Every handler under `server/routes/api/` reads `event.context.cloudflare.env.db`
— the Cloudflare **D1** binding. That context object exists only in the Workers
runtime; on Node it is `undefined` and each route returns **500**:

```
GET /api/sermons -> 500  {"message":"Failed to fetch sermons"}
```

`server/utils/email.ts` has the same dependency on the `EMAIL` binding.

Affected: the contact, giving and pastoral-candidate form submissions, plus
`/admin/directory` and `/api/auth/login`.

**Not** affected, and the reason this deployment is still useful: every public
page. They render from `app/data/` and the member gate is client-side. Nothing a
visitor can reach on the public site calls these endpoints.

Resolving this later means picking one of: a local SQLite adapter behind the same
`.prepare()/.bind()/.all()` shape, D1's HTTP REST API, or explicitly gating the
routes and forms off. None is needed to ship the public site.

## Sitemap

`server/routes/sitemap.xml.ts` emits 8 static paths plus one entry per ministry
from `app/data/directory.ts` (19 at present), so adding a ministry updates the
sitemap on the next build with no edit here.

The four `middleware: 'auth'` routes -- `/members`, `/directory`, `/calendar`,
`/admin/directory` -- are excluded by design, as is `/login`.

### robots.txt

`server/routes/robots.txt.ts` advertises the sitemap and keeps crawlers off the
gated areas. It is a server route rather than a static `public/robots.txt` so the
`Sitemap:` hostname comes from the same `siteUrl` config the sitemap uses -- one
`SITE_URL=` value updates both. Also prerendered, so also build-time.

Still worth submitting the sitemap in Google Search Console; robots.txt only
helps crawlers that already found the domain.

## Known gap: member pages are not actually protected server-side

`app/middleware/auth.ts` returns early during SSR (`if (import.meta.server) return`)
because the invite-code token lives in `localStorage`. The redirect therefore
happens only after hydration, which means the server renders the full page first.
Confirmed:

```
curl http://<host>/directory   # returns roster HTML, before any gate runs
```

The `Disallow` rules in robots.txt are crawl hygiene, **not** access control --
well-behaved crawlers honour them and nothing else does.

This is currently harmless: `app/data/directory.ts` holds demo data only. It must
be fixed with a server-side check before real member data ships. Doing that means
a real server-validated session (the `Server-validated auth + role checks come
with the portal phase` note in that middleware), which is the same work as
resolving the D1 gap below.

## Building for Cloudflare instead

The preset is pinned but env-overridable:

```
NITRO_PRESET=cloudflare_pages npm run build
```
