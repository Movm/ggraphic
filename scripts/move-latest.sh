#!/bin/bash
# Moves `latest` to the newest `alpha` of every public @ggraphic package.
# Run it by hand after a release when the workflow's "Point latest at the published versions"
# step could not set the tag. Needs an npm login with 2FA in your own terminal.
set -euo pipefail
cd "$(dirname "$0")/.."
pkgs=$(pnpm -r ls --depth -1 --json | jq -r '.[] | select(.private | not) | select(.name | startswith("@ggraphic/")) | .name')
for pkg in $pkgs; do
  alpha=$(npm view "$pkg" dist-tags.alpha 2>/dev/null || true)
  latest=$(npm view "$pkg" dist-tags.latest 2>/dev/null || true)
  if [ -z "$alpha" ]; then echo "skip $pkg: no alpha tag"; continue; fi
  if [ "$alpha" = "$latest" ]; then echo "ok   $pkg: latest = $alpha"; continue; fi
  echo "move $pkg: latest $latest -> $alpha"
  npm dist-tag add "$pkg@$alpha" latest
done
