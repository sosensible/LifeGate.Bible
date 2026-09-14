#!/usr/bin/env bash
# Build the linux/amd64 image for the ZimaOS box and save it as a loadable tar.
#
# There is no git remote or container registry on this project yet, so the
# default path is save -> scp -> docker load. Set REGISTRY to push instead.
#
#   ./deploy/build-image.sh                      # -> deploy/out/lifegate-church-<ver>.tar
#   REGISTRY=ghcr.io/sosapps ./deploy/build-image.sh   # build + push
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
IMAGE="lifegate-church:${VERSION}"
REGISTRY="${REGISTRY:-}"


# --platform is the load-bearing flag here. Omit it on an Apple Silicon
# machine and you get an arm64 image that will not start on the Intel host.
PLATFORM="linux/amd64"

if [[ -n "$REGISTRY" ]]; then
  REMOTE="${REGISTRY}/${IMAGE}"
  echo "==> Building and pushing ${REMOTE} (${PLATFORM})"
  docker buildx build --platform "$PLATFORM" -t "$REMOTE" --push .
  echo "==> Pushed. Set 'image: ${REMOTE}' in deploy/zimaos-compose.yaml"
else
  mkdir -p deploy/out
  TAR="deploy/out/lifegate-church-${VERSION}.tar"
  echo "==> Building ${IMAGE} (${PLATFORM})"
  docker buildx build --platform "$PLATFORM" -t "$IMAGE" --load .
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
