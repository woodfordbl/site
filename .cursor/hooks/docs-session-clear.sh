#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cat >/dev/null
node scripts/docs-hook-session-clear.mjs
