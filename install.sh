#!/usr/bin/env sh
set -eu

exec npx --yes github:tombelieber/codex-auto-pilot#v0.2.0 install "$@"
