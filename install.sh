#!/usr/bin/env sh
set -eu

exec npx --yes --allow-git=all github:tombelieber/codex-auto-pilot install "$@"
