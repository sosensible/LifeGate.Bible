# syntax=docker/dockerfile:1
# check=skip=FromPlatformFlagConstDisallowed
#
# The constant `--platform=linux/amd64` on BOTH stages below is deliberate, not
# an oversight: the deploy target is one known Intel ZimaOS box, and pinning it
# means a bare `docker build .` on an Apple Silicon laptop cannot silently
# produce an image that pulls fine and then refuses to start. The check is
# skipped rather than satisfied so that guarantee survives.

# Lifegate church site -> self-hosted Nitro node-server, packaged for the
# Intel (x86_64) ZimaOS box and published over a Cloudflare Tunnel.

# ---------------------------------------------------------------- build ----
# Pinned to the TARGET architecture, not the builder's.
#
# This stage used to run on $BUILDPLATFORM, which was fast and correct while
# `nuxi build` emitted pure JavaScript. It no longer does: better-sqlite3 is a
# native addon, Nitro cannot bundle one, so the build now emits
#
#   .output/server/node_modules/better-sqlite3/build/Release/better_sqlite3.node
#
# compiled for whatever ran `npm ci`. Built on an Apple Silicon laptop that is
# an arm64 binary, and the amd64 runtime below cannot load it.
#
# `docker buildx build --platform linux/amd64` does NOT fix this on its own --
# that sets TARGETPLATFORM, while a $BUILDPLATFORM stage keeps running native.
# The constant here is what actually decides which binary is produced.
#
# On an amd64 machine (a GitHub runner, the Intel box) this is free. On Apple
# Silicon it means QEMU, so `npm ci` is slow; build in CI rather than locally.
FROM --platform=linux/amd64 node:24-slim AS build

WORKDIR /src

# Deps first so the layer caches across source-only edits.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Explicit, so the image never inherits an auto-detected Cloudflare preset.
ENV NITRO_PRESET=node-server
RUN npm run build

# -------------------------------------------------------------- runtime ----
# Pinned to the ZimaOS host arch. Carries only .output/ -- no source, no build
# toolchain (.output brings the runtime dependencies it needs with it).
#
# Debian rather than Alpine, and that is not a preference. The build stage is
# node:24-slim (glibc); Alpine is musl. better_sqlite3.node compiled against
# glibc will not load on musl, so the old slim-builds-alpine-runs pairing could
# not have worked on any machine, whatever the architecture. Both stages must
# agree on the C library. The cost is roughly 140 MB of image.
FROM --platform=linux/amd64 node:24-slim AS runtime

WORKDIR /app

# NUXT_PUBLIC_SITE_URL / NUXT_PUBLIC_INDEXABLE: the public origin this
# deployment answers on, and whether search engines may index it. Nothing is
# prerendered, so both are read per-request -- override them in the compose file
# and restart, no rebuild or re-push. Defaults are the safe preview combination.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NUXT_PUBLIC_SITE_URL=https://new.lifegate.bible \
    NUXT_PUBLIC_INDEXABLE=false

# 0.0.0.0 is correct *inside* the container -- it has its own network
# namespace. Loopback-only exposure on the host is done by the compose port
# publish, not here.

COPY --from=build /src/.output ./.output

# The schema, applied at startup by server/plugins/migrate.ts. drizzle-kit is a
# build-time tool and is deliberately not in this image; only the .sql files it
# generated are needed to bring a volume up to date.
COPY --from=build /src/server/database/migrations ./server/database/migrations

# Everything that must outlive the container: the SQLite database and the
# member photos beside it (server/lib/uploads.ts puts them in the database's
# own directory). Created and owned before dropping to `node`, because a
# process that cannot write here cannot start.
#
# Declaring the volume means `docker run` without a mount still keeps the data
# somewhere rather than in the container's writable layer, where the first
# restart would take the directory and every gift record in it.
RUN mkdir -p /app/.data && chown -R node:node /app/.data
VOLUME ["/app/.data"]

# Checks the native SQLite module before starting, so a wrong-architecture
# build says so in one sentence instead of failing deep inside a dependency.
COPY --from=build /src/deploy/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# scripts/create-admin.ts and the exact source files it imports -- not the
# whole server, just this one script's dependency graph, traced by hand:
# auth.ts, db.ts, audit.ts, mail.ts, the schema, and the roles it reads.
#
# A fresh deployment has an empty database and nobody in it yet, so this is
# the bootstrap path -- run with `docker exec` once the app is up:
#
#   docker exec -it <container> node scripts/create-admin.ts \
#     someone@example.org "Full Name"
#
# It runs as a plain source file: this repo's scripts already run on Node's
# own TypeScript support with no build step (see the admin:create npm script),
# so nothing here needs compiling. The symlink below is what lets its bare
# imports (better-auth, drizzle-orm, ...) resolve -- Node walks up from
# /app/server/lib/*.ts looking for a node_modules folder, and everything
# those packages need is already in .output/server/node_modules because the
# running server depends on the same packages.
COPY --from=build /src/scripts/create-admin.ts ./scripts/create-admin.ts
COPY --from=build /src/server/lib/auth.ts ./server/lib/auth.ts
COPY --from=build /src/server/lib/db.ts ./server/lib/db.ts
COPY --from=build /src/server/lib/audit.ts ./server/lib/audit.ts
COPY --from=build /src/server/lib/mail.ts ./server/lib/mail.ts
COPY --from=build /src/server/database/schema ./server/database/schema
COPY --from=build /src/shared/auth ./shared/auth
RUN ln -s .output/server/node_modules node_modules

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
