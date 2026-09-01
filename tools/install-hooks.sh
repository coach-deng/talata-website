#!/bin/sh
# Install the repo's git hooks. Hooks live outside version control, so this
# has to be run once per clone.
#
#   sh tools/install-hooks.sh
set -e
ROOT="$(git rev-parse --show-toplevel)"
for h in "$ROOT"/tools/hooks/*; do
  n="$(basename "$h")"
  cp "$h" "$ROOT/.git/hooks/$n"
  chmod +x "$ROOT/.git/hooks/$n"
  echo "installed $n"
done
echo ""
echo "pre-push now runs tools/ship.py. Bypass a single push with --no-verify."
