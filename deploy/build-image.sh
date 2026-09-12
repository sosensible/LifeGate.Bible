#!/usr/bin/env bash
# Build the linux/amd64 image for the ZimaOS box and save it as a loadable tar.
#
# There is no git remote or container registry on this project yet, so the
# default path is save -> scp -> docker load. Set REGISTRY to push instead.
#
#   ./deploy/build-image.sh                      # -> deploy/out/lifegate-church-<ver>.tar
#   REGISTRY=ghcr.io/sosapps ./deploy/build-image.sh   # build + push
#   SITE_URL=https://lifegate.bible ./deploy/build-image.sh  # sitemap hostname
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
IMAGE="lifegate-church:${VERSION}"
REGISTRY="${REGISTRY:-}"

# Baked into the prerendered /sitemap.xml at image build time. Must be the
# canonical public hostname, not the tunnel's own *.trycloudflare.com address.
SITE_URL="${SITE_URL:-https://lifegate.bible}"

# --platform is the load-bearing flag here. Omit it on an Apple Silicon
# machine and you get an arm64 image that will not start on the Intel host.
PLATFORM="linux/amd64"

if [[ -n "$REGISTRY" ]]; then
  REMOTE="${REGISTRY}/${IMAGE}"
  echo "==> Building and pushing ${REMOTE} (${PLATFORM}, sitemap host ${SITE_URL})"
  docker buildx build --platform "$PLATFORM" \
    --build-arg "SITE_URL=${SITE_URL}" -t "$REMOTE" --push .
  echo "==> Pushed. Set 'image: ${REMOTE}' in deploy/zimaos-compose.yaml"
else
  mkdir -p deploy/out
  TAR="deploy/out/lifegate-church-${VERSION}.tar"
  echo "==> Building ${IMAGE} (${PLATFORM}, sitemap host ${SITE_URL})"
  docker buildx build --platform "$PLATFORM" \
    --build-arg "SITE_URL=${SITE_URL}" -t "$IMAGE" --load .
  echo "==> Saving ${TAR}"
  docker save "$IMAGE" -o "$TAR"
  echo
  echo "Image: ${IMAGE}"
  echo "Tar:   ${TAR} ($(du -h "$TAR" | cut -f1))"
  echo
  echo "Next, on the ZimaOS box:"
  echo "  scp ${TAR} <user>@<zima>:/DATA/"
  echo "  ssh <user>@<zima> 'docker load -i /DATA/$(basename "$TAR")'"
  echo "Then paste deploy/zimaos-compose.yaml into App Store -> Install a Custom App."
fi
