#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Runs the render gate (stage 2) in the official Playwright image, the one place its goldens are
# made and checked: they depend on the browser's text rasteriser.
#
#   scripts/gate-render-docker.sh          check the pages against the goldens
#   scripts/gate-render-docker.sh update   rewrite the goldens in apps/studio/e2e/__goldens__
#
# The repository is mounted read-only and copied into the named volume ggraphic-gate-work, where
# the Linux dependencies are installed; the host's node_modules (macOS binaries) is never touched.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
mode=${1:-check}
version=$(node -p "require('$root/apps/studio/package.json').devDependencies['@playwright/test']")
pnpm_version=$(node -p "require('$root/package.json').packageManager.split('@')[1]")
goldens="$root/apps/studio/e2e/__goldens__"
mkdir -p "$goldens"

docker run --rm --init \
  -e GATE_MODE="$mode" -e PNPM_VERSION="$pnpm_version" -e CI=1 \
  -v "$root":/repo:ro \
  -v "$goldens":/out \
  -v ggraphic-gate-work:/work \
  -v ggraphic-gate-pnpm-store:/pnpm-store \
  -w /work \
  "mcr.microsoft.com/playwright:v${version}-noble" \
  bash -euo pipefail -c '
    # Files deleted on the host must not linger: clear the copy, keeping only installed dependencies.
    find /work -name node_modules -prune -o ! -type d -exec rm -f {} +
    find /work -mindepth 1 -type d -empty ! -path "*/node_modules/*" ! -name node_modules -delete
    tar -C /repo --exclude=node_modules --exclude=.git --exclude=dist -cf - . | tar -C /work -xf -
    npm install --global --silent "pnpm@${PNPM_VERSION}"
    pnpm config set store-dir /pnpm-store
    pnpm install --frozen-lockfile --filter "@ggraphic/studio..."
    if [ "$GATE_MODE" = update ]; then
      rm -rf /work/apps/studio/e2e/__goldens__
      pnpm --filter @ggraphic/studio gate:render:update
      find /out -mindepth 1 -delete
      cp -r /work/apps/studio/e2e/__goldens__/. /out/
    else
      pnpm --filter @ggraphic/studio gate:render
    fi
  '
