#!/usr/bin/env bash
set -euo pipefail
for path in clients/rust/Cargo.toml clients/typescript/package.json clients/dart/pubspec.yaml .zpkg.toml; do test -f "$path" || { echo "missing $path" >&2; exit 1; }; done
