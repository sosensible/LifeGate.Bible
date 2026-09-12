# syntax=docker/dockerfile:1
# check=skip=FromPlatformFlagConstDisallowed
#
# The constant `--platform=linux/amd64` on the runtime stage below is deliberate,
# not an oversight: the deploy target is one known Intel ZimaOS box, and pinning
# it means a bare `docker build .` on an Apple Silicon laptop cannot silently
# produce an arm64 image that pulls fine and then refuses to start. The check is
# skipped rather than satisfied so that guarantee survives.

# Lifegate church site -> self-hosted Nitro node-server, packaged for the
# Intel (x86_64) ZimaOS box and published over a Cloudflare Tunnel.

# ---------------------------------------------------------------- build ----
# Runs on the NATIVE platform of whichever machine builds the image, so an
# Apple Silicon laptop builds at full speed with no QEMU emulation.
#
# This is safe *specifically* because `nuxi build` emits pure ESM JavaScript
# into .output/ with zero native binaries (verified: no .node/.dylib/.so).
# The arch-specific toolchain -- rollup, @tailwindcss/oxide -- is installed
# for the builder's own arch and never leaves this stage.
FROM --platform=$BUILDPLATFORM node:24-slim AS build

WORKDIR /src

# Deps first so the layer caches across source-only edits.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# /sitemap.xml is prerendered, so its absolute URLs are baked HERE, at image
# build time -- setting NUXT_PUBLIC_SITE_URL in the container environment later
# has no effect on the generated file. Override per-build with:
#   docker buildx build --build-arg SITE_URL=https://example.org ...
ARG SITE_URL=https://lifegate.bible
ENV NUXT_PUBLIC_SITE_URL=$SITE_URL

# Explicit, so the image never inherits an auto-detected Cloudflare preset.
ENV NITRO_PRESET=node-server
RUN npm run build

# -------------------------------------------------------------- runtime ----
# Pinned to the ZimaOS host arch. Carries only .output/ -- no node_modules,
# no source, no build toolchain.
FROM --platform=linux/amd64 node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# 0.0.0.0 is correct *inside* the container -- it has its own network
# namespace. Loopback-only exposure on the host is done by the compose port
# publish, not here.

COPY --from=build /src/.output ./.output

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
