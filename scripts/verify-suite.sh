#!/usr/bin/env bash
# Run the checks required before a coordinated Sidera release.
#
# Contract-only:
#   bash scripts/verify-suite.sh
#
# Full local suite:
#   SDK_DIR=../sidera-sdk APP_DIR=../sidera-app bash scripts/verify-suite.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK_DIR="${SDK_DIR:-}"
APP_DIR="${APP_DIR:-}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

run_step() {
  echo
  echo "== $* =="
}

require_dir() {
  [ -d "$1" ] || fail "directory does not exist: $1"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

run_step "Contract formatting"
(cd "$ROOT" && cargo fmt --all -- --check)

run_step "Contract lint"
(cd "$ROOT" && cargo clippy --workspace --all-targets --locked -- -D warnings)

run_step "Contract tests"
(cd "$ROOT" && cargo test --workspace --all-targets --locked)

run_step "Contract documentation"
(cd "$ROOT" && RUSTDOCFLAGS=-Dwarnings cargo doc --workspace --no-deps --locked --document-private-items)

if [ -n "$SDK_DIR" ]; then
  require_dir "$SDK_DIR"
  require_command npm
  run_step "SDK typecheck"
  (cd "$SDK_DIR" && npm run lint)
  run_step "SDK tests"
  (cd "$SDK_DIR" && npm test)
  run_step "SDK build"
  (cd "$SDK_DIR" && npm run build)
else
  echo
  echo "SDK checks skipped: set SDK_DIR to the sidera-sdk checkout"
fi

if [ -n "$APP_DIR" ]; then
  require_dir "$APP_DIR"
  require_command npm
  run_step "Dashboard typecheck"
  (cd "$APP_DIR" && npm run lint)
  run_step "Dashboard build"
  (cd "$APP_DIR" && npm run build)
else
  echo
  echo "Dashboard checks skipped: set APP_DIR to the sidera-app checkout"
fi

echo
echo "Sidera verification suite passed."
